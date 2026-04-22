import { Command } from 'commander';

import { getPackageInfo } from './utils/package-info.js';

const pkg = getPackageInfo();

export const program = new Command()
  .name('codefactory')
  .description(pkg.description)
  .version(pkg.version)
  .action(async () => {
    const { replCommand } = await import('./commands/repl.js');
    await replCommand();
  });

program
  .command('init')
  .description('Initialize harness engineering setup for the current repository')
  .option('--skip-detection', 'Skip Claude analysis, use heuristics only')
  .option('--dry-run', 'Show what would be generated without writing files')
  .option('--platform <platform>', 'AI platform: claude, kiro, or codex')
  .option('--ci-provider <provider>', 'CI provider: github-actions, gitlab-ci, or bitbucket')
  .option('--strictness <level>', 'Strictness level: relaxed, standard, or strict')
  .option('-y, --yes', 'Accept all defaults non-interactively')
  .action(
    async (options: {
      skipDetection?: boolean;
      dryRun?: boolean;
      platform?: string;
      ciProvider?: string;
      strictness?: string;
      yes?: boolean;
    }) => {
      const { initCommand } = await import('./commands/init.js');
      await initCommand(options);
    },
  );

program
  .command('setup')
  .description(
    'Set up CodeFactory in this repo, including a coding-agent picker (harnext, claude-code, codex)',
  )
  .option('--coding-agent <id>', 'Coding agent: harnext, claude-code, or codex')
  .option('--model <id>', 'Model id for the chosen coding agent (non-harnext only)')
  .option('--skip-detection', 'Skip Claude analysis, use heuristics only')
  .option('--dry-run', 'Show what would be generated without writing files')
  .option('--platform <platform>', 'AI platform: claude, kiro, or codex')
  .option('--ci-provider <provider>', 'CI provider: github-actions, gitlab-ci, or bitbucket')
  .option('--strictness <level>', 'Strictness level: relaxed, standard, or strict')
  .option('-y, --yes', 'Accept all defaults non-interactively')
  .action(
    async (options: {
      codingAgent?: string;
      model?: string;
      skipDetection?: boolean;
      dryRun?: boolean;
      platform?: string;
      ciProvider?: string;
      strictness?: string;
      yes?: boolean;
    }) => {
      const { setupCommand } = await import('./commands/setup.js');
      await setupCommand(options);
    },
  );

program
  .command('update')
  .description('Check for and install updates')
  .option('--check', 'Check for updates without installing')
  .option('--force', 'Re-download even if already on latest version')
  .action(async (options: { check?: boolean; force?: boolean }) => {
    const { updateCommand } = await import('./commands/update.js');
    await updateCommand(options);
  });
