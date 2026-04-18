import { EventEmitter } from 'node:events';
import { emitKeypressEvents } from 'node:readline';

const ESC = '\x1B[';
const HIDE_CURSOR = `${ESC}?25l`;
const SHOW_CURSOR = `${ESC}?25h`;

export interface CompletionItem {
  text: string;
  hint?: string;
}

export interface TextareaOptions {
  prompt: string;
  getTopBorder?: () => string;
  getBottomBorder?: () => string;
  completions?: CompletionItem[];
}

export interface Textarea {
  on(event: 'submit', cb: (value: string) => void): Textarea;
  on(event: 'exit', cb: () => void): Textarea;
  writeAbove(text: string): void;
  redraw(): void;
  pause(): void;
  resume(): void;
  close(): void;
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

function countLines(s: string): number {
  if (!s) return 0;
  const nl = (s.match(/\n/g) || []).length;
  return nl + (s.endsWith('\n') ? 0 : 1);
}

/**
 * Persistent "sticky" textarea pinned to the bottom of the terminal for the
 * duration of the session.
 *
 * On every writeAbove() or redraw() the textarea is erased, content flows
 * onto the content area above, and the textarea is immediately re-rendered
 * below — so it stays visible throughout streaming. Cursor is hidden for the
 * duration of the dance to avoid visible jitter.
 *
 * Content continuity across writeAbove calls is preserved via `contentCol`,
 * the column where the previous content ended. When the last write did not
 * end in a newline, the next write continues from that same screen column so
 * streamed tokens concatenate on the same row.
 *
 * All cursor movement is relative (no DEC scroll region, no absolute row
 * positioning) so the frame stays correct across terminals with inconsistent
 * dimension reporting.
 */
export function createTextarea(options: TextareaOptions): Textarea {
  const emitter = new EventEmitter();
  const stdin = process.stdin;
  const wasRaw = stdin.isRaw ?? false;
  const hasTTY = !!stdin.isTTY;

  let buffer = '';
  let ghostLen = 0;
  let textareaDrawn = false;
  // Column where the next content append should land. 0 means "fresh row".
  // Non-zero means the previous write ended mid-line and the next write
  // should continue from that column on the row directly above the textarea.
  let contentCol = 0;
  let active = false;
  let closed = false;
  // Captured at draw time so that erase always unwinds the exact layout
  // that was drawn, even if getTopBorder / getBottomBorder changes shape
  // (e.g. a spinner line appearing) between draws.
  let lastTopLines = 0;
  let lastBottomLines = 0;

  const promptStr = options.prompt;
  const promptVisibleLen = stripAnsi(promptStr).length;

  function clearGhost() {
    if (!hasTTY || ghostLen === 0) return;
    process.stdout.write(`${ESC}K`);
    ghostLen = 0;
  }

  function drawGhost() {
    if (!hasTTY || !options.completions || buffer.length === 0) return;
    const match = options.completions.find((c) =>
      c.text.toLowerCase().startsWith(buffer.toLowerCase()),
    );
    if (match && match.text !== buffer) {
      const rest = match.text.slice(buffer.length);
      process.stdout.write(`${ESC}2m${rest}${ESC}22m`);
      process.stdout.write(`${ESC}${rest.length}D`);
      ghostLen = rest.length;
    }
  }

  // Advance contentCol as if `text` were just written at current cursor pos.
  // Modulo termWidth so extremely long unwrapped lines don't make contentCol
  // blow up past what a relative move can express.
  function advanceContentCol(text: string) {
    const termW = Math.max(1, process.stdout.columns ?? 80);
    const idx = text.lastIndexOf('\n');
    if (idx < 0) {
      contentCol = (contentCol + stripAnsi(text).length) % termW;
    } else {
      contentCol = stripAnsi(text.slice(idx + 1)).length % termW;
    }
  }

  // Draw the textarea starting at the current cursor position. If the
  // previous content ended mid-line (contentCol > 0) we emit a newline
  // first so the top border lands on a fresh row.
  function drawTextarea() {
    if (!hasTTY) return;
    process.stdout.write(HIDE_CURSOR);
    if (contentCol > 0) {
      process.stdout.write('\n');
    }
    if (options.getTopBorder) {
      const top = options.getTopBorder();
      process.stdout.write(top);
      process.stdout.write('\n');
      lastTopLines = countLines(top);
    } else {
      lastTopLines = 0;
    }
    process.stdout.write(promptStr);
    process.stdout.write(buffer);
    ghostLen = 0;
    drawGhost();
    if (options.getBottomBorder) {
      const bot = options.getBottomBorder();
      process.stdout.write('\n');
      process.stdout.write(bot);
      lastBottomLines = countLines(bot);
      if (lastBottomLines > 0) process.stdout.write(`${ESC}${lastBottomLines}A`);
    } else {
      lastBottomLines = 0;
    }
    // Relative-only reposition to end of buffer on the input row.
    process.stdout.write('\r');
    const col = promptVisibleLen + buffer.length;
    if (col > 0) process.stdout.write(`${ESC}${col}C`);
    textareaDrawn = true;
    process.stdout.write(SHOW_CURSOR);
  }

  // Erase the textarea. Assumes cursor is on the input line at buffer end.
  // Uses the *last-drawn* top/bottom line counts so dynamic shape changes
  // (spinner line appearing/vanishing) unwind to the correct origin.
  // After: cursor is positioned where the next content write should land —
  // either at col 1 of a fresh row (contentCol == 0) or at contentCol of
  // the row directly above the textarea (contentCol > 0).
  function eraseTextarea() {
    if (!hasTTY || !textareaDrawn) return;
    process.stdout.write(HIDE_CURSOR);
    clearGhost();
    process.stdout.write('\r');
    if (lastTopLines > 0) process.stdout.write(`${ESC}${lastTopLines}A`);
    // Clear from top-border-row to end of screen.
    process.stdout.write(`${ESC}J`);
    textareaDrawn = false;
    if (contentCol > 0) {
      process.stdout.write(`${ESC}1A`);
      process.stdout.write(`${ESC}${contentCol}C`);
    }
  }

  function writeAbove(text: string) {
    if (!hasTTY || !active) {
      process.stdout.write(text);
      return;
    }
    if (textareaDrawn) eraseTextarea();
    process.stdout.write(text);
    advanceContentCol(text);
    drawTextarea();
  }

  function redraw() {
    if (!hasTTY || !active) return;
    if (textareaDrawn) eraseTextarea();
    drawTextarea();
  }

  const onKeypress = (
    str: string | undefined,
    key: { name?: string; ctrl?: boolean; meta?: boolean },
  ) => {
    if (!active || !key) return;

    if (key.ctrl && (key.name === 'c' || key.name === 'd')) {
      emitter.emit('exit');
      return;
    }

    if (!textareaDrawn) drawTextarea();

    if (key.name === 'return') {
      const value = buffer.trim();
      clearGhost();
      buffer = '';
      // Reset the input line to just the prompt, in place.
      process.stdout.write('\r');
      process.stdout.write(`${ESC}K`);
      process.stdout.write(promptStr);
      emitter.emit('submit', value);
      return;
    }

    if (key.name === 'tab' && options.completions && buffer.length > 0) {
      const match = options.completions.find((c) =>
        c.text.toLowerCase().startsWith(buffer.toLowerCase()),
      );
      if (match && match.text !== buffer) {
        clearGhost();
        const extra = match.text.slice(buffer.length);
        buffer = match.text;
        process.stdout.write(extra);
        drawGhost();
      }
      return;
    }

    if (key.name === 'backspace') {
      if (buffer.length > 0) {
        clearGhost();
        buffer = buffer.slice(0, -1);
        process.stdout.write('\b \b');
        drawGhost();
      }
      return;
    }

    if (str && str.length === 1 && !key.ctrl && !key.meta && str.charCodeAt(0) >= 32) {
      clearGhost();
      buffer += str;
      process.stdout.write(str);
      drawGhost();
    }
  };

  function pause() {
    if (!active) return;
    active = false;
    if (textareaDrawn) eraseTextarea();
    process.stdout.write(SHOW_CURSOR);
    stdin.removeListener('keypress', onKeypress);
    if (hasTTY) stdin.setRawMode(wasRaw);
  }

  function resume() {
    if (active || closed) return;
    emitKeypressEvents(stdin);
    if (hasTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.on('keypress', onKeypress);
    active = true;
    drawTextarea();
  }

  function close() {
    if (closed) return;
    closed = true;
    if (active) {
      active = false;
      if (textareaDrawn) eraseTextarea();
      process.stdout.write(SHOW_CURSOR);
      stdin.removeListener('keypress', onKeypress);
      if (hasTTY) stdin.setRawMode(wasRaw);
    }
  }

  emitKeypressEvents(stdin);
  if (hasTTY) stdin.setRawMode(true);
  stdin.resume();
  stdin.on('keypress', onKeypress);
  active = true;
  drawTextarea();

  const api = Object.assign(emitter, {
    writeAbove,
    redraw,
    pause,
    resume,
    close,
  }) as unknown as Textarea;

  return api;
}
