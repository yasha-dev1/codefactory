import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { exec as execType } from 'node:child_process';

// Use vi.hoisted so these are available inside vi.mock factories (which are hoisted above imports).
const { mockPromptStoreInstance, MockPromptStore } = vi.hoisted(() => {
  const mockPromptStoreInstance = {
    ensureDefaults: vi.fn(),
    list: vi
      .fn()
      .mockReturnValue([
        { name: 'agent-system', displayName: 'Agent System', description: 'desc' },
      ]),
    getPath: vi.fn().mockReturnValue('/tmp/test/.codefactory/prompts/agent-system.md'),
    read: vi.fn().mockResolvedValue('prompt content'),
    write: vi.fn(),
    resetToDefault: vi.fn(),
    isCustomized: vi.fn().mockResolvedValue(false),
  };

  const MockPromptStore = vi.fn().mockImplementation(() => mockPromptStoreInstance);

  return { mockPromptStoreInstance, MockPromptStore };
});

const { mockedSearch } = vi.hoisted(() => ({
  mockedSearch: vi.fn(),
}));

// Mock all external dependencies BEFORE importing the module under test

vi.mock('../../src/ui/logger.js', () => ({
  logger: {
    header: vi.fn(),
    dim: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/ui/spinner.js', () => ({
  withSpinner: vi.fn((_text: string, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('../../src/ui/prompts.js', () => ({
  inputPrompt: vi.fn(),
  selectPrompt: vi.fn(),
  confirmPrompt: vi.fn(),
}));

vi.mock('@inquirer/prompts', () => ({
  search: mockedSearch,
}));

vi.mock('../../src/utils/git.js', () => ({
  isGitRepo: vi.fn(),
  getRepoRoot: vi.fn(),
  hasUncommittedChanges: vi.fn(),
}));

vi.mock('../../src/utils/fs.js', () => ({
  readFileIfExists: vi.fn(),
  fileExists: vi.fn(),
}));

// Mock exec so that promisify(exec) works correctly.
// The callback-style mock lets `promisify` convert it to a promise.
vi.mock('node:child_process', () => ({
  exec: vi.fn((_cmd: string, cb: (err: Error | null, result?: unknown) => void) => {
    cb(null, { stdout: '/usr/bin/claude', stderr: '' });
  }),
  spawnSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  chmod: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/prompt-store.js', () => ({
  PromptStore: MockPromptStore,
}));

vi.mock('../../src/core/worktree.js', () => ({
  generateBranchName: vi.fn().mockResolvedValue('cf/feat/test-abc123'),
  createWorktree: vi.fn().mockResolvedValue({
    path: '/tmp/worktree',
    branchName: 'cf/feat/test',
  }),
}));

vi.mock('../../src/core/terminal.js', () => ({
  openInNewTerminal: vi.fn(),
}));

import { exec } from 'node:child_process';
import { isGitRepo, getRepoRoot } from '../../src/utils/git.js';
import { replCommand } from '../../src/commands/repl.js';
import { NotAGitRepoError, ClaudeNotFoundError } from '../../src/utils/errors.js';

const mockedExec = vi.mocked(exec);
const mockedIsGitRepo = vi.mocked(isGitRepo);
const mockedGetRepoRoot = vi.mocked(getRepoRoot);

describe('replCommand', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock process.exit so the REPL loop can be broken without killing the test runner.
    // We throw an error so the test can catch and assert on exit behavior.
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('should throw NotAGitRepoError when not in a git repo', async () => {
    mockedIsGitRepo.mockResolvedValue(false);

    await expect(replCommand()).rejects.toThrow(NotAGitRepoError);
    expect(mockedIsGitRepo).toHaveBeenCalledOnce();
  });

  it('should throw ClaudeNotFoundError when claude is not installed', async () => {
    mockedIsGitRepo.mockResolvedValue(true);

    // Make exec reject (simulates `which claude` failing)
    mockedExec.mockImplementation(
      (_cmd: string, cb: (err: Error | null, result?: unknown) => void) => {
        cb(new Error('not found'));
        return undefined as unknown as ReturnType<typeof execType>;
      },
    );

    await expect(replCommand()).rejects.toThrow(ClaudeNotFoundError);
  });

  it('should initialize PromptStore on start', async () => {
    mockedIsGitRepo.mockResolvedValue(true);
    mockedGetRepoRoot.mockResolvedValue('/fake/repo');

    // exec succeeds (claude is installed)
    mockedExec.mockImplementation(
      (_cmd: string, cb: (err: Error | null, result?: unknown) => void) => {
        cb(null, { stdout: '/usr/bin/claude', stderr: '' });
        return undefined as unknown as ReturnType<typeof execType>;
      },
    );

    // Simulate user pressing Ctrl+C on the search prompt.
    // The REPL catches errors where `error.constructor.name === 'ExitPromptError'`
    // and calls `process.exit(0)`, which our spy converts into a thrown Error.
    class ExitPromptError extends Error {
      constructor() {
        super('exit');
        this.name = 'ExitPromptError';
        Object.defineProperty(this.constructor, 'name', { value: 'ExitPromptError' });
      }
    }

    mockedSearch.mockRejectedValueOnce(new ExitPromptError());

    // replCommand will call process.exit(0) when it catches ExitPromptError,
    // which our spy converts into a thrown Error('process.exit').
    await expect(replCommand()).rejects.toThrow('process.exit');

    // Verify PromptStore was constructed with the repo root
    expect(MockPromptStore).toHaveBeenCalledWith('/fake/repo');

    // Verify ensureDefaults was called to initialize prompt files
    expect(mockPromptStoreInstance.ensureDefaults).toHaveBeenCalledOnce();

    // Verify process.exit was called with 0 (clean exit on Ctrl+C)
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});
