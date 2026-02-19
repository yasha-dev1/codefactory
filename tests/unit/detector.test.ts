import { fileURLToPath } from 'url';
import path from 'path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { runHeuristicDetection } from '../../src/core/detector.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../fixtures');

describe('runHeuristicDetection', () => {
  describe('Node.js project', () => {
    const nodeProjectDir = path.join(fixturesDir, 'node-project');

    it('should detect JavaScript and TypeScript languages', async () => {
      const result = await runHeuristicDetection(nodeProjectDir);
      expect(result.languages).toContain('JavaScript');
      expect(result.languages).toContain('TypeScript');
    });

    it('should detect Next.js as the framework', async () => {
      const result = await runHeuristicDetection(nodeProjectDir);
      expect(result.framework).toBe('Next.js');
    });

    it('should detect TypeScript', async () => {
      const result = await runHeuristicDetection(nodeProjectDir);
      expect(result.hasTypeScript).toBe(true);
    });

    it('should detect GitHub Actions as CI provider', async () => {
      const result = await runHeuristicDetection(nodeProjectDir);
      expect(result.ciProvider).toBe('GitHub Actions');
    });

    it('should not detect existing CLAUDE.md', async () => {
      const result = await runHeuristicDetection(nodeProjectDir);
      expect(result.existingClaude).toBe(false);
    });

    it('should not detect monorepo indicators', async () => {
      const result = await runHeuristicDetection(nodeProjectDir);
      expect(result.monorepoIndicators).toBe(false);
    });
  });

  describe('Python project', () => {
    const pythonProjectDir = path.join(fixturesDir, 'python-project');

    it('should detect Python language', async () => {
      const result = await runHeuristicDetection(pythonProjectDir);
      expect(result.languages).toContain('Python');
    });

    it('should not detect JavaScript', async () => {
      const result = await runHeuristicDetection(pythonProjectDir);
      expect(result.languages).not.toContain('JavaScript');
    });

    it('should not detect a CI provider', async () => {
      const result = await runHeuristicDetection(pythonProjectDir);
      expect(result.ciProvider).toBeNull();
    });
  });

  describe('Go project', () => {
    const goProjectDir = path.join(fixturesDir, 'go-project');

    it('should detect Go language', async () => {
      const result = await runHeuristicDetection(goProjectDir);
      expect(result.languages).toContain('Go');
    });

    it('should not detect JavaScript or Python', async () => {
      const result = await runHeuristicDetection(goProjectDir);
      expect(result.languages).not.toContain('JavaScript');
      expect(result.languages).not.toContain('Python');
    });

    it('should have no framework detected', async () => {
      const result = await runHeuristicDetection(goProjectDir);
      expect(result.framework).toBeNull();
    });
  });

  describe('empty directory', () => {
    let emptyDir: string;

    beforeEach(async () => {
      emptyDir = await mkdtemp(path.join(tmpdir(), 'codefactory-test-'));
    });

    afterEach(async () => {
      await rm(emptyDir, { recursive: true, force: true });
    });

    it('should return sensible defaults for an empty directory', async () => {
      const result = await runHeuristicDetection(emptyDir);
      expect(result.languages).toEqual([]);
      expect(result.framework).toBeNull();
      expect(result.packageManager).toBeNull();
      expect(result.hasTypeScript).toBe(false);
      expect(result.ciProvider).toBeNull();
      expect(result.existingClaude).toBe(false);
      expect(result.existingDocs).toEqual([]);
      expect(result.monorepoIndicators).toBe(false);
    });
  });
});
