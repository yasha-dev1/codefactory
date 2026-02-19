import { slugifyTask } from '../../src/core/worktree.js';

describe('slugifyTask', () => {
  it('should create a branch name with cf/ prefix', () => {
    const result = slugifyTask('Add JWT auth');
    expect(result).toMatch(/^cf\//);
  });

  it('should lowercase and hyphenate the description', () => {
    const result = slugifyTask('Add JWT auth');
    expect(result).toMatch(/^cf\/add-jwt-auth-/);
  });

  it('should strip non-alphanumeric characters', () => {
    const result = slugifyTask('Fix bug #123 (urgent!)');
    expect(result).toMatch(/^cf\/fix-bug-123-urgent-/);
  });

  it('should truncate long descriptions to 50 chars before the hash', () => {
    const longDesc = 'This is a very long task description that should be truncated to fifty characters';
    const result = slugifyTask(longDesc);
    // cf/ prefix + slug (max 50) + - + 6-char hash
    const parts = result.split('-');
    const hashPart = parts[parts.length - 1];
    expect(hashPart).toHaveLength(6);
  });

  it('should append a 6-character hash suffix', () => {
    const result = slugifyTask('Test task');
    const hash = result.split('-').pop();
    expect(hash).toMatch(/^[a-f0-9]{6}$/);
  });

  it('should produce different hashes for the same description (due to timestamp)', async () => {
    const result1 = slugifyTask('Same task');
    // Small delay to ensure different timestamp
    await new Promise((resolve) => setTimeout(resolve, 5));
    const result2 = slugifyTask('Same task');
    expect(result1).not.toBe(result2);
  });

  it('should handle empty string input', () => {
    const result = slugifyTask('');
    expect(result).toMatch(/^cf\/-[a-f0-9]{6}$/);
  });

  it('should handle description with only special characters', () => {
    const result = slugifyTask('!@#$%^&*()');
    expect(result).toMatch(/^cf\/-[a-f0-9]{6}$/);
  });
});
