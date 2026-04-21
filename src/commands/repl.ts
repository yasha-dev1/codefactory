import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';

import chalk from 'chalk';
import { z } from 'zod';

import { logger } from '../ui/logger.js';
import { printBanner } from '../ui/banner.js';
import { withSpinner } from '../ui/spinner.js';
import { confirmPrompt, selectPrompt, inputPrompt } from '../ui/prompts.js';
import { borderedInput } from '../ui/bordered-input.js';
import type { SlashCommand } from '../ui/bordered-input.js';
import { isGitRepo, getRepoRoot, hasUncommittedChanges } from '../utils/git.js';
import { readFileIfExists } from '../utils/fs.js';
import { NotAGitRepoError } from '../utils/errors.js';
import { validatePlatformCLI } from '../core/runner-factory.js';
import { generateBranchName, createWorktree } from '../core/worktree.js';
import { openInNewTerminal } from '../core/terminal.js';

type ReplAction = { type: 'command'; name: string } | { type: 'task'; task: string };

const packageJsonSchema = z.object({
  scripts: z
    .object({
      test: z.string().optional(),
      build: z.string().optional(),
      lint: z.string().optional(),
      typecheck: z.string().optional(),
    })
    .optional(),
});

const AGENT_SYSTEM_PROMPT = `# CodeFactory Agent Session

You are working in a git worktree on branch \`{{branchName}}\`.
Your task is described in the first message. Execute it fully.

## Execution Strategy

SPEED FIRST:

- Start coding immediately. Do not ask clarifying questions unless genuinely ambiguous.
- Read {{instructionFile}} first for project conventions.
- Make informed decisions rather than asking. Adjust later if needed.

PARALLELIZATION:

- For tasks with 3+ independent subtasks, use TeamCreate and Task tool to spawn parallel agents.
- Each agent should own a clear, non-overlapping piece of work.
- Coordinate via the task list. Do not duplicate effort.
- Example: feature with API + UI + tests → spawn agents for each.

## Harness Compliance

This project uses harness engineering:

- Read {{instructionFile}} for all project conventions.
- Respect architectural boundaries in harness.config.json.
- Changes to Tier 3 (critical) paths require extra test coverage.
- Never disable linters, type checking, or test suites.
- Do not refactor code unrelated to your task.

## Quality Gates

Before finishing, run ALL of these and fix any failures:
{{qualityGates}}

## Git Workflow

You are on branch \`{{branchName}}\`. All commits go here.

- Use conventional commits: feat:, fix:, refactor:, test:, chore:, docs:
- Make atomic commits as you work.

## When You Are Done

After all quality gates pass:

1. Push the branch: \`git push -u origin {{branchName}}\`
2. Create a PR: \`gh pr create --title "<short task summary>" --body "<summary of changes, files modified, test results>"\`
3. Print the PR URL so the user can see it.
`;

/**
 * Escape a string for safe embedding in a single-quoted bash string.
 * Wraps the value in single quotes, escaping any embedded single quotes
 * so that command substitution ($(), backticks) cannot fire.
 */
function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

async function extractHarnessCommands(
  worktreePath: string,
): Promise<{ test: string; build: string; lint: string; typeCheck: string } | null> {
  const raw = await readFileIfExists(join(worktreePath, 'package.json'));
  if (!raw) return null;

  try {
    const parsed = packageJsonSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const s = parsed.data.scripts;
    if (!s) return null;

    return {
      test: s.test ? 'npm test' : '',
      build: s.build ? 'npm run build' : '',
      lint: s.lint ? 'npm run lint' : '',
      typeCheck: s.typecheck ? 'npm run typecheck' : '',
    };
  } catch {
    return null;
  }
}

function buildQualityGates(
  commands: { test: string; build: string; lint: string; typeCheck: string } | null,
): string {
  if (!commands) {
    return '- Check package.json for available scripts (test, lint, build, typecheck)';
  }

  const gates: string[] = [];
  let i = 1;

  if (commands.lint) {
    gates.push(`${i}. \`${commands.lint}\``);
    i++;
  }
  if (commands.typeCheck) {
    gates.push(`${i}. \`${commands.typeCheck}\``);
    i++;
  }
  if (commands.test) {
    gates.push(`${i}. \`${commands.test}\``);
    i++;
  }
  if (commands.build) {
    gates.push(`${i}. \`${commands.build}\``);
    i++;
  }

  return gates.length > 0
    ? gates.join('\n')
    : '- Check package.json for available scripts (test, lint, build, typecheck)';
}

function buildCommandChoices() {
  return [
    {
      name: '/init',
      value: { type: 'command' as const, name: 'init' },
      description: 'Run harness engineering setup',
    },
    {
      name: '/help',
      value: { type: 'command' as const, name: 'help' },
      description: 'Show help',
    },
    {
      name: '/exit',
      value: { type: 'command' as const, name: 'exit' },
      description: 'Exit CodeFactory',
    },
  ];
}

