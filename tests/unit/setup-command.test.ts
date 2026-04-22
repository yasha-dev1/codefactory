import { vi, describe, it, expect, beforeEach } from 'vitest';

// All external collaborators are mocked so the unit under test is purely
// the routing/persistence logic in setup.ts.

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

vi.mock('../../src/ui/prompts.js', () => ({
  selectPrompt: vi.fn(),
  confirmPrompt: vi.fn(),
  inputPrompt: vi.fn(),
  multiselectPrompt: vi.fn(),
}));

vi.mock('../../src/utils/git.js', () => ({
  isGitRepo: vi.fn(),
  getRepoRoot: vi.fn(),
}));

vi.mock('../../src/commands/init.js', () => ({
  initCommand: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
  };
});

import { readFile, writeFile } from 'node:fs/promises';
import { isGitRepo, getRepoRoot } from '../../src/utils/git.js';
import { selectPrompt } from '../../src/ui/prompts.js';
import { initCommand } from '../../src/commands/init.js';
import { setupCommand } from '../../src/commands/setup.js';
import { NotAGitRepoError } from '../../src/utils/errors.js';

const mockedIsGitRepo = vi.mocked(isGitRepo);
const mockedGetRepoRoot = vi.mocked(getRepoRoot);
const mockedSelectPrompt = vi.mocked(selectPrompt);
const mockedInitCommand = vi.mocked(initCommand);
const mockedReadFile = vi.mocked(readFile);
const mockedWriteFile = vi.mocked(writeFile);

describe('setupCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedIsGitRepo.mockResolvedValue(true);
    mockedGetRepoRoot.mockResolvedValue('/fake/repo');
    mockedReadFile.mockResolvedValue('{}');
  });

  it('throws NotAGitRepoError when invoked outside a git repo', async () => {
    mockedIsGitRepo.mockResolvedValue(false);
    await expect(setupCommand({})).rejects.toThrow(NotAGitRepoError);
  });

  it('delegates to initCommand without preset platform when harnext is selected', async () => {
    mockedSelectPrompt.mockResolvedValueOnce('harnext');

    await setupCommand({});

    expect(mockedInitCommand).toHaveBeenCalledTimes(1);
    const opts = mockedInitCommand.mock.calls[0][0];
    expect(opts.platform).toBeUndefined();
    // Should not have written codingAgent for harnext.
    expect(mockedWriteFile).not.toHaveBeenCalled();
  });

  it('preselects the claude platform and persists codingAgent for claude-code', async () => {
    // 1st prompt: agent picker, 2nd prompt: model picker.
    mockedSelectPrompt
      .mockResolvedValueOnce('claude-code')
      .mockResolvedValueOnce('claude-sonnet-4-6');

    await setupCommand({});

    expect(mockedInitCommand).toHaveBeenCalledTimes(1);
    expect(mockedInitCommand.mock.calls[0][0].platform).toBe('claude');

    expect(mockedWriteFile).toHaveBeenCalledTimes(1);
    const [path, body] = mockedWriteFile.mock.calls[0];
    expect(String(path)).toMatch(/harness\.config\.json$/);
    const written = JSON.parse(String(body)) as Record<string, unknown>;
    expect(written.codingAgent).toEqual({
      id: 'claude-code',
      model: 'claude-sonnet-4-6',
    });
    expect(typeof written.lastUpdated).toBe('string');
  });

  it('preselects the codex platform and persists codingAgent for codex', async () => {
    mockedSelectPrompt.mockResolvedValueOnce('codex').mockResolvedValueOnce('gpt-5.4');

    await setupCommand({});

    expect(mockedInitCommand.mock.calls[0][0].platform).toBe('codex');

    const written = JSON.parse(String(mockedWriteFile.mock.calls[0][1])) as Record<string, unknown>;
    expect(written.codingAgent).toEqual({ id: 'codex', model: 'gpt-5.4' });
  });

  it('preserves existing harness.config.json fields when persisting codingAgent', async () => {
    mockedReadFile.mockResolvedValue(
      JSON.stringify({ version: '1.0.0', riskTiers: { tier1: { name: 'low' } } }),
    );
    mockedSelectPrompt.mockResolvedValueOnce('codex').mockResolvedValueOnce('gpt-5.4');

    await setupCommand({});

    const written = JSON.parse(String(mockedWriteFile.mock.calls[0][1])) as Record<string, unknown>;
    expect(written.version).toBe('1.0.0');
    expect(written.riskTiers).toEqual({ tier1: { name: 'low' } });
    expect(written.codingAgent).toEqual({ id: 'codex', model: 'gpt-5.4' });
  });

  it('respects --coding-agent and --model flags without prompting', async () => {
    await setupCommand({ codingAgent: 'claude-code', model: 'claude-opus-4-7' });

    expect(mockedSelectPrompt).not.toHaveBeenCalled();
    expect(mockedInitCommand.mock.calls[0][0].platform).toBe('claude');
    const written = JSON.parse(String(mockedWriteFile.mock.calls[0][1])) as Record<string, unknown>;
    expect(written.codingAgent).toEqual({
      id: 'claude-code',
      model: 'claude-opus-4-7',
    });
  });

  it('rejects an unknown coding agent id passed via --coding-agent', async () => {
    await expect(setupCommand({ codingAgent: 'cursor' })).rejects.toThrow(/Unknown coding agent/);
    expect(mockedInitCommand).not.toHaveBeenCalled();
  });

  it('does not leak the codingAgent or model options into initCommand', async () => {
    await setupCommand({
      codingAgent: 'claude-code',
      model: 'claude-sonnet-4-6',
      ciProvider: 'github-actions',
      yes: true,
    });

    const opts = mockedInitCommand.mock.calls[0][0] as Record<string, unknown>;
    expect(opts).not.toHaveProperty('codingAgent');
    expect(opts).not.toHaveProperty('model');
    expect(opts.ciProvider).toBe('github-actions');
    expect(opts.yes).toBe(true);
    expect(opts.platform).toBe('claude');
  });
});
