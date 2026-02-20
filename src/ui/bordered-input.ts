import { createPrompt, useState, useKeypress, isEnterKey } from '@inquirer/core';

import chalk from 'chalk';

export interface BorderedInputConfig {
  hint?: string;
  accentColor?: string;
}

const _borderedInput = createPrompt<string, BorderedInputConfig>((config, done) => {
  const [value, setValue] = useState('');

  const accentColor = config.accentColor ?? '#FF8C00';
  const cols = Math.max(40, (process.stdout.columns || 80) - 4);
  const b = (s: string) => chalk.hex(accentColor)(s);

  useKeypress((key, rl) => {
    if (isEnterKey(key)) {
      done(rl.line.trim());
      return;
    }
    setValue(rl.line.trim());
  });

  const top = b('╭' + '─'.repeat(cols) + '╮');
  const bottom = b('╰' + '─'.repeat(cols) + '╯');
  const hint = config.hint ? chalk.dim('  ' + config.hint) : '';

  return [top + '\n' + b('│ ') + value, bottom + (hint ? '\n' + hint : '')];
});

export function borderedInput(config: BorderedInputConfig): Promise<string> {
  return _borderedInput(config);
}