function showHelp(): void {
  console.log();
  console.log(chalk.bold('Usage:'));
  console.log('  Type a task description and press Enter to spawn Claude in a worktree.');
  console.log('  Type / to browse commands.');
  console.log('  Arrow keys to navigate, Enter to select.');
}

async function handleTask(task: string, repoRoot: string): Promise<void> {
  if (await hasUncommittedChanges(repoRoot)) {
    logger.warn('You have uncommitted changes in your working tree.');
    const proceed = await confirmPrompt('Continue anyway?', false);
    if (!proceed) return;
  }

  // Generate suggested branch name
  const suggestedBranch = await withSpinner('Generating branch name...', () =>
    generateBranchName(task),
  );

  const branchName = await inputPrompt('Branch name:', suggestedBranch);
  if (!branchName.trim()) {
    logger.error('No branch name provided. Aborting.');
    return;
  }

  const proceed = await confirmPrompt('Create worktree and start Claude?', true);
  if (!proceed) return;

  const worktree = await withSpinner('Creating git worktree...', () =>
    createWorktree(repoRoot, branchName.trim()),
  );

  const harnessCommands = await extractHarnessCommands(worktree.path);
  const qualityGates = buildQualityGates(harnessCommands);
  const systemPrompt = AGENT_SYSTEM_PROMPT.replace(/\{\{branchName\}\}/g, () => branchName.trim())
    .replace(/\{\{qualityGates\}\}/g, () => qualityGates)
    .replace(/\{\{instructionFile\}\}/g, 'CLAUDE.md');

  // Write launcher files to worktree
  const cfDir = join(worktree.path, '.codefactory');
  await mkdir(cfDir, { recursive: true });
  const promptFile = join(cfDir, 'system-prompt');
  const taskFile = join(cfDir, 'task');
  const launcherFile = join(cfDir, 'launch.sh');

  await writeFile(promptFile, systemPrompt, 'utf-8');
  await writeFile(taskFile, task, 'utf-8');
  await writeFile(
    launcherFile,
    [
      '#!/bin/bash',
      `PROMPT=$(<${shellEscape(promptFile)})`,
      `TASK=$(<${shellEscape(taskFile)})`,
      'exec claude --dangerously-skip-permissions --append-system-prompt "$PROMPT" "$TASK"',
      '',
    ].join('\n'),
    'utf-8',
  );
  await chmod(launcherFile, 0o755);

  await openInNewTerminal(`bash ${shellEscape(launcherFile)}`, worktree.path);

  console.log();
  logger.success('Claude opened in new terminal.');
  console.log();
  logger.info(`Worktree: ${worktree.path}`);
  logger.info(`Branch:   ${branchName.trim()}`);
  console.log();
  logger.dim('When done, clean up with:');
  logger.dim(`  git worktree remove "${worktree.path}"`);
  logger.dim(`  git branch -D ${branchName.trim()}`);
}

export async function replCommand(): Promise<void> {
  if (!(await isGitRepo())) {
    throw new NotAGitRepoError();
  }

  validatePlatformCLI('claude');

  const repoRoot = await getRepoRoot();

  printBanner();

  const allCommands = buildCommandChoices();
  const slashCommands: SlashCommand[] = allCommands.map((c) => ({
    name: c.name.slice(1),
    description: c.description,
  }));

  const ACCENT = '#FF8C00';

  // Main loop
  while (true) {
    try {
      const raw = await borderedInput({
        hint: 'Type a task, or /command for more options',
        accentColor: ACCENT,
        commands: slashCommands,
      });

      if (!raw) continue;

      if (raw.startsWith('/')) {
        const filter = raw.slice(1).toLowerCase();

        // Check for exact match first (e.g., user Tab-completed a command)
        const exactMatch = allCommands.find((c) => c.name.slice(1).toLowerCase() === filter);

        let action: ReplAction;

        if (exactMatch) {
          action = exactMatch.value;
        } else {
          // Filter commands by what was typed after "/"
          const filtered = filter
            ? allCommands.filter((c) => c.name.slice(1).toLowerCase().includes(filter))
            : allCommands;

          if (filtered.length === 0) {
            logger.warn(`No command found for "${raw}"`);
            console.log();
            continue;
          }

          action = await selectPrompt<ReplAction>(
            'Select command:',
            filtered.map((c) => ({ name: c.name, value: c.value })),
          );
        }

        if (action.type === 'command') {
          if (action.name === 'init') {
            const { initCommand } = await import('./init.js');
            await initCommand({});
          } else if (action.name === 'help') {
            showHelp();
          } else if (action.name === 'exit') {
            process.exit(0);
          }
        }
      } else {
        await handleTask(raw, repoRoot);
      }

      console.log();
    } catch (error) {
      // ExitPromptError is thrown when user presses Ctrl+C in an inquirer prompt
      if (error instanceof Error && error.constructor.name === 'ExitPromptError') {
        process.exit(0);
      }
      const message = error instanceof Error ? error.message : String(error);
      logger.error(message);
      console.log();
    }
  }
}
