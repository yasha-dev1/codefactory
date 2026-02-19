import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import {
  getCurrentBranch,
  getHeadSha,
  hasUncommittedChanges,
} from '../../src/utils/git.js';

const execAsync = promisify(exec);

describe('git utility functions', () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), 'codefactory-git-test-'));
    await execAsync('git init', { cwd: repoDir });
    await execAsync('git config user.email "test@test.com"', { cwd: repoDir });
    await execAsync('git config user.name "Test"', { cwd: repoDir });
    // Create initial commit so HEAD exists
    await execAsync('git commit --allow-empty -m "initial"', { cwd: repoDir });
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  describe('getCurrentBranch', () => {
    it('should return the current branch name', async () => {
      const branch = await getCurrentBranch(repoDir);
      // Default branch is typically 'main' or 'master'
      expect(typeof branch).toBe('string');
      expect(branch.length).toBeGreaterThan(0);
    });

    it('should detect a newly created branch', async () => {
      await execAsync('git checkout -b test-branch', { cwd: repoDir });
      const branch = await getCurrentBranch(repoDir);
      expect(branch).toBe('test-branch');
    });
  });

  describe('getHeadSha', () => {
    it('should return a 40-character hex SHA', async () => {
      const sha = await getHeadSha(repoDir);
      expect(sha).toMatch(/^[a-f0-9]{40}$/);
    });
  });

  describe('hasUncommittedChanges', () => {
    it('should return false for clean repo', async () => {
      const result = await hasUncommittedChanges(repoDir);
      expect(result).toBe(false);
    });

    it('should return true when there are untracked files', async () => {
      await execAsync('touch newfile.txt', { cwd: repoDir });
      const result = await hasUncommittedChanges(repoDir);
      expect(result).toBe(true);
    });

    it('should return true when there are staged changes', async () => {
      await execAsync('touch staged.txt && git add staged.txt', { cwd: repoDir });
      const result = await hasUncommittedChanges(repoDir);
      expect(result).toBe(true);
    });
  });
});
