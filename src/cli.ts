import { Command } from 'commander';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string; description: string };

export const program = new Command()
  .name('codefactory')
  .description(pkg.description)
  .version(pkg.version)
  .argument('[task]', 'Task description (skips interactive prompt if provided)')
  .action(async (task?: string) => {
    const { runCommand } = await import('./commands/run.js');
    await runCommand({ task });
  });

program
  .command('init')
  .description('Initialize harness engineering setup for the current repository')
  .option('--skip-detection', 'Skip Claude analysis, use heuristics only')
  .option('--dry-run', 'Show what would be generated without writing files')
  .action(async (options: { skipDetection?: boolean; dryRun?: boolean }) => {
    const { initCommand } = await import('./commands/init.js');
    await initCommand(options);
  });
