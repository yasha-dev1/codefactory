import { CodexRunner } from '../../src/core/codex-runner.js';
import { z } from 'zod';

describe('CodexRunner', () => {
  let runner: CodexRunner;

  beforeEach(() => {
    runner = new CodexRunner({ maxTurns: 5 });
  });

  it('should have platform set to codex', () => {
    expect(runner.platform).toBe('codex');
  });

  describe('analyze()', () => {
    it('should throw "not yet available" error', async () => {
      const schema = z.object({ name: z.string() });
      await expect(runner.analyze('Analyze this', schema)).rejects.toThrow(
        'Codex CLI integration is not yet available',
      );
    });
  });

  describe('generate()', () => {
    it('should throw "not yet available" error', async () => {
      await expect(runner.generate('Generate files')).rejects.toThrow(
        'Codex CLI integration is not yet available',
      );
    });
  });
});
