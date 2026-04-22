import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { logger } from '../ui/logger.js';
import { selectPrompt } from '../ui/prompts.js';
import { isGitRepo, getRepoRoot } from '../utils/git.js';
import { NotAGitRepoError } from '../utils/errors.js';
import {
  CODING_AGENTS,
  CODING_AGENT_IDS,
  isCodingAgentId,
  type CodingAgentId,
  type CodingAgentSpec,
} from '../core/coding-agent-registry.js';
import { initCommand, type InitOptions } from './init.js';

export interface SetupOptions extends InitOptions {
  codingAgent?: string;
  model?: string;
}

// Maps a non-harnext coding agent to the AI platform string the underlying
// init/runner pipeline already understands. `harnext` keeps its existing
// model/provider picker, so it has no entry here.
const CODING_AGENT_TO_PLATFORM: Record<Exclude<CodingAgentId, 'harnext'>, string> = {
  'claude-code': 'claude',
  codex: 'codex',
};

export async function setupCommand(options: SetupOptions): Promise<void> {
  if (!(await isGitRepo())) {
    throw new NotAGitRepoError();
  }

  const repoRoot = await getRepoRoot();

  logger.header('CodeFactory - Setup');
  logger.dim('Choose a coding agent for this project, then walk through the harness setup wizard.');
  console.log();

  const agentId = await resolveCodingAgent(options);
  const agent = CODING_AGENTS[agentId];

  logger.info(`Coding agent: ${agent.displayName}`);
  console.log();

  if (agentId === 'harnext') {
    // Harnext keeps its existing model/provider picker — delegate verbatim.
    await initCommand(stripSetupOnlyOptions(options));
    return;
  }

  // Non-harnext agent: pick a model from the registry, then run the
  // standard onboarding with the AI platform pre-selected so init's
  // model/provider picker is skipped.
  const model = await resolveModel(agent, options.model);

  const initOpts: InitOptions = {
    ...stripSetupOnlyOptions(options),
    platform: CODING_AGENT_TO_PLATFORM[agentId],
  };

  await initCommand(initOpts);

  await persistCodingAgent(repoRoot, agentId, model);

  console.log();
  logger.success(
    `Saved coding agent "${agent.displayName}" (model: ${model}) to harness.config.json.`,
  );
  logger.dim(`Pipeline runners will invoke: ${agent.binary} ${agent.modelFlag} ${model}`);
}

async function resolveCodingAgent(options: SetupOptions): Promise<CodingAgentId> {
  if (options.codingAgent) {
    if (!isCodingAgentId(options.codingAgent)) {
      throw new Error(
        `Unknown coding agent "${options.codingAgent}". Expected one of: ${CODING_AGENT_IDS.join(', ')}.`,
      );
    }
    return options.codingAgent;
  }

  if (options.yes) {
    return 'harnext';
  }

  return selectPrompt<CodingAgentId>(
    'Which coding agent should drive this project?',
    CODING_AGENT_IDS.map((id) => ({
      name: `${CODING_AGENTS[id].displayName} — ${CODING_AGENTS[id].description}`,
      value: id,
    })),
  );
}

async function resolveModel(
  agent: CodingAgentSpec,
  requested: string | undefined,
): Promise<string> {
  if (requested) {
    if (!agent.supportedModels.includes(requested)) {
      logger.warn(
        `Model "${requested}" is not in the registry's supported list for ${agent.displayName}. Using it anyway.`,
      );
    }
    return requested;
  }

  return selectPrompt<string>(
    `Select a model for ${agent.displayName}:`,
    agent.supportedModels.map((m) => ({
      name: m === agent.defaultModel ? `${m} (default)` : m,
      value: m,
    })),
  );
}

async function persistCodingAgent(
  repoRoot: string,
  agentId: CodingAgentId,
  model: string,
): Promise<void> {
  const configPath = join(repoRoot, 'harness.config.json');

  let config: Record<string, unknown> = {};
  try {
    const raw = await readFile(configPath, 'utf-8');
    config = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // No existing config (e.g. user aborted init before harness.config.json
    // was written). Persist a minimal stub so the choice is not lost.
  }

  config.codingAgent = { id: agentId, model };
  config.lastUpdated = new Date().toISOString();

  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

function stripSetupOnlyOptions(options: SetupOptions): InitOptions {
  const { codingAgent: _codingAgent, model: _model, ...initOpts } = options;
  return initOpts;
}
