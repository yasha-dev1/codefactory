import type { AgentEvent } from '@mariozechner/pi-agent-core';
import { compactNow, estimateTotalTokens, setDefault } from '@harnext/core';
import chalk from 'chalk';

import { createTextarea } from '../../cli/input.js';
import type { Textarea } from '../../cli/input.js';
import { pickModel } from '../../cli/model-picker.js';
import { select } from '../../cli/select.js';
import type { SelectItem } from '../../cli/select.js';
import type { AgentSession } from '@harnext/core';
import { createMarkdownStreamer } from './markdown-stream.js';
import type { MarkdownStreamer } from './markdown-stream.js';
import * as render from './render.js';

export interface InteractiveModeOptions {
  provider: string;
  model: string;
}

// ── Slash command registry ───────────────────────────────────────────

interface SlashCommand {
  name: string;
  description: string;
  action: (ctx: CommandContext) => Promise<boolean>; // true = continue, false = exit
}

interface CommandContext {
  session: AgentSession;
  getProvider: () => string;
  getModel: () => string;
  setModel: (provider: string, modelId: string, model: unknown) => void;
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: '/model',
    description: 'Switch provider and model',
    action: async (ctx) => {
      const result = await pickModel();
      if (result) {
        ctx.setModel(result.provider, result.model.id, result.model);
        setDefault(result.provider, result.model.id);
        console.log(
          chalk.green('  Switched to ') + chalk.bold(`${result.provider}/${result.model.id}`),
        );
      } else {
        console.log(chalk.dim('  Cancelled.'));
      }
      console.log();
      return true;
    },
  },
  {
    name: '/compact',
    description: 'Compact conversation history',
    action: async (ctx) => {
      const spinner = render.startSpinner('Compacting...');
      try {
        const result = await compactNow(ctx.session.agent);
        spinner.stop();
        if (result.compacted) {
          console.log(
            chalk.green('  Compacted: ') +
              chalk.dim(
                `${result.originalMessages} → ${result.newMessages} messages, ` +
                  `~${result.originalTokens} → ~${result.compactedTokens} tokens`,
              ),
          );
        } else {
          console.log(chalk.dim('  Not enough messages to compact.'));
        }
      } catch {
        spinner.stop();
        console.log(chalk.red('  Compaction failed.'));
      }
      console.log();
      return true;
    },
  },
  {
    name: '/help',
    description: 'Show available commands',
    action: async () => {
      console.log();
      console.log(chalk.bold('  Commands:'));
      for (const cmd of SLASH_COMMANDS) {
        const pad = 10 - cmd.name.length;
        console.log(
          chalk.cyan(`  ${cmd.name}`) + ' '.repeat(pad) + chalk.dim(`— ${cmd.description}`),
        );
      }
      console.log(chalk.dim('\n  Tip: type / to open the command selector\n'));
      return true;
    },
  },
  {
    name: '/quit',
    description: 'Exit harnext',
    action: async () => false,
  },
];

async function selectSlashCommand(): Promise<SlashCommand | undefined> {
  const items: SelectItem<SlashCommand>[] = SLASH_COMMANDS.map((cmd) => ({
    label: cmd.name,
    value: cmd,
    hint: cmd.description,
  }));

  return select(items, { title: 'Select a command' });
}

function findSlashCommand(input: string): SlashCommand | undefined {
  return SLASH_COMMANDS.find((cmd) => cmd.name === input);
}

// ── Animated spinner (rendered inline on the info line) ─────────────

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const LOADING_MESSAGES = [
  'Working...',
  'Thinking...',
  'Cooking...',
  'Brewing...',
  'Crafting...',
  'Pondering...',
  'Computing...',
  'Conjuring...',
  'Assembling...',
  'Wiring...',
  'Compiling...',
  'Inventing...',
  'Scheming...',
  'Plotting...',
  'Crunching...',
];

function randomMessage(): string {
  return LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
}

/**
 * Interactive REPL mode with a sticky textarea pinned to the bottom of the
 * terminal via a terminal scroll region. Agent output streams naturally
 * above; the textarea stays visible so the user can keep typing and submit
 * mid-run, which queues as a steering message for the live agent turn.
 */
