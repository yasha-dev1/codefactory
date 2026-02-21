import { ClaudeRunner } from '../../src/core/claude-runner.js';
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

  // Emit close after stdout ends
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

describe('ClaudeRunner', () => {
  let runner: ClaudeRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    runner = new ClaudeRunner({ maxTurns: 5 });
  });

  it('should have platform set to claude', () => {
    expect(runner.platform).toBe('claude');
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

    it('should extract JSON from markdown code fences', async () => {
      const schema = z.object({ count: z.number() });

      const resultMsg = JSON.stringify({
        type: 'result',
        subtype: 'success',
        result: '```json\n{"count": 42}\n```',
      });
      mockSpawnWith(resultMsg + '\n');

      const result = await runner.analyze('Count items', schema);
      expect(result).toEqual({ count: 42 });
    });

    it('should throw when no response is received', async () => {
      mockSpawnWith('\n');

      const schema = z.object({ data: z.string() });
      await expect(runner.analyze('Test', schema)).rejects.toThrow();
    });

    it('should pass correct CLI args to spawn', async () => {
      const schema = z.object({ ok: z.boolean() });
      const resultMsg = JSON.stringify({
        type: 'result',
        result: '{"ok": true}',
      });
      mockSpawnWith(resultMsg + '\n');

      await runner.analyze('Test prompt', schema);

      expect(mockedSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining([
          '--print',
          '--output-format',
          'stream-json',
          '--max-turns',
          '5',
          '--permission-mode',
          'bypassPermissions',
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
              input: { file_path: '/project/harness.config.json', content: '{}' },
            },
            {
              type: 'tool_use',
              name: 'Write',
              input: { file_path: '/project/CLAUDE.md', content: '# CLAUDE' },
            },
          ],
        },
      });
      mockSpawnWith(msg + '\n');

      const result = await runner.generate('Generate files');
      expect(result.filesCreated).toContain('/project/harness.config.json');
      expect(result.filesCreated).toContain('/project/CLAUDE.md');
      expect(result.filesModified).toEqual([]);
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
      expect(result.filesCreated).toEqual([]);
    });

    it('should deduplicate files that appear in both Write and Edit', async () => {
      const msg = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Write',
              input: { file_path: '/project/config.json', content: '{}' },
            },
            {
              type: 'tool_use',
              name: 'Edit',
              input: { file_path: '/project/config.json', old_string: '{}', new_string: '{"a":1}' },
            },
          ],
        },
      });
      mockSpawnWith(msg + '\n');

      const result = await runner.generate('Create and modify');
      expect(result.filesCreated).toContain('/project/config.json');
      expect(result.filesModified).not.toContain('/project/config.json');
    });
  });

  describe('error handling', () => {
    it('should reject when claude exits with non-zero code', async () => {
      mockSpawnWith('\n', 1);

      const schema = z.object({ data: z.string() });
      await expect(runner.analyze('Test', schema)).rejects.toThrow('Claude exited with code 1');
    });

    it('should throw on invalid JSON in analyze response', async () => {
      const resultMsg = JSON.stringify({
        type: 'result',
        result: 'not valid json at all',
      });
      mockSpawnWith(resultMsg + '\n');

      const schema = z.object({ data: z.string() });
      await expect(runner.analyze('Test', schema)).rejects.toThrow();
    });
  });
});
