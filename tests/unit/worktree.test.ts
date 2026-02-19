import { EventEmitter } from 'node:events';
import { vi } from 'vitest';
import { spawn } from 'node:child_process';
import { slugifyTask, generateBranchName } from '../../src/core/worktree.js';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn(),
  };
});

const spawnMock = vi.mocked(spawn);

function createMockProcess(stdout: string, exitCode: number) {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  proc.stdout = new EventEmitter();
  proc.kill = vi.fn();

  // Emit data and close on next tick
  process.nextTick(() => {
    proc.stdout.emit('data', Buffer.from(stdout));
    proc.emit('close', exitCode);
  });

  return proc;
}

describe('slugifyTask', () => {
  it('should create a branch name with cf/ prefix', () => {
    const result = slugifyTask('Add JWT auth');
    expect(result).toMatch(/^cf\//);
  });

  it('should lowercase and hyphenate the description', () => {
    const result = slugifyTask('Add JWT auth');
    expect(result).toMatch(/^cf\/add-jwt-auth-/);
  });

  it('should strip non-alphanumeric characters', () => {
    const result = slugifyTask('Fix bug #123 (urgent!)');
    expect(result).toMatch(/^cf\/fix-bug-123-urgent-/);
  });

  it('should truncate long descriptions to 50 chars before the hash', () => {
    const longDesc =
      'This is a very long task description that should be truncated to fifty characters';
    const result = slugifyTask(longDesc);
    // cf/ prefix + slug (max 50) + - + 6-char hash
    const parts = result.split('-');
    const hashPart = parts[parts.length - 1];
    expect(hashPart).toHaveLength(6);
  });

  it('should append a 6-character hash suffix', () => {
    const result = slugifyTask('Test task');
    const hash = result.split('-').pop();
    expect(hash).toMatch(/^[a-f0-9]{6}$/);
  });

  it('should produce different hashes for the same description (due to timestamp)', async () => {
    const result1 = slugifyTask('Same task');
    // Small delay to ensure different timestamp
    await new Promise((resolve) => setTimeout(resolve, 5));
    const result2 = slugifyTask('Same task');
    expect(result1).not.toBe(result2);
  });

  it('should handle empty string input', () => {
    const result = slugifyTask('');
    expect(result).toMatch(/^cf\/-[a-f0-9]{6}$/);
  });

  it('should handle description with only special characters', () => {
    const result = slugifyTask('!@#$%^&*()');
    expect(result).toMatch(/^cf\/-[a-f0-9]{6}$/);
  });
});

describe('generateBranchName', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should use Claude output when it returns a valid branch name', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    spawnMock.mockReturnValueOnce(createMockProcess('cf/feat/add-jwt-auth\n', 0) as any);

    const result = await generateBranchName('Add JWT authentication');
    expect(result).toMatch(/^cf\/feat\/add-jwt-auth-[a-f0-9]{6}$/);
  });

  it('should extract branch name from Claude output with extra text', async () => {
    spawnMock.mockReturnValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createMockProcess('Here is the branch name: cf/fix/resolve-null-check\n', 0) as any,
    );

    const result = await generateBranchName('Fix null pointer error');
    expect(result).toMatch(/^cf\/fix\/resolve-null-check-[a-f0-9]{6}$/);
  });

  it('should fall back to slugifyTask when Claude returns invalid output', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    spawnMock.mockReturnValueOnce(createMockProcess('invalid-branch-name\n', 0) as any);

    const result = await generateBranchName('Add auth');
    // Falls back to slugifyTask format: cf/<slug>-<hash>
    expect(result).toMatch(/^cf\/add-auth-[a-f0-9]{6}$/);
  });

  it('should fall back to slugifyTask when Claude exits with error', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    spawnMock.mockReturnValueOnce(createMockProcess('', 1) as any);

    const result = await generateBranchName('Add auth');
    expect(result).toMatch(/^cf\/add-auth-[a-f0-9]{6}$/);
  });

  it('should fall back to slugifyTask when spawn fails', async () => {
    const proc = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      kill: ReturnType<typeof vi.fn>;
    };
    proc.stdout = new EventEmitter();
    proc.kill = vi.fn();
    process.nextTick(() => {
      proc.emit('error', new Error('spawn ENOENT'));
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    spawnMock.mockReturnValueOnce(proc as any);

    const result = await generateBranchName('Add auth');
    expect(result).toMatch(/^cf\/add-auth-[a-f0-9]{6}$/);
  });

  it('should accept all valid conventional commit types', async () => {
    const types = ['feat', 'fix', 'refactor', 'chore', 'docs', 'test'];
    for (const type of types) {
      spawnMock.mockReturnValueOnce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        createMockProcess(`cf/${type}/some-description\n`, 0) as any,
      );
      const result = await generateBranchName(`Some ${type} task`);
      expect(result).toMatch(new RegExp(`^cf/${type}/some-description-[a-f0-9]{6}$`));
    }
  });

  it('should append a 6-character hash suffix to Claude output', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    spawnMock.mockReturnValueOnce(createMockProcess('cf/feat/add-auth\n', 0) as any);

    const result = await generateBranchName('Add authentication');
    const hash = result.split('-').pop();
    expect(hash).toMatch(/^[a-f0-9]{6}$/);
  });

  it('should pass the task description to Claude in the prompt', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    spawnMock.mockReturnValueOnce(createMockProcess('cf/feat/add-auth\n', 0) as any);

    await generateBranchName('Add JWT authentication');

    expect(spawnMock).toHaveBeenCalledWith(
      'claude',
      ['--print', expect.stringContaining('Add JWT authentication')],
      expect.any(Object),
    );
  });
});
