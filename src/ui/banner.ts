import chalk from 'chalk';

import { getPackageInfo } from '../utils/package-info.js';

const pkg = getPackageInfo();

// "CF" monogram using box-drawing characters (single-width, renders correctly in all terminals)
const CF_LOGO_LINES = ['╔══╗ ╔═══', '║    ╠═══', '║    ║   ', '╚══╝ ╚   '];

const ACCENT = '#FF8C00'; // Orange, same aesthetic as Claude Code

const FLOWHUNT_URL = 'https://www.flowhunt.io';

export function supportsHyperlinks(stream: NodeJS.WriteStream = process.stdout): boolean {
  if (process.env.FORCE_HYPERLINK === '1') return true;
  if (process.env.NO_COLOR) return false;
  if (process.env.TERM === 'dumb') return false;
  return Boolean(stream.isTTY);
}

function osc8Link(url: string, text: string): string {
  // OSC 8 hyperlink: ESC ] 8 ;; URL ST text ESC ] 8 ;; ST
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}

export function renderFlowHuntBranding(opts: { hyperlinks?: boolean } = {}): string {
  const hyperlinks = opts.hyperlinks ?? supportsHyperlinks();
  const link = hyperlinks ? osc8Link(FLOWHUNT_URL, FLOWHUNT_URL) : FLOWHUNT_URL;
  return `${chalk.bold('FlowHunt')}${chalk.dim(' — powered by flowhunt · ')}${chalk.dim(link)}`;
}

export function printBanner(): void {
  const hr = chalk.dim('─'.repeat(58));

  console.log();
  console.log(hr);
  console.log();

  // CF logo with name + metadata to the right
  CF_LOGO_LINES.forEach((line, i) => {
    const logo = chalk.bold.hex(ACCENT)(line);
    if (i === 0) {
      console.log(
        `  ${logo}   ${chalk.bold.white('CodeFactory')}  ${chalk.dim(`v${pkg.version}`)}`,
      );
    } else if (i === 1) {
      console.log(`  ${logo}   ${chalk.dim('Harness engineering for AI coding agents')}`);
    } else if (i === 2) {
      console.log(`  ${logo}   ${chalk.dim(`cwd: ${process.cwd()}`)}`);
    } else {
      console.log(`  ${logo}`);
    }
  });

  console.log();
  console.log(`  ${renderFlowHuntBranding()}`);
  console.log();
  console.log(`  ${chalk.dim('Type a task to start a new worktree session')}`);
  console.log(
    `  ${chalk.dim('Type')} ${chalk.bold('/')} ${chalk.dim('to browse commands and agent prompts')}`,
  );
  console.log(`  ${chalk.dim('Ctrl+C to exit')}`);
  console.log();
  console.log(hr);
  console.log();
}
