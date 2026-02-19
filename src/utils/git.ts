import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export async function isGitRepo(dir?: string): Promise<boolean> {
  try {
    await execAsync('git rev-parse --is-inside-work-tree', { cwd: dir });
    return true;
  } catch {
    return false;
  }
}

export async function getRemoteUrl(dir?: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git remote get-url origin', { cwd: dir });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function getRepoRoot(dir?: string): Promise<string> {
  const { stdout } = await execAsync('git rev-parse --show-toplevel', { cwd: dir });
  return stdout.trim();
}

export async function getCurrentBranch(dir?: string): Promise<string> {
  const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: dir });
  return stdout.trim();
}

export async function getHeadSha(dir?: string): Promise<string> {
  const { stdout } = await execAsync('git rev-parse HEAD', { cwd: dir });
  return stdout.trim();
}

export async function hasUncommittedChanges(dir?: string): Promise<boolean> {
  const { stdout } = await execAsync('git status --porcelain', { cwd: dir });
  return stdout.trim().length > 0;
}
