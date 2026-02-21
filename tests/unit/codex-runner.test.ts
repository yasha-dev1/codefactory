import { CodexRunner } from '../../src/core/codex-runner.js';
import { z } from 'zod';
import { spawn } from 'child_process';
import { EventEmitter, Readable } from 'stream';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execSync: vi.fn(),
}));

const mockedSpawn = vi.mocked(spawn);

function createMockChild(stdoutData: string, exitCode = 0) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: Readable;
    stderr: Readable;
    stdin: Readable;
  };
  child.stdout = new Readable({
    read() {
      this.push(stdoutData);
      this.push(null);
    },
  });
  child.stderr = new Readable({
    read() {
      this.push(null);
    },
  });
  child.stdin = new Readable({
    read() {
      this.push(null);
    },
  });

  child.stdout.on('end', () => {
    setTimeout(() => child.emit('close', exitCode), 0);
  });

  return child;
}

function mockSpawnWith(stdoutData: string, exitCode = 0) {
  const child = createMockChild(stdoutData, exitCode);
  mockedSpawn.mockReturnValue(child as any);
  return child;
}

describe('CodexRunner', () => {
  let runner: CodexRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    runner = new CodexRunner({ maxTurns: 5 });
  });

  it('should have platform set to codex', () => {
    expect(runner.platform).toBe('codex');
  });

  describe('analyze()', () => {
    it('should parse JSON from result message', async () => {
      const expectedData = { name: 'test-project', language: 'typescript' };
      const schema = z.object({ name: z.string(), language: z.string() });

      const resultMsg = JSON.stringify({
        type: 'result',
        subtype: 'success',
        result: JSON.stringify(expectedData),
      });
      mockSpawnWith(resultMsg + '\n');

      const result = await runner.analyze('Analyze this project', schema);
      expect(result).toEqual(expectedData);
    });

    it('should spawn codex CLI with correct args', async () => {
      const schema = z.object({ ok: z.boolean() });
      const resultMsg = JSON.stringify({
        type: 'result',
        result: '{"ok": true}',
      });
      mockSpawnWith(resultMsg + '\n');

      await runner.analyze('Test prompt', schema);

      expect(mockedSpawn).toHaveBeenCalledWith(
        'codex',
        expect.arrayContaining([
          '--approval-mode',
          'full-auto',
          '--quiet',
          '--output-format',
          'stream-json',
          '--max-turns',
          '5',
        ]),
        expect.objectContaining({
          stdio: ['inherit', 'pipe', 'inherit'],
        }),
      );
    });
  });

  describe('generate()', () => {
    it('should track created files from Write tool_use blocks', async () => {
      const msg = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Write',
              input: { file_path: '/project/config.json', content: '{}' },
            },
          ],
        },
      });
      mockSpawnWith(msg + '\n');

      const result = await runner.generate('Generate files');
      expect(result.filesCreated).toContain('/project/config.json');
    });

    it('should track modified files from Edit tool_use blocks', async () => {
      const msg = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Edit',
              input: { file_path: '/project/package.json', old_string: '"a"', new_string: '"b"' },
            },
          ],
        },
      });
      mockSpawnWith(msg + '\n');

      const result = await runner.generate('Modify files');
      expect(result.filesModified).toContain('/project/package.json');
    });
  });

  describe('error handling', () => {
    it('should reject when codex exits with non-zero code', async () => {
      mockSpawnWith('\n', 1);

      const schema = z.object({ data: z.string() });
      await expect(runner.analyze('Test', schema)).rejects.toThrow('Codex exited with code 1');
    });
  });
});
