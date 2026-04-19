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
import {
  appendGithubPollTick,
  appendHeartbeatTick,
  createAgentSession,
  getProviderById,
  loadGithubConnection,
  loadHeartbeatConfig,
  loadPreferences,
} from '@harnext/core';
import {
  runGithubPollMode,
  runHeartbeatMode,
  runInteractiveMode,
  runPrintMode,
} from './modes/index.js';

const FALLBACK_PROVIDER = 'anthropic';
const FALLBACK_MODEL = 'claude-sonnet-4-6';

export async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  if (args.mode === 'print' && args.messages.length === 0) {
    console.error(chalk.red('Error: print mode requires a message'));
    console.error(chalk.dim('Usage: harnext -p "your message"'));
    process.exit(1);
  }

  if (args.mode === 'heartbeat') {
    if (!args.heartbeatName) {
      console.error(chalk.red('Error: --heartbeat requires a name'));
      console.error(chalk.dim('Usage: harnext --heartbeat <name>'));
      process.exit(1);
    }
    const exitCode = await runHeartbeat(
      args.cwd,
      args.heartbeatName,
      args.thinkingLevel as ThinkingLevel,
    );
    process.exit(exitCode);
  }

  if (args.mode === 'github-poll') {
    const exitCode = await runGithubPoll(args.cwd, args.thinkingLevel as ThinkingLevel);
    process.exit(exitCode);
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

/**
 * Cron entry point. Non-interactive, never prompts for auth — if auth isn't
 * already stored, we record a failure record and exit 1.
 */
async function runHeartbeat(
  cwd: string,
  name: string,
  thinkingLevel: ThinkingLevel,
): Promise<number> {
  const config = loadHeartbeatConfig(cwd, name);
  if (!config) {
    appendHeartbeatTick(cwd, name, {
      ts: new Date().toISOString(),
      exit: 1,
      durationMs: 0,
      prompt: '',
      output: '',
      error: `no heartbeat config for "${name}" in .harnext/heartbeats/`,
    });
    return 1;
  }

  const prefs = loadPreferences();
  const resolvedProvider =
    config.provider ?? prefs.defaultProvider ?? FALLBACK_PROVIDER;
  const resolvedModel =
    config.model ??
    prefs.defaultModels?.[resolvedProvider] ??
    getProviderById(resolvedProvider)?.defaultModel ??
    FALLBACK_MODEL;

  try {
    const { session } = await createAgentSession({
      provider: resolvedProvider,
      modelId: resolvedModel,
      cwd,
      thinkingLevel,
    });
    return await runHeartbeatMode(session, { cwd, name, prompt: config.prompt });
  } catch (err) {
    appendHeartbeatTick(cwd, name, {
      ts: new Date().toISOString(),
      exit: 1,
      durationMs: 0,
      prompt: config.prompt,
      output: '',
      error: err instanceof Error ? err.message : String(err),
    });
    return 1;
  }
}

/**
 * Cron entry point for the GitHub issue poller. Same unattended-failure
 * discipline as runHeartbeat: no prompt for auth, any failure is captured
 * as a tick log record and surfaced via exit code.
 */
async function runGithubPoll(cwd: string, thinkingLevel: ThinkingLevel): Promise<number> {
  const config = loadGithubConnection(cwd);
  if (!config) {
    appendGithubPollTick(cwd, {
      ts: new Date().toISOString(),
      itemNumber: -1,
      itemKind: 'issue',
      stageId: '(no-config)',
      stageLabel: '',
      mode: 'yolo',
      exit: 1,
      durationMs: 0,
      output: '',
      error: `no github connection config at .harnext/github.json (run /connect-github first)`,
    });
    return 1;
  }

  const prefs = loadPreferences();
  const resolvedProvider = prefs.defaultProvider ?? FALLBACK_PROVIDER;
  const resolvedModel =
    prefs.defaultModels?.[resolvedProvider] ??
    getProviderById(resolvedProvider)?.defaultModel ??
    FALLBACK_MODEL;

  try {
    const { session } = await createAgentSession({
      provider: resolvedProvider,
      modelId: resolvedModel,
      cwd,
      thinkingLevel,
    });
    return await runGithubPollMode(session, { cwd, config });
  } catch (err) {
    appendGithubPollTick(cwd, {
      ts: new Date().toISOString(),
      itemNumber: -1,
      itemKind: 'issue',
      stageId: '(session-error)',
      stageLabel: '',
      mode: 'yolo',
      exit: 1,
      durationMs: 0,
      output: '',
      error: err instanceof Error ? err.message : String(err),
    });
    return 1;
  }
}
