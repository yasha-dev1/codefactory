import {
  createPrompt,
  useState,
  useKeypress,
  isEnterKey,
  isUpKey,
  isDownKey,
  isTabKey,
} from '@inquirer/core';

import chalk from 'chalk';

export interface SlashCommand {
  name: string;
  description?: string;
}

export interface BorderedInputConfig {
  hint?: string;
  accentColor?: string;
  commands?: SlashCommand[];
}

const MAX_SUGGESTIONS = 5;

const _borderedInput = createPrompt<string, BorderedInputConfig>((config, done) => {
  const [value, setValue] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const accentColor = config.accentColor ?? '#FF8C00';
  const cols = Math.max(40, (process.stdout.columns || 80) - 4);
  const b = (s: string) => chalk.hex(accentColor)(s);

  const commands = config.commands ?? [];
  const trimmed = value;
  const showSuggestions = trimmed.startsWith('/') && commands.length > 0;
  const filter = trimmed.slice(1).toLowerCase();
  const filtered = showSuggestions
    ? commands.filter((c) => c.name.toLowerCase().includes(filter)).slice(0, MAX_SUGGESTIONS)
    : [];

  useKeypress((key, rl) => {
    if (isEnterKey(key)) {
      done(rl.line.trim());
      return;
    }

    if (showSuggestions && filtered.length > 0) {
      if (isUpKey(key)) {
        setSelectedIndex(selectedIndex <= 0 ? filtered.length - 1 : selectedIndex - 1);
        return;
      }
      if (isDownKey(key)) {
        setSelectedIndex(selectedIndex >= filtered.length - 1 ? 0 : selectedIndex + 1);
        return;
      }
      if (isTabKey(key)) {
        const selected = filtered[selectedIndex];
        if (selected) {
          const newValue = `/${selected.name}`;
          // Clear current line by sending backspaces, then write the new value.
          // We use the underlying readline's key simulation by writing the
          // control character for kill-line (\x15 = Ctrl+U) followed by the value.
          rl.write('\x15');
          rl.write(newValue);
          setValue(newValue);
          setSelectedIndex(0);
        }
        return;
      }
    }

    setValue(rl.line.trim());
    setSelectedIndex(0);
  });

  const top = b('\u256d' + '\u2500'.repeat(cols) + '\u256e');
  const bottom = b('\u2570' + '\u2500'.repeat(cols) + '\u256f');
  const hint = config.hint ? chalk.dim('  ' + config.hint) : '';

  let suggestionContent = '';
  if (showSuggestions && filtered.length > 0) {
    const lines = filtered.map((cmd, i) => {
      const prefix = i === selectedIndex ? chalk.hex(accentColor)('\u25b6 ') : '  ';
      const name = i === selectedIndex ? chalk.bold(`/${cmd.name}`) : chalk.dim(`/${cmd.name}`);
      const desc = cmd.description ? chalk.dim(` \u2014 ${cmd.description}`) : '';
      return prefix + name + desc;
    });
    suggestionContent = '\n' + lines.join('\n');
  }

  return [
    top + '\n' + b('\u2502 ') + value,
    bottom + (hint ? '\n' + hint : '') + suggestionContent,
  ];
});

export function borderedInput(config: BorderedInputConfig): Promise<string> {
  return _borderedInput(config, { clearPromptOnDone: true });
}
