import {
  CODING_AGENTS,
  CODING_AGENT_IDS,
  getCodingAgent,
  isCodingAgentId,
  listSupportedModels,
} from '../../src/core/coding-agent-registry.js';

describe('coding-agent registry', () => {
  it('contains exactly the three agent ids from the issue scope', () => {
    expect(CODING_AGENT_IDS.sort()).toEqual(['claude-code', 'codex', 'harnext']);
  });

  it('uses each vendor’s real binary name', () => {
    expect(CODING_AGENTS['claude-code'].binary).toBe('claude');
    expect(CODING_AGENTS['codex'].binary).toBe('codex');
    expect(CODING_AGENTS['harnext'].binary).toBe('codefactory');
  });

  it('uses the model flag documented in each vendor’s CLI reference', () => {
    expect(CODING_AGENTS['claude-code'].modelFlag).toBe('--model');
    expect(CODING_AGENTS['codex'].modelFlag).toBe('--model');
    expect(CODING_AGENTS['harnext'].modelFlag).toBe('-m');
  });

  it('every entry exposes a non-empty supportedModels list containing its defaultModel', () => {
    for (const id of CODING_AGENT_IDS) {
      const spec = CODING_AGENTS[id];
      expect(spec.supportedModels.length).toBeGreaterThan(0);
      expect(spec.supportedModels).toContain(spec.defaultModel);
      for (const model of spec.supportedModels) {
        expect(typeof model).toBe('string');
        expect(model.length).toBeGreaterThan(0);
      }
    }
  });

  it('getCodingAgent returns the matching spec', () => {
    expect(getCodingAgent('codex').binary).toBe('codex');
    expect(getCodingAgent('claude-code').displayName).toBe('Claude Code');
  });

  it('listSupportedModels mirrors the registry entry', () => {
    const claudeModels = listSupportedModels('claude-code');
    expect(claudeModels).toBe(CODING_AGENTS['claude-code'].supportedModels);
  });

  it('isCodingAgentId narrows known ids and rejects unknown values', () => {
    expect(isCodingAgentId('harnext')).toBe(true);
    expect(isCodingAgentId('claude-code')).toBe(true);
    expect(isCodingAgentId('codex')).toBe(true);
    expect(isCodingAgentId('cursor')).toBe(false);
    expect(isCodingAgentId('')).toBe(false);
    expect(isCodingAgentId(undefined)).toBe(false);
    expect(isCodingAgentId(42)).toBe(false);
  });
});
