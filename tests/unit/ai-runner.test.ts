import { extractJson } from '../../src/core/ai-runner.js';

describe('extractJson', () => {
  it('should extract JSON from markdown code fences with json tag', () => {
    const input = '```json\n{"count": 42}\n```';
    expect(extractJson(input)).toBe('{"count": 42}');
  });

  it('should extract JSON from markdown code fences without tag', () => {
    const input = '```\n{"key": "value"}\n```';
    expect(extractJson(input)).toBe('{"key": "value"}');
  });

  it('should extract JSON object from surrounding text', () => {
    const input = 'Here is the result: {"name": "test"} and some trailing text';
    expect(extractJson(input)).toBe('{"name": "test"}');
  });

  it('should extract JSON array from surrounding text', () => {
    const input = 'Results: [1, 2, 3] done';
    expect(extractJson(input)).toBe('[1, 2, 3]');
  });

  it('should return trimmed text when no JSON or fences found', () => {
    const input = '  just plain text  ';
    expect(extractJson(input)).toBe('just plain text');
  });

  it('should handle multiline JSON inside fences', () => {
    const input = '```json\n{\n  "a": 1,\n  "b": 2\n}\n```';
    const result = extractJson(input);
    expect(JSON.parse(result)).toEqual({ a: 1, b: 2 });
  });

  it('should prefer code fence extraction over bare JSON', () => {
    const input = 'prefix {"outer": true} ```json\n{"inner": true}\n``` suffix';
    expect(extractJson(input)).toBe('{"inner": true}');
  });

  it('should handle already-clean JSON input', () => {
    const input = '{"clean": true}';
    expect(extractJson(input)).toBe('{"clean": true}');
  });
});
