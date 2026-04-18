import type { AgentEvent } from '@mariozechner/pi-agent-core';
import { compactNow, estimateTotalTokens } from '@harnext/core';
import chalk from 'chalk';

import { readInput } from '../../cli/input.js';
import { pickModel } from '../../cli/model-picker.js';
import { select } from '../../cli/select.js';
import type { SelectItem } from '../../cli/select.js';
import type { AgentSession } from '@harnext/core';
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

/**
 * Interactive REPL mode with pi-style terminal UI.
 */
export async function runInteractiveMode(
  session: AgentSession,
  options: InteractiveModeOptions,
): Promise<void> {
  const cwd = process.cwd();
  let currentText = '';
  const pendingToolArgs: Map<string, Record<string, unknown>> = new Map();
  let isStreaming = false;
  let spinner: render.Spinner | null = null;
  let spinnerMessage: string | undefined;
  let activeProvider = options.provider;
  let activeModel = options.model;

  session.subscribe(async (event: AgentEvent) => {
    switch (event.type) {
      case 'message_start':
        if (event.message.role === 'assistant') {
          currentText = '';
          isStreaming = true;
          if (!spinner) {
            spinner = render.startSpinner();
            spinnerMessage = spinner.message;
          }
        }
        break;

      case 'message_update': {
        if (event.message.role !== 'assistant') break;
        if (spinner) {
          spinner.stop();
          spinner = null;
        }
        const fullText = event.message.content
          .filter((c: { type: string }) => c.type === 'text')
          .map((c: { type: string; text?: string }) => (c as { text: string }).text)
          .join('');
        if (fullText.length > currentText.length) {
          process.stdout.write(fullText.slice(currentText.length));
          currentText = fullText;
        }
        break;
      }

      case 'message_end':
        if (event.message.role === 'assistant') {
          if (spinner) {
            spinner.stop();
            spinner = null;
          }
          spinnerMessage = undefined;
          if (currentText.length > 0) {
            process.stdout.write('\n');
          }
          isStreaming = false;
        }
        break;

      case 'tool_execution_start': {
        if (spinner) {
          spinner.stop();
          spinner = null;
        }
        if (isStreaming && currentText.length > 0) {
          process.stdout.write('\n');
        }
        pendingToolArgs.set(event.toolCallId, event.args);
        process.stdout.write('\n' + render.toolStart(event.toolName, event.args) + '\n');
        break;
      }

      case 'tool_execution_end': {
        const args = pendingToolArgs.get(event.toolCallId) ?? {};
        pendingToolArgs.delete(event.toolCallId);
        const resultText = event.result?.content?.[0]?.text ?? '';
        process.stdout.write(
          '\n' + render.toolEnd(event.toolName, args, resultText, event.isError) + '\n',
        );
        // Restart spinner with same message for this turn
        spinner = render.startSpinner(spinnerMessage);
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

  // Print header
  process.stdout.write(render.header());
  process.stdout.write('\n');

  // ── Main input loop (raw mode) ───────────────────────────────────
  while (true) {
    const topBorder = render.separator(chalk.magenta);
    const ctxTokens = estimateTotalTokens(session.messages);
    const ctxWindow = session.agent.state.model.contextWindow;
    const ctxPercent = ctxWindow ? (ctxTokens / ctxWindow) * 100 : undefined;
    const bottomBorder = render.inputFooter(activeProvider, activeModel, cwd, ctxPercent);
    const completions = SLASH_COMMANDS.map((cmd) => ({ text: cmd.name, hint: cmd.description }));
    const result = await readInput(render.prompt(), { topBorder, bottomBorder, completions });

    if (result.type === 'exit') {
      break;
    }

    const input = result.value;
    if (!input) continue;

    // Slash commands: bare `/` opens selector, `/model` etc. runs directly
    if (input === '/') {
      const cmd = await selectSlashCommand();
      if (cmd) {
        const shouldContinue = await cmd.action(cmdCtx);
        if (!shouldContinue) break;
      }
      continue;
    }
    if (input.startsWith('/')) {
      const cmd = findSlashCommand(input);
      if (cmd) {
        const shouldContinue = await cmd.action(cmdCtx);
        if (!shouldContinue) break;
      } else {
        console.log(chalk.yellow(`  Unknown command: ${input}`));
        console.log(chalk.dim('  Type /help to see available commands\n'));
      }
      continue;
    }

    // ── Normal message ─────────────────────────────────────────────
    process.stdout.write('\n' + render.userMessage(input) + '\n\n');

    try {
      await session.prompt(input);
    } catch (error) {
      console.error(
        chalk.red('Error:'),
        error instanceof Error ? error.message : String(error),
      );
    }

    process.stdout.write('\n');
  }

  // Cleanup: unref stdin so the process can exit
  process.stdin.unref();
}
