import { exec, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { WorktreeError } from '../utils/errors.js';

const execAsync = promisify(exec);

export interface WorktreeInfo {
  path: string;
  branchName: string;
  startingSha: string;
}

/**
 * Derive a branch name from a task description.
 * "Add JWT auth" → "cf/add-jwt-auth-a3f2c1"
 */
export function slugifyTask(description: string): string {
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50);

  const hash = createHash('sha256')
    .update(description + Date.now().toString())
    .digest('hex')
    .slice(0, 6);

  return `cf/${slug}-${hash}`;
}

/**
 * Use Claude to generate a meaningful branch name from a task description.
 * Falls back to slugifyTask if Claude is unavailable or returns an invalid name.
 */
export async function generateBranchName(taskDescription: string): Promise<string> {
  const hash = createHash('sha256')
    .update(taskDescription + Date.now().toString())
    .digest('hex')
    .slice(0, 6);

  try {
    const prompt = [
      'Generate a git branch name for this task.',
      'Rules:',
      '- Format: cf/<type>/<kebab-case-description>',
      '- type must be one of: feat, fix, refactor, chore, docs, test',
      '- description should be 2-5 words in kebab-case, lowercase, alphanumeric and hyphens only',
      '- Only output the branch name, nothing else. No backticks, no explanation.',
      '',
      `Task: ${taskDescription}`,
    ].join('\n');

    const result = await new Promise<string>((resolve, reject) => {
      const child = spawn('claude', ['--print', prompt], {
        stdio: ['ignore', 'pipe', 'ignore'],
      });

      let stdout = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.on('close', (code) => {
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(`Claude exited with code ${code}`));
      });

      child.on('error', reject);

      setTimeout(() => {
        child.kill();
        reject(new Error('Timed out waiting for Claude'));
      }, 30_000);
    });

    // Extract the branch name pattern from Claude's response
    const match = result.match(
      /cf\/(?:feat|fix|refactor|chore|docs|test)\/[a-z0-9]+(?:-[a-z0-9]+)*/,
    );
    if (match && match[0].length <= 80) {
      return `${match[0]}-${hash}`;
    }
  } catch {
    // Fallback to slugifyTask
  }

  return slugifyTask(taskDescription);
}

/**
 * Create a git worktree on a new branch.
 * Worktree path: ../<repoName>-worktrees/<branchName>/
 */
export async function createWorktree(repoRoot: string, branchName: string): Promise<WorktreeInfo> {
  const repoName = basename(repoRoot);
  const worktreeBase = resolve(repoRoot, '..', `${repoName}-worktrees`);
  const worktreePath = join(worktreeBase, branchName);

  // Check if branch already exists
  try {
    await execAsync(`git rev-parse --verify ${branchName}`, { cwd: repoRoot });
    throw new WorktreeError(
      `Branch "${branchName}" already exists. Choose a different task description or remove the existing branch.`,
    );
  } catch (error) {
    // Branch doesn't exist — good, continue
    if (error instanceof WorktreeError) throw error;
  }

  // Check if worktree path is already in use
  try {
    const { stdout } = await execAsync('git worktree list --porcelain', { cwd: repoRoot });
    if (stdout.includes(worktreePath)) {
      throw new WorktreeError(
        `Worktree path already in use: ${worktreePath}\nRemove it first: git worktree remove "${worktreePath}"`,
      );
    }
  } catch (error) {
    if (error instanceof WorktreeError) throw error;
  }

  // Get starting SHA before creating worktree
  const { stdout: shaOut } = await execAsync('git rev-parse HEAD', { cwd: repoRoot });
  const startingSha = shaOut.trim();

  // Create the worktree with a new branch
  try {
    await execAsync(`git worktree add -b "${branchName}" "${worktreePath}"`, { cwd: repoRoot });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new WorktreeError(`Failed to create worktree: ${msg}`);
  }

  return { path: worktreePath, branchName, startingSha };
}

/**
 * Remove a worktree and its branch.
 */
export async function removeWorktree(
  repoRoot: string,
  worktreePath: string,
  branchName: string,
): Promise<void> {
  try {
    await execAsync(`git worktree remove "${worktreePath}" --force`, { cwd: repoRoot });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new WorktreeError(`Failed to remove worktree: ${msg}`);
  }

  try {
    await execAsync(`git branch -D "${branchName}"`, { cwd: repoRoot });
  } catch {
    // Branch may already be deleted; not fatal
  }
}

/**
 * Get commits made since a given SHA.
 */
export async function getCommitsSince(
  cwd: string,
  sinceSha: string,
): Promise<Array<{ sha: string; message: string }>> {
  try {
    const { stdout } = await execAsync(`git log ${sinceSha}..HEAD --oneline`, { cwd });
    if (!stdout.trim()) return [];

    return stdout
      .trim()
      .split('\n')
      .map((line) => {
        const spaceIdx = line.indexOf(' ');
        return {
          sha: line.slice(0, spaceIdx),
          message: line.slice(spaceIdx + 1),
        };
      });
  } catch {
    return [];
  }
}

/**
 * Get files changed since a given SHA.
 */
export async function getChangedFilesSince(cwd: string, sinceSha: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync(`git diff --name-only ${sinceSha}..HEAD`, { cwd });
    if (!stdout.trim()) return [];
    return stdout.trim().split('\n');
  } catch {
    return [];
  }
}
