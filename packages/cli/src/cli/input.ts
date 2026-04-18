import { emitKeypressEvents } from 'node:readline';

export type InputResult =
  | { type: 'text'; value: string }
  | { type: 'exit' };

export interface CompletionItem {
  text: string;
  hint?: string;
}

export interface InputOptions {
  topBorder?: string;
  bottomBorder?: string;
  completions?: CompletionItem[];
}

/**
 * Raw-mode line input with inline ghost-text and suggestion list.
 *
 * - Regular text: accumulates and returns on Enter
 * - Tab: accepts the ghost-text completion
 * - Ctrl+C / Ctrl+D: returns type 'exit'
 * - topBorder / bottomBorder: pre-rendered lines drawn above/below the input
 * - completions: shown as a suggestion list below the input while typing
 */
export async function readInput(promptStr: string, options?: InputOptions): Promise<InputResult> {
  const completions = options?.completions;

  // Draw top border
  if (options?.topBorder) {
    process.stdout.write(options.topBorder + '\n');
  }

  process.stdout.write(promptStr);

  const stdin = process.stdin;
  const wasRaw = stdin.isRaw ?? false;

  emitKeypressEvents(stdin);
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume();

  let buffer = '';
  let ghostLen = 0;

  // eslint-disable-next-line no-control-regex
  const promptVisibleLen = promptStr.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').length;

  function clearGhost() {
    if (ghostLen > 0) {
      process.stdout.write('\x1B[K');
      ghostLen = 0;
    }
  }

  function showGhost() {
    if (!completions || buffer.length === 0) return;
    const match = completions.find((c) => c.text.toLowerCase().startsWith(buffer.toLowerCase()));
    if (match && match.text !== buffer) {
      const rest = match.text.slice(buffer.length);
      process.stdout.write(`\x1B[2m${rest}\x1B[22m`);
      process.stdout.write(`\x1B[${rest.length}D`);
      ghostLen = rest.length;
    }
  }

  function renderBelow() {
    // Move below input line and clear everything
    process.stdout.write('\n\x1B[J');
    let linesDown = 1;

    // Show matching suggestions
    if (completions && buffer.length > 0) {
      const matches = completions.filter(
        (c) => c.text.toLowerCase().startsWith(buffer.toLowerCase()) && c.text !== buffer,
      );
      for (const m of matches) {
        const hint = m.hint ? `  \x1B[2m${m.hint}\x1B[22m` : '';
        process.stdout.write(`  \x1B[36m${m.text}\x1B[39m${hint}\n`);
        linesDown++;
      }
    }

    // Bottom border (may span multiple lines)
    if (options?.bottomBorder) {
      process.stdout.write(options.bottomBorder);
      linesDown += (options.bottomBorder.match(/\n/g) || []).length;
    }

    // Move cursor back to input line using relative movement
    process.stdout.write(`\x1B[${linesDown}A`);
    process.stdout.write(`\x1B[${promptVisibleLen + buffer.length + 1}G`);
  }

  // Initial render of area below input (just the bottom border)
  renderBelow();

  return new Promise<InputResult>((resolve) => {
    const cleanup = () => {
      stdin.removeListener('keypress', onKeypress);
      if (stdin.isTTY) stdin.setRawMode(wasRaw);
    };

    const finishLine = () => {
      clearGhost();
      // Clear suggestions, keep bottom border
      process.stdout.write('\n\x1B[J');
      if (options?.bottomBorder) {
        process.stdout.write(options.bottomBorder + '\n');
      }
    };

    const onKeypress = (
      str: string | undefined,
      key: { name?: string; ctrl?: boolean; meta?: boolean; sequence?: string },
    ) => {
      if (!key) return;

      // Exit
      if (key.ctrl && (key.name === 'c' || key.name === 'd')) {
        finishLine();
        cleanup();
        resolve({ type: 'exit' });
        return;
      }

      // Submit
      if (key.name === 'return') {
        finishLine();
        cleanup();
        resolve({ type: 'text', value: buffer.trim() });
        return;
      }

      // Tab — accept ghost text completion
      if (key.name === 'tab' && completions && buffer.length > 0) {
        const match = completions.find((c) =>
          c.text.toLowerCase().startsWith(buffer.toLowerCase()),
        );
        if (match && match.text !== buffer) {
          clearGhost();
          const extra = match.text.slice(buffer.length);
          buffer = match.text;
          process.stdout.write(extra);
          showGhost();
          renderBelow();
        }
        return;
      }

      // Backspace
      if (key.name === 'backspace') {
        if (buffer.length > 0) {
          clearGhost();
          buffer = buffer.slice(0, -1);
          process.stdout.write('\b \b');
          showGhost();
          renderBelow();
        }
        return;
      }

      // Regular character
      if (str && str.length === 1 && !key.ctrl && !key.meta && str.charCodeAt(0) >= 32) {
        clearGhost();
        buffer += str;
        process.stdout.write(str);
        showGhost();
        renderBelow();
      }
    };

    stdin.on('keypress', onKeypress);
  });
}
