import { createRequire } from 'node:module';

import chalk from 'chalk';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

// "CF" monogram using box-drawing characters (single-width, renders correctly in all terminals)
const CF_LOGO_LINES = ['╔══╗ ╔══╗', '║    ╠══╝', '║    ║   ', '╚══╝ ╚   '];

const ACCENT = '#FF8C00'; // Orange, same aesthetic as Claude Code

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
  console.log(`  ${chalk.dim('Type a task to start a new worktree session')}`);
  console.log(
    `  ${chalk.dim('Type')} ${chalk.bold('/')} ${chalk.dim('to browse commands and agent prompts')}`,
  );
  console.log(`  ${chalk.dim('Ctrl+C to exit')}`);
  console.log();
  console.log(hr);
  console.log();
}
