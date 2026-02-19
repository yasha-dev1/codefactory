import { exec } from 'node:child_process';
import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { logger } from '../ui/logger.js';
import { withSpinner } from '../ui/spinner.js';
import { confirmPrompt, inputPrompt } from '../ui/prompts.js';
import { isGitRepo, getRepoRoot, hasUncommittedChanges } from '../utils/git.js';
import { readFileIfExists } from '../utils/fs.js';
import { NotAGitRepoError, ClaudeNotFoundError } from '../utils/errors.js';
import { generateBranchName, createWorktree } from '../core/worktree.js';
import { openInNewTerminal } from '../core/terminal.js';
import { buildAgentSystemPrompt } from '../prompts/agent-system.js';

const execAsync = promisify(exec);

export interface RunOptions {
  task?: string;
}

interface PackageScripts {
  test?: string;
  build?: string;
  lint?: string;
  typecheck?: string;
}

async function extractHarnessCommands(
  worktreePath: string,
): Promise<{ test: string; build: string; lint: string; typeCheck: string } | null> {
  const raw = await readFileIfExists(join(worktreePath, 'package.json'));
  if (!raw) return null;

  try {
    const pkg = JSON.parse(raw) as { scripts?: PackageScripts };
    const s = pkg.scripts;
    if (!s) return null;

    return {
      test: s.test ? `npm test` : '',
      build: s.build ? `npm run build` : '',
      lint: s.lint ? `npm run lint` : '',
      typeCheck: s.typecheck ? `npm run typecheck` : '',
    };
  } catch {
    return null;
  }
}

export async function runCommand(options: RunOptions): Promise<void> {
  // ── Phase 1: Pre-flight ─────────────────────────────────────────────
  if (!(await isGitRepo())) {
    throw new NotAGitRepoError();
  }

  // Verify claude is installed
  try {
    await execAsync('which claude');
  } catch {
    throw new ClaudeNotFoundError();
  }

  const repoRoot = await getRepoRoot();

  // Check for uncommitted changes
  if (await hasUncommittedChanges(repoRoot)) {
    logger.warn('You have uncommitted changes in your working tree.');
    const proceed = await confirmPrompt('Continue anyway?', false);
    if (!proceed) {
      logger.info('Aborted. Commit or stash your changes first.');
      return;
    }
  }

  // ── Phase 2: Task Input ─────────────────────────────────────────────
  logger.header('CodeFactory');

  let task = options.task;
  if (!task) {
    task = await inputPrompt('Describe your task:');
  }

  if (!task.trim()) {
    logger.error('No task provided. Aborting.');
    return;
  }

  // ── Phase 3: Branch Name Generation ────────────────────────────────
  const branchName = await withSpinner('Generating branch name...', () => generateBranchName(task));
  logger.info(`Branch: ${branchName}`);

  const proceed = await confirmPrompt('Create worktree and start Claude?', true);
  if (!proceed) {
    logger.info('Aborted.');
    return;
  }

  const worktree = await withSpinner('Creating git worktree...', () =>
    createWorktree(repoRoot, branchName),
  );

  // ── Phase 4: Build System Prompt ────────────────────────────────────
  const harnessCommands = await extractHarnessCommands(worktree.path);
  const systemPrompt = await buildAgentSystemPrompt({
    branchName,
    repoRoot: worktree.path,
    harnessCommands,
  });

  // ── Phase 5: Open Claude in New Terminal ────────────────────────────
  // Write prompt and task to files to avoid shell escaping issues with
  // multi-line content containing backticks, quotes, and special chars.
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
      `PROMPT=$(<"${promptFile}")`,
      `TASK=$(<"${taskFile}")`,
      'exec claude --dangerously-skip-permissions --append-system-prompt "$PROMPT" "$TASK"',
      '',
    ].join('\n'),
    'utf-8',
  );
  await chmod(launcherFile, 0o755);

  await openInNewTerminal(`bash "${launcherFile}"`, worktree.path);

  // ── Phase 6: Post-Launch Summary ────────────────────────────────────
  console.log();
  logger.success('Claude opened in new terminal.');
  console.log();
  logger.info(`Worktree: ${worktree.path}`);
  logger.info(`Branch:   ${branchName}`);
  console.log();
  logger.dim('When done, clean up with:');
  logger.dim(`  git worktree remove "${worktree.path}"`);
  logger.dim(`  git branch -D ${branchName}`);
  console.log();
}
