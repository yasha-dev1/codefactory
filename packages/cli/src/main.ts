/**
 * Main entry point for the harnext CLI.
 *
 * Parses CLI arguments, resolves auth, creates the agent session,
 * and dispatches to the correct mode (interactive or print).
 */

import type { ThinkingLevel } from '@mariozechner/pi-agent-core';
import chalk from 'chalk';

import { parseArgs } from './cli/args.js';
import { ensureAuth } from './cli/onboarding.js';
import { createAgentSession, getProviderById, loadPreferences } from '@harnext/core';
import { runInteractiveMode, runPrintMode } from './modes/index.js';

const FALLBACK_PROVIDER = 'anthropic';
const FALLBACK_MODEL = 'claude-sonnet-4-6';

export async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  if (args.mode === 'print' && args.messages.length === 0) {
    console.error(chalk.red('Error: print mode requires a message'));
    console.error(chalk.dim('Usage: harnext -p "your message"'));
    process.exit(1);
  }

  // Resolve provider/model: CLI flags > saved preferences > provider's built-in default > fallback.
  const prefs = loadPreferences();
  const resolvedProvider = args.provider ?? prefs.defaultProvider ?? FALLBACK_PROVIDER;
  const resolvedModel =
    args.model ??
    prefs.defaultModels?.[resolvedProvider] ??
    getProviderById(resolvedProvider)?.defaultModel ??
    FALLBACK_MODEL;

  // Resolve auth — onboards if no API key is found
  const { provider, model } = await ensureAuth(resolvedProvider, resolvedModel);

  const { session } = await createAgentSession({
    provider,
    modelId: model,
    cwd: args.cwd,
    systemPrompt: args.systemPrompt,
    thinkingLevel: args.thinkingLevel as ThinkingLevel,
  });

  if (args.mode === 'print') {
    const exitCode = await runPrintMode(session, {
      initialMessage: args.messages.join(' '),
    });
    process.exit(exitCode);
  } else {
    await runInteractiveMode(session, {
      provider,
      model,
    });
  }
}
