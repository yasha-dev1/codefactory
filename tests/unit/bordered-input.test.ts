import { vi, describe, it, expect, beforeEach } from 'vitest';

import type { SlashCommand, BorderedInputConfig } from '../../src/ui/bordered-input.js';

// Hoisted mock state — controls what useState returns during each render cycle
const mockCtx = vi.hoisted(() => ({
  value: '' as string,
  selectedIndex: 0,
  lastEscRef: { current: 0 },
  keypressHandler: null as
    | ((key: Record<string, unknown>, rl: Record<string, unknown>) => void)
    | null,
}));

vi.mock('@inquirer/core', () => {
  let stateCallIdx = 0;

  return {
    createPrompt: <V, C>(renderFn: (config: C, done: (v: V) => void) => unknown) => {
      return (config: C) => {
        return new Promise<V>((resolve) => {
          stateCallIdx = 0;
          renderFn(config, resolve);
        });
      };
    },

    useState: <T>(_initial: T): [T, (v: T) => void] => {
      const idx = stateCallIdx++;
      if (idx === 0) {
        return [
          mockCtx.value as unknown as T,
          (v: T) => {
            mockCtx.value = v as string;
          },
        ];
      }
      return [
        mockCtx.selectedIndex as unknown as T,
        (v: T) => {
          mockCtx.selectedIndex = v as number;
        },
      ];
    },

    useRef: <T>(_initial: T) => mockCtx.lastEscRef,

    useKeypress: (handler: (key: Record<string, unknown>, rl: Record<string, unknown>) => void) => {
      mockCtx.keypressHandler = handler;
    },

    isEnterKey: (key: Record<string, unknown>) => key.name === 'return' || key.name === 'enter',
    isUpKey: (key: Record<string, unknown>) => key.name === 'up',
    isDownKey: (key: Record<string, unknown>) => key.name === 'down',
    isTabKey: (key: Record<string, unknown>) => key.name === 'tab',
  };
});

// Mock chalk so render doesn't fail — every call returns its string argument
vi.mock('chalk', () => {
  function mock(s?: string): unknown {
    const fn = (...args: unknown[]) => mock(typeof args[0] === 'string' ? String(args[0]) : s);
    return new Proxy(fn, {
      get: (_, prop) => {
        if (prop === Symbol.toPrimitive || prop === 'toString') return () => s ?? '';
        return mock(s);
      },
    });
  }
  return { default: mock() };
});

import { borderedInput } from '../../src/ui/bordered-input.js';

describe('bordered-input types and exports', () => {
  it('should export borderedInput function', async () => {
    const mod = await import('../../src/ui/bordered-input.js');
    expect(typeof mod.borderedInput).toBe('function');
  });

  it('SlashCommand interface should accept name and optional description', () => {
    const cmd: SlashCommand = { name: 'help' };
    expect(cmd.name).toBe('help');
    expect(cmd.description).toBeUndefined();

    const cmdWithDesc: SlashCommand = { name: 'init', description: 'Run setup' };
    expect(cmdWithDesc.description).toBe('Run setup');
  });

  it('BorderedInputConfig should accept commands array', () => {
    const config: BorderedInputConfig = {
      hint: 'Type a command',
      accentColor: '#FF8C00',
      commands: [
        { name: 'help', description: 'Show help' },
        { name: 'exit', description: 'Exit' },
      ],
    };
    expect(config.commands).toHaveLength(2);
    expect(config.commands![0]!.name).toBe('help');
  });

  it('BorderedInputConfig should work without commands', () => {
    const config: BorderedInputConfig = {
      hint: 'Type something',
    };
    expect(config.commands).toBeUndefined();
  });
});

