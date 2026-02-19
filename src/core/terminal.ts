import { spawn } from 'node:child_process';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const KNOWN_TERMINALS = [
  'gnome-terminal',
  'konsole',
  'xfce4-terminal',
  'alacritty',
  'kitty',
  'wezterm',
  'x-terminal-emulator',
  'xterm',
] as const;

async function findTerminal(): Promise<string | null> {
  // Check $TERMINAL env var first
  const envTerminal = process.env.TERMINAL;
  if (envTerminal) {
    try {
      await execAsync(`which "${envTerminal}"`);
      return envTerminal;
    } catch {
      // env var set but not found — fall through
    }
  }

  // Try known terminals in order
  for (const terminal of KNOWN_TERMINALS) {
    try {
      await execAsync(`which ${terminal}`);
      return terminal;
    } catch {
      // not found — try next
    }
  }

  return null;
}

function buildTerminalArgs(
  terminal: string,
  command: string,
  cwd: string,
): { bin: string; args: string[] } {
  const wrappedCommand = `${command}; exec bash`;
  const terminalBase = terminal.split('/').pop() ?? terminal;

  switch (terminalBase) {
    case 'gnome-terminal':
      return {
        bin: terminal,
        args: ['--', 'bash', '-c', `cd "${cwd}" && ${wrappedCommand}`],
      };

    case 'konsole':
      return {
        bin: terminal,
        args: ['--workdir', cwd, '-e', 'bash', '-c', wrappedCommand],
      };

    case 'xfce4-terminal':
      return {
        bin: terminal,
        args: ['--working-directory', cwd, '-e', `bash -c '${wrappedCommand}'`],
      };

    case 'alacritty':
      return {
        bin: terminal,
        args: ['--working-directory', cwd, '-e', 'bash', '-c', wrappedCommand],
      };

    case 'kitty':
      return {
        bin: terminal,
        args: ['--directory', cwd, 'bash', '-c', wrappedCommand],
      };

    case 'wezterm':
      return {
        bin: terminal,
        args: ['start', '--cwd', cwd, '--', 'bash', '-c', wrappedCommand],
      };

    case 'xterm':
    case 'x-terminal-emulator':
    default:
      return {
        bin: terminal,
        args: ['-e', 'bash', '-c', `cd "${cwd}" && ${wrappedCommand}`],
      };
  }
}

/**
 * Open a new terminal window running the given command in the given directory.
 * Falls back to running in the current terminal if no GUI terminal is found.
 */
export async function openInNewTerminal(command: string, cwd: string): Promise<void> {
  const terminal = await findTerminal();

  if (!terminal) {
    // Fallback: run in same terminal
    const child = spawn('bash', ['-c', command], {
      cwd,
      stdio: 'inherit',
    });

    return new Promise<void>((resolve, reject) => {
      child.on('close', (code) => {
        if (code === 0 || code === null) resolve();
        else reject(new Error(`Process exited with code ${code}`));
      });
      child.on('error', reject);
    });
  }

  const { bin, args } = buildTerminalArgs(terminal, command, cwd);

  const child = spawn(bin, args, {
    detached: true,
    stdio: 'ignore',
  });

  child.unref();
}