export async function runInteractiveMode(
  session: AgentSession,
  options: InteractiveModeOptions,
): Promise<void> {
  const cwd = process.cwd();
  let activeProvider = options.provider;
  let activeModel = options.model;
  const pendingToolArgs: Map<string, Record<string, unknown>> = new Map();
  let currentText = '';
  let markdown: MarkdownStreamer | null = null;
  let agentBusy = false;

  // Assistant-text streaming state. `asstPendingNewlines` holds trailing
  // newlines from recent chunks so we don't emit them yet — if the stream
  // ends with more trailing newlines than we want, we just drop them.
  // `asstAtLineStart` tracks whether the cursor is at column 0 of a fresh
  // row, used by message_end to decide whether to emit a final '\n'.
  let asstPendingNewlines = '';
  let asstAtLineStart = true;

  function processAsstChunk(styled: string): string {
    if (styled.length === 0) return '';
    const combined = asstPendingNewlines + styled;
    const m = combined.match(/\n+$/);
    const toWrite = m ? combined.slice(0, -m[0].length) : combined;
    asstPendingNewlines = m ? m[0] : '';
    if (toWrite.length === 0) return '';
    asstAtLineStart = toWrite.endsWith('\n');
    return toWrite;
  }

  let spinnerPrefix = '';
  let spinnerMsg = '';
  let spinnerFrame = 0;
  let spinnerLastCycle = 0;
  let spinnerTimer: NodeJS.Timeout | null = null;

  // Print the static header before the textarea — it stays above content
  // and scrolls out naturally as the session grows.
  process.stdout.write(render.header());

  const completions = SLASH_COMMANDS.map((cmd) => ({
    text: cmd.name,
    hint: cmd.description,
  }));

  // eslint-disable-next-line prefer-const
  let textarea: Textarea;

  function tickSpinner() {
    const CYCLE_MS = 3000;
    if (Date.now() - spinnerLastCycle >= CYCLE_MS) {
      let next = randomMessage();
      while (next === spinnerMsg && LOADING_MESSAGES.length > 1) next = randomMessage();
      spinnerMsg = next;
      spinnerLastCycle = Date.now();
    }
    const frame = SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length];
    spinnerFrame++;
    spinnerPrefix = `  ${chalk.cyan(frame)} ${chalk.dim(spinnerMsg)}`;
    textarea.redraw();
  }

  function startSpinner() {
    if (spinnerTimer) return;
    spinnerMsg = randomMessage();
    spinnerLastCycle = Date.now();
    spinnerFrame = 0;
    tickSpinner();
    spinnerTimer = setInterval(tickSpinner, 80);
  }

  function stopSpinner() {
    if (spinnerTimer) {
      clearInterval(spinnerTimer);
      spinnerTimer = null;
    }
    spinnerPrefix = '';
    if (textarea) textarea.redraw();
  }

  textarea = createTextarea({
    prompt: render.prompt(),
    getTopBorder: () => {
      const sep = render.separator(chalk.magenta);
      const body = spinnerPrefix ? `${spinnerPrefix}\n${sep}` : sep;
      return `\n${body}`;
    },
    getBottomBorder: () => {
      const ctxTokens = estimateTotalTokens(session.messages);
      const ctxWindow = session.agent.state.model.contextWindow;
      const ctxPercent = ctxWindow ? (ctxTokens / ctxWindow) * 100 : undefined;
      return render.inputFooter(activeProvider, activeModel, cwd, ctxPercent);
    },
    completions,
  });

  session.subscribe(async (event: AgentEvent) => {
    switch (event.type) {
      case 'message_start':
        if (event.message.role === 'assistant') {
          currentText = '';
          markdown = createMarkdownStreamer();
          asstPendingNewlines = '';
          asstAtLineStart = true;
          // Leading blank separates assistant text from whatever preceded
          // (user msg, tool-end card, or another assistant message).
          textarea.writeAbove('\n');
        }
        break;

      case 'message_update': {
        if (event.message.role !== 'assistant') break;
        const fullText = event.message.content
          .filter((c: { type: string }) => c.type === 'text')
          .map((c: { type: string; text?: string }) => (c as { text: string }).text)
          .join('');
        if (fullText.length > currentText.length) {
          const delta = fullText.slice(currentText.length);
          const styled = markdown ? markdown.feed(delta) : delta;
          const out = processAsstChunk(styled);
          if (out.length > 0) textarea.writeAbove(out);
          currentText = fullText;
        }
        break;
      }

      case 'message_end':
        if (event.message.role === 'assistant' && currentText.length > 0) {
          const tail = markdown ? markdown.flush() : '';
          const out = processAsstChunk(tail);
          if (out.length > 0) textarea.writeAbove(out);
          // End the block on a fresh row (column 0). Buffered trailing
          // newlines are discarded — the next card's top_pad provides the
          // separator, so extra LLM newlines would just pile on as blank rows.
          if (!asstAtLineStart) textarea.writeAbove('\n');
          asstPendingNewlines = '';
        }
        markdown = null;
        break;

      case 'tool_execution_start': {
        pendingToolArgs.set(event.toolCallId, event.args);
        // The card's own top padding (blank tinted row) supplies the separation
        // from whatever preceded — adding a leading '\n' here would stack a
        // plain blank row on top of that and read as excess whitespace.
        textarea.writeAbove(render.toolStart(event.toolName, event.args) + '\n');
        break;
      }

      case 'tool_execution_end': {
        const args = pendingToolArgs.get(event.toolCallId) ?? {};
        pendingToolArgs.delete(event.toolCallId);
        const resultText = event.result?.content?.[0]?.text ?? '';
        textarea.writeAbove(
          render.toolEnd(event.toolName, args, resultText, event.isError) + '\n',
        );
        break;
      }
    }
  });

  const cmdCtx: CommandContext = {
    session,
    getProvider: () => activeProvider,
    getModel: () => activeModel,
    setModel: (provider, modelId, model) => {
      activeProvider = provider;
      activeModel = modelId;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      session.agent.state.model = model as any;
    },
  };

  await new Promise<void>((resolve) => {
    // Run a command with full terminal control: tear down the sticky textarea,
    // let the command's own UI (select menus, prompts) own stdin, then restore.
    // Returns true if the session should continue, false if it should exit.
    const runWithPause = async (fn: () => Promise<boolean>): Promise<boolean> => {
      textarea.pause();
      try {
        return await fn();
      } finally {
        textarea.resume();
      }
    };

    textarea.on('exit', () => {
      stopSpinner();
      textarea.close();
      resolve();
    });

    textarea.on('submit', async (input: string) => {
      if (!input) return;

      if (input === '/' && !agentBusy) {
        const shouldContinue = await runWithPause(async () => {
          const cmd = await selectSlashCommand();
          if (!cmd) return true;
          return cmd.action(cmdCtx);
        });
        if (!shouldContinue) {
          stopSpinner();
          textarea.close();
          resolve();
        }
        return;
      }

      if (input.startsWith('/') && !agentBusy) {
        const cmd = findSlashCommand(input);
        if (cmd) {
          const shouldContinue = await runWithPause(() => cmd.action(cmdCtx));
          if (!shouldContinue) {
            stopSpinner();
            textarea.close();
            resolve();
          }
        } else {
          textarea.writeAbove(
            chalk.yellow(`  Unknown command: ${input}`) +
              '\n' +
              chalk.dim('  Type /help to see available commands') +
              '\n\n',
          );
        }
        return;
      }

      // Echo the user message above the textarea. Block separators are
      // attached as a leading '\n' on the *next* block, so we just terminate
      // this one with a single '\n'.
      textarea.writeAbove(render.userMessage(input) + '\n');

      // Mid-run submit → queue as steering rather than starting a new prompt.
      if (agentBusy) {
        try {
          session.agent.steer({
            role: 'user',
            content: input,
            timestamp: Date.now(),
          });
        } catch (err) {
          textarea.writeAbove(
            chalk.red('  Steering failed: ') +
              (err instanceof Error ? err.message : String(err)) +
              '\n\n',
          );
        }
        return;
      }

      agentBusy = true;
      startSpinner();
      try {
        await session.prompt(input);
      } catch (error) {
        textarea.writeAbove(
          chalk.red('  Error: ') +
            (error instanceof Error ? error.message : String(error)) +
            '\n\n',
        );
      } finally {
        agentBusy = false;
        stopSpinner();
      }
    });
  });

  process.stdin.unref();
}
