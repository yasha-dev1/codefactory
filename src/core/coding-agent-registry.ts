// Single source of truth for the coding agents the harness can drive.
// Pipeline runners and the `setup` command both import from here so a new
// agent only has to be added in one place.
//
// `supportedModels` lists are hardcoded snapshots of vendor-published model
// IDs; dynamic probing is intentionally out of scope (issue #49). See:
//   - Claude Code: https://support.claude.com/en/articles/11940350-claude-code-model-configuration
//   - Codex CLI:   https://developers.openai.com/codex/models

export type CodingAgentId = 'harnext' | 'claude-code' | 'codex';

export interface CodingAgentSpec {
  id: CodingAgentId;
  displayName: string;
  description: string;
  binary: string;
  modelFlag: string;
  supportedModels: string[];
  defaultModel: string;
}

export const CODING_AGENTS: Record<CodingAgentId, CodingAgentSpec> = {
  harnext: {
    id: 'harnext',
    displayName: 'harnext',
    description: 'CodeFactory/harnext native agent (uses configured AI platform)',
    binary: 'codefactory',
    modelFlag: '-m',
    supportedModels: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
    defaultModel: 'claude-sonnet-4-6',
  },
  'claude-code': {
    id: 'claude-code',
    displayName: 'Claude Code',
    description: 'Anthropic Claude Code CLI — claude',
    binary: 'claude',
    modelFlag: '--model',
    supportedModels: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
    defaultModel: 'claude-sonnet-4-6',
  },
  codex: {
    id: 'codex',
    displayName: 'OpenAI Codex',
    description: 'OpenAI Codex CLI — codex',
    binary: 'codex',
    modelFlag: '--model',
    supportedModels: ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5-codex'],
    defaultModel: 'gpt-5.4',
  },
};

export const CODING_AGENT_IDS: CodingAgentId[] = Object.keys(CODING_AGENTS) as CodingAgentId[];

export function getCodingAgent(id: CodingAgentId): CodingAgentSpec {
  return CODING_AGENTS[id];
}

export function listSupportedModels(id: CodingAgentId): string[] {
  return CODING_AGENTS[id].supportedModels;
}

export function isCodingAgentId(value: unknown): value is CodingAgentId {
  return typeof value === 'string' && value in CODING_AGENTS;
}
