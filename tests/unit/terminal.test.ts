import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { exec } from 'node:child_process';

// Mock child_process before importing the module
vi.mock('node:child_process', () => {
  const mockSpawn = vi.fn();
  const mockExec = vi.fn();
  return {
    spawn: mockSpawn,
    exec: mockExec,
  };
});

const mockedSpawn = vi.mocked(spawn);
const mockedExec = vi.mocked(exec);

describe('openInNewTerminal', () => {
  let openInNewTerminal: typeof import('../../src/core/terminal.js').openInNewTerminal;

  beforeEach(async () => {
    vi.resetModules();
    vi.resetAllMocks();

    // Re-import to get fresh module with mocks
    const mod = await import('../../src/core/terminal.js');
    openInNewTerminal = mod.openInNewTerminal;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should use $TERMINAL env var when set', async () => {
    process.env.TERMINAL = 'alacritty';

    // Mock `which` succeeding for alacritty
    mockedExec.mockImplementation(((
      cmd: string,
      _opts: unknown,
      cb?: (err: Error | null, result: { stdout: string; stderr: string }) => void,
    ) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      if (cmd.includes('which')) {
        callback!(null, { stdout: '/usr/bin/alacritty\n', stderr: '' });
      }
      return {} as ReturnType<typeof exec>;
    }) as typeof exec);

    const mockChild = { unref: vi.fn() } as unknown as ReturnType<typeof spawn>;
    mockedSpawn.mockReturnValue(mockChild);

    await openInNewTerminal('claude "test"', '/tmp/worktree');

    expect(mockedSpawn).toHaveBeenCalledWith(
      'alacritty',
      expect.arrayContaining(['--working-directory', '/tmp/worktree']),
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    );

    delete process.env.TERMINAL;
  });

  it('should spawn detached process for GUI terminals', async () => {
    delete process.env.TERMINAL;

    // Mock finding gnome-terminal
    let callCount = 0;
    mockedExec.mockImplementation(((
      cmd: string,
      _opts: unknown,
      cb?: (err: Error | null, result: { stdout: string; stderr: string }) => void,
    ) => {
      const callback = typeof _opts === 'function' ? _opts : cb;
      if (cmd === 'which gnome-terminal') {
        callback!(null, { stdout: '/usr/bin/gnome-terminal\n', stderr: '' });
      } else if (cmd.includes('which')) {
        callback!(new Error('not found'), { stdout: '', stderr: '' });
      }
      return {} as ReturnType<typeof exec>;
    }) as typeof exec);

    const mockChild = { unref: vi.fn() } as unknown as ReturnType<typeof spawn>;
    mockedSpawn.mockReturnValue(mockChild);

    await openInNewTerminal('claude "test"', '/tmp/worktree');

    expect(mockedSpawn).toHaveBeenCalledWith(
      'gnome-terminal',
      expect.any(Array),
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    );
    expect(mockChild.unref).toHaveBeenCalled();
  });
});
