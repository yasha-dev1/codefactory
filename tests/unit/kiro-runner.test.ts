import { KiroRunner } from '../../src/core/kiro-runner.js';
import { z } from 'zod';

describe('KiroRunner', () => {
  let runner: KiroRunner;

  beforeEach(() => {
    runner = new KiroRunner({ maxTurns: 5 });
  });

  it('should have platform set to kiro', () => {
    expect(runner.platform).toBe('kiro');
  });

  describe('analyze()', () => {
    it('should throw "not yet available" error', async () => {
      const schema = z.object({ name: z.string() });
      await expect(runner.analyze('Analyze this', schema)).rejects.toThrow(
        'Kiro CLI integration is not yet available',
      );
    });
  });

  describe('generate()', () => {
    it('should throw "not yet available" error', async () => {
      await expect(runner.generate('Generate files')).rejects.toThrow(
        'Kiro CLI integration is not yet available',
      );
    });
  });
});
