import { describe, it, expect } from 'vitest';

import type { SlashCommand, BorderedInputConfig } from '../../src/ui/bordered-input.js';

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