describe('bordered-input Enter key behavior', () => {
  beforeEach(() => {
    mockCtx.value = '';
    mockCtx.selectedIndex = 0;
    mockCtx.keypressHandler = null;
  });

  it('should resolve with value state on Enter, not rl.line', async () => {
    // Simulate state where user has typed text (value is kept in sync via setValue)
    mockCtx.value = 'hello world';

    const promise = borderedInput({ hint: 'test' });
    expect(mockCtx.keypressHandler).not.toBeNull();

    // rl.line is empty because readline clears it on Enter — the fix uses value instead
    mockCtx.keypressHandler!({ name: 'return' }, { line: '', write: vi.fn() });

    const result = await promise;
    expect(result).toBe('hello world');
  });

  it('should resolve with empty string when no input was typed', async () => {
    mockCtx.value = '';

    const promise = borderedInput({ hint: 'test' });
    mockCtx.keypressHandler!({ name: 'return' }, { line: '', write: vi.fn() });

    const result = await promise;
    expect(result).toBe('');
  });

  it('should select highlighted suggestion on Enter when suggestions are visible', async () => {
    // User typed '/' — shows all command suggestions
    mockCtx.value = '/';
    mockCtx.selectedIndex = 0;

    const commands: SlashCommand[] = [
      { name: 'help', description: 'Show help' },
      { name: 'exit', description: 'Exit' },
    ];

    const promise = borderedInput({ hint: 'test', commands });
    mockCtx.keypressHandler!({ name: 'return' }, { line: '', write: vi.fn() });

    const result = await promise;
    expect(result).toBe('/help');
  });

  it('should select the correct suggestion based on selectedIndex', async () => {
    mockCtx.value = '/';
    mockCtx.selectedIndex = 1;

    const commands: SlashCommand[] = [
      { name: 'help', description: 'Show help' },
      { name: 'exit', description: 'Exit' },
    ];

    const promise = borderedInput({ hint: 'test', commands });
    mockCtx.keypressHandler!({ name: 'return' }, { line: '', write: vi.fn() });

    const result = await promise;
    expect(result).toBe('/exit');
  });

  it('should filter suggestions and select matching one on Enter', async () => {
    // User typed '/he' — only 'help' matches
    mockCtx.value = '/he';
    mockCtx.selectedIndex = 0;

    const commands: SlashCommand[] = [
      { name: 'help', description: 'Show help' },
      { name: 'exit', description: 'Exit' },
      { name: 'init', description: 'Initialize' },
    ];

    const promise = borderedInput({ hint: 'test', commands });
    mockCtx.keypressHandler!({ name: 'return' }, { line: '', write: vi.fn() });

    const result = await promise;
    expect(result).toBe('/help');
  });

  it('should submit raw text when no suggestions match', async () => {
    // User typed '/xyz' — no commands match
    mockCtx.value = '/xyz';
    mockCtx.selectedIndex = 0;

    const commands: SlashCommand[] = [
      { name: 'help', description: 'Show help' },
      { name: 'exit', description: 'Exit' },
    ];

    const promise = borderedInput({ hint: 'test', commands });
    mockCtx.keypressHandler!({ name: 'return' }, { line: '', write: vi.fn() });

    const result = await promise;
    expect(result).toBe('/xyz');
  });

  it('should submit value when commands array is empty', async () => {
    mockCtx.value = '/something';
    mockCtx.selectedIndex = 0;

    const promise = borderedInput({ hint: 'test', commands: [] });
    mockCtx.keypressHandler!({ name: 'return' }, { line: '', write: vi.fn() });

    const result = await promise;
    expect(result).toBe('/something');
  });
});

describe('bordered-input double-ESC clear behavior', () => {
  beforeEach(() => {
    mockCtx.value = '';
    mockCtx.selectedIndex = 0;
    mockCtx.lastEscRef.current = 0;
    mockCtx.keypressHandler = null;
  });

  it('should clear textarea on double-ESC within 500ms', () => {
    mockCtx.value = 'hello world';

    borderedInput({ hint: 'test' });
    const write = vi.fn();
    const rl = { line: 'hello world', write };

    // Simulate first ESC — records timestamp
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    mockCtx.keypressHandler!({ name: 'escape' }, rl);
    expect(mockCtx.lastEscRef.current).toBe(now);
    expect(mockCtx.value).toBe('hello world');

    // Simulate second ESC within 500ms — clears input
    vi.spyOn(Date, 'now').mockReturnValue(now + 200);
    mockCtx.keypressHandler!({ name: 'escape' }, rl);
    expect(mockCtx.value).toBe('');
    expect(write).toHaveBeenCalledWith('\x15');
    expect(mockCtx.lastEscRef.current).toBe(0);

    vi.restoreAllMocks();
  });

  it('should not clear textarea on single ESC', () => {
    mockCtx.value = 'hello';

    borderedInput({ hint: 'test' });
    const write = vi.fn();
    const rl = { line: 'hello', write };

    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    mockCtx.keypressHandler!({ name: 'escape' }, rl);

    expect(mockCtx.value).toBe('hello');
    expect(write).not.toHaveBeenCalled();
    expect(mockCtx.lastEscRef.current).toBe(now);

    vi.restoreAllMocks();
  });

  it('should not clear if second ESC comes after 500ms', () => {
    mockCtx.value = 'some text';

    borderedInput({ hint: 'test' });
    const write = vi.fn();
    const rl = { line: 'some text', write };

    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    mockCtx.keypressHandler!({ name: 'escape' }, rl);

    // Second ESC after 600ms — too late, just updates timestamp
    vi.spyOn(Date, 'now').mockReturnValue(now + 600);
    mockCtx.keypressHandler!({ name: 'escape' }, rl);

    expect(mockCtx.value).toBe('some text');
    expect(write).not.toHaveBeenCalled();
    expect(mockCtx.lastEscRef.current).toBe(now + 600);

    vi.restoreAllMocks();
  });

  it('should reset selectedIndex when clearing', () => {
    mockCtx.value = '/he';
    mockCtx.selectedIndex = 2;

    borderedInput({
      hint: 'test',
      commands: [{ name: 'help' }, { name: 'hello' }, { name: 'hey' }],
    });
    const write = vi.fn();
    const rl = { line: '/he', write };

    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    mockCtx.keypressHandler!({ name: 'escape' }, rl);

    vi.spyOn(Date, 'now').mockReturnValue(now + 100);
    mockCtx.keypressHandler!({ name: 'escape' }, rl);

    expect(mockCtx.value).toBe('');
    expect(mockCtx.selectedIndex).toBe(0);

    vi.restoreAllMocks();
  });
});
