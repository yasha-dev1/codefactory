import { execSync } from 'node:child_process';

import chalk, { type ChalkInstance } from 'chalk';

import { APP_NAME, VERSION } from '@harnext/core';

// ── Box-drawing characters ───────────────────────────────────────────
const BOX = { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' } as const;

function termWidth(): number {
  return process.stdout.columns || 80;
}

// ── Separator ────────────────────────────────────────────────────────

export function separator(color: ChalkInstance = chalk.dim): string {
  return color(BOX.h.repeat(termWidth()));
}

// ── Bordered box ─────────────────────────────────────────────────────

export interface BoxOptions {
  title?: string;
  borderColor: ChalkInstance;
  titleColor?: ChalkInstance;
  maxLines?: number;
}

export function box(content: string, options: BoxOptions): string {
  const w = termWidth();
  const innerW = w - 4;
  const { borderColor, titleColor = chalk.bold } = options;

  let top: string;
  if (options.title) {
    const titleStr = ` ${options.title} `;
    const remaining = w - 2 - titleStr.length;
    top =
      borderColor(BOX.tl + BOX.h) +
      titleColor(titleStr) +
      borderColor(BOX.h.repeat(Math.max(0, remaining)) + BOX.tr);
  } else {
    top = borderColor(BOX.tl + BOX.h.repeat(w - 2) + BOX.tr);
  }

  let lines = content.split('\n');
  if (options.maxLines && lines.length > options.maxLines) {
    lines = lines.slice(0, options.maxLines);
    lines.push(chalk.dim(`... (truncated)`));
  }

  const body = lines
    .map((line) => {
      const stripped = stripAnsi(line);
      const pad = Math.max(0, innerW - stripped.length);
      return borderColor(BOX.v) + ' ' + line + ' '.repeat(pad) + ' ' + borderColor(BOX.v);
    })
    .join('\n');

  const bottom = borderColor(BOX.bl + BOX.h.repeat(w - 2) + BOX.br);

  return top + '\n' + body + '\n' + bottom;
}

// ── User message ─────────────────────────────────────────────────────

export function userMessage(text: string): string {
  const w = termWidth();
  const lines = text.split('\n');
  return lines
    .map((line) => {
      const stripped = stripAnsi(line);
      const pad = Math.max(0, w - stripped.length - 2);
      return chalk.bgRgb(50, 50, 50)(' ' + chalk.white(line) + ' '.repeat(pad) + ' ');
    })
    .join('\n');
}

// ── Tool rendering ───────────────────────────────────────────────────

export function toolStart(name: string, args: Record<string, unknown>): string {
  const summary = formatToolSummary(name, args);
  return box(chalk.dim(summary), {
    title: name,
    borderColor: chalk.yellow,
    titleColor: chalk.yellow.bold,
  });
}

export function toolEnd(
  name: string,
  args: Record<string, unknown>,
  result: string,
  isError: boolean,
): string {
  const borderColor = isError ? chalk.red : chalk.green;
  const summary = formatToolSummary(name, args);
  const lines: string[] = [chalk.dim(summary)];

  // Show diff for edit tool
  if (name === 'edit' && !isError) {
    const oldStr = args.old_string as string | undefined;
    const newStr = args.new_string as string | undefined;
    if (oldStr && newStr) {
      lines.push('');
      for (const line of oldStr.split('\n')) {
        lines.push(chalk.red('- ' + line));
      }
      for (const line of newStr.split('\n')) {
        lines.push(chalk.green('+ ' + line));
      }
    }
  }

  // Show summary for write tool
  if (name === 'write' && !isError) {
    const content = args.content as string | undefined;
    if (content) {
      const lineCount = content.split('\n').length;
      lines.push('');
      lines.push(chalk.green(`+ ${lineCount} lines written`));
    }
  }

  if (result.length > 0) {
    lines.push('');
    lines.push(isError ? chalk.red(result) : chalk.dim(result));
  }

  return box(lines.join('\n'), {
    title: isError ? `${name} (error)` : name,
    borderColor,
    titleColor: isError ? chalk.red.bold : chalk.green.bold,
    maxLines: 25,
  });
}

function formatToolSummary(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'bash':
      return `$ ${args.command ?? ''}`;
    case 'read':
      return `${args.path ?? ''}`;
    case 'write':
      return `${args.path ?? ''}`;
    case 'edit':
      return `${args.path ?? ''}`;
    default:
      return truncateOneLine(JSON.stringify(args), termWidth() - 8);
  }
}

// ── Header ───────────────────────────────────────────────────────────

export function header(): string {
  const lines = [
    '',
    chalk.bold.cyan(APP_NAME) + chalk.dim(` v${VERSION}`),
    chalk.dim(`esc to interrupt  ctrl+c to exit`),
    chalk.dim(`/ for commands`),
    '',
  ];
  return lines.join('\n');
}

// ── Input footer (info embedded in bottom border) ───────────────────

let cachedBranch: string | undefined;

function getGitBranch(): string {
  if (cachedBranch !== undefined) return cachedBranch;
  try {
    cachedBranch = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null', { encoding: 'utf8' }).trim();
  } catch {
    cachedBranch = '';
  }
  return cachedBranch;
}

export function inputFooter(
  provider: string,
  model: string,
  cwd: string,
  contextPercent?: number,
): string {
  const w = termWidth();
  const home = process.env.HOME ?? '';
  const shortCwd = home && cwd.startsWith(home) ? '~' + cwd.slice(home.length) : cwd;
  const branch = getGitBranch();
  const branchStr = branch ? ` (${branch})` : '';

  const ctxStr = contextPercent != null ? ` ${Math.round(contextPercent)}%` : '';
  const left = `${shortCwd}${branchStr}${ctxStr}`;
  const right = `${provider}/${model}`;
  // ─ left ──────── right ─
  const middleLen = Math.max(0, w - 6 - left.length - right.length);

  return (
    chalk.magenta('─') +
    ' ' +
    chalk.dim(left) +
    ' ' +
    chalk.magenta('─'.repeat(middleLen)) +
    ' ' +
    chalk.dim(right) +
    ' ' +
    chalk.magenta('─')
  );
}

// ── Prompt ───────────────────────────────────────────────────────────

export function prompt(): string {
  return chalk.cyan('> ');
}

// ── Loading spinner ──────────────────────────────────────────────────

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const LOADING_MESSAGES = [
  'Working...',
  'Thinking...',
  'Cooking...',
  'Brewing...',
  'Crafting...',
  'Pondering...',
  'Computing...',
  'Conjuring...',
  'Assembling...',
  'Wiring...',
  'Compiling...',
  'Inventing...',
  'Scheming...',
  'Plotting...',
  'Crunching...',
];

function randomMessage(): string {
  return LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
}

export interface Spinner {
  stop: () => void;
  message: string;
}

export function startSpinner(message?: string): Spinner {
  let frame = 0;
  const msg = message ?? randomMessage();

  const interval = setInterval(() => {
    const spinner = chalk.cyan(SPINNER_FRAMES[frame % SPINNER_FRAMES.length]);
    const text = chalk.dim(msg);
    process.stdout.write(`\r\x1B[K  ${spinner} ${text}`);
    frame++;
  }, 80);

  return {
    message: msg,
    stop: () => {
      clearInterval(interval);
      process.stdout.write('\r\x1B[K');
    },
  };
}

// ── Utilities ────────────────────────────────────────────────────────

function truncateOneLine(text: string, max: number): string {
  const oneLine = text.replace(/\n/g, ' ').trim();
  return oneLine.length > max ? oneLine.slice(0, max) + '...' : oneLine;
}

export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}
