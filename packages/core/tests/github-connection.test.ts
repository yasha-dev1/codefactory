import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  AWAITING_APPROVAL_LABEL,
  DEFAULT_STAGES,
  NEEDS_JUDGMENT_LABEL,
  buildHarnextLabelSpecs,
  loadGithubConnection,
  saveGithubConnection,
  type GithubConnectionConfig,
} from '../src/github-connection.js';

describe('buildHarnextLabelSpecs', () => {
  it('emits one label per stage plus the two control labels', () => {
    const specs = buildHarnextLabelSpecs(DEFAULT_STAGES);
    const names = specs.map((s) => s.name);

    for (const stage of DEFAULT_STAGES) {
      expect(names).toContain(stage.label);
    }
    expect(names).toContain(AWAITING_APPROVAL_LABEL);
    expect(names).toContain(NEEDS_JUDGMENT_LABEL);
    expect(specs).toHaveLength(DEFAULT_STAGES.length + 2);
  });

  it('assigns every label a six-char hex color (no leading #)', () => {
    const specs = buildHarnextLabelSpecs(DEFAULT_STAGES);
    for (const spec of specs) {
      expect(spec.color).toMatch(/^[0-9a-f]{6}$/);
    }
  });

  it('uses a harnext-branded description on every label', () => {
    const specs = buildHarnextLabelSpecs(DEFAULT_STAGES);
    for (const spec of specs) {
      expect(spec.description).toMatch(/harnext/i);
    }
  });

  it('keeps stage order first, control labels last', () => {
    const specs = buildHarnextLabelSpecs(DEFAULT_STAGES);
    const stageCount = DEFAULT_STAGES.length;
    expect(specs.slice(0, stageCount).map((s) => s.name)).toEqual(
      DEFAULT_STAGES.map((s) => s.label),
    );
    expect(specs[stageCount].name).toBe(AWAITING_APPROVAL_LABEL);
    expect(specs[stageCount + 1].name).toBe(NEEDS_JUDGMENT_LABEL);
  });
});

describe('GithubConnectionConfig save/load round-trip', () => {
  let tempHome: string;
  let prevHome: string | undefined;
  const projectCwd = '/tmp/test-project-unique';

  beforeEach(() => {
    prevHome = process.env.HARNEXT_HOME;
    tempHome = mkdtempSync(join(tmpdir(), 'harnext-test-'));
    process.env.HARNEXT_HOME = tempHome;
  });

  afterEach(() => {
    if (prevHome === undefined) delete process.env.HARNEXT_HOME;
    else process.env.HARNEXT_HOME = prevHome;
    rmSync(tempHome, { recursive: true, force: true });
  });

  function baseConfig(overrides: Partial<GithubConnectionConfig> = {}): GithubConnectionConfig {
    return {
      repo: 'example/repo',
      pollIntervalMinutes: 15,
      filter: { kind: 'none' },
      stages: DEFAULT_STAGES.map((s) => ({ ...s })),
      codingAgent: 'harnext',
      updatedAt: Date.now(),
      ...overrides,
    };
  }

  it('persists codingAgent and codingAgentModel for external agents', () => {
    const cfg = baseConfig({ codingAgent: 'claude-code', codingAgentModel: 'claude-sonnet-4-6' });
    saveGithubConnection(projectCwd, cfg);
    const loaded = loadGithubConnection(projectCwd);
    expect(loaded).not.toBeNull();
    expect(loaded!.codingAgent).toBe('claude-code');
    expect(loaded!.codingAgentModel).toBe('claude-sonnet-4-6');
  });

  it('defaults codingAgent to harnext when the field is missing (legacy configs)', () => {
    const cfg = baseConfig();
    // Strip the new field to simulate a pre-issue-49 on-disk config.
    const withoutAgent = { ...cfg } as Partial<GithubConnectionConfig>;
    delete (withoutAgent as Record<string, unknown>).codingAgent;
    saveGithubConnection(projectCwd, withoutAgent as GithubConnectionConfig);
    const loaded = loadGithubConnection(projectCwd);
    expect(loaded).not.toBeNull();
    expect(loaded!.codingAgent).toBe('harnext');
    expect(loaded!.codingAgentModel).toBeUndefined();
  });

  it('drops codingAgentModel for harnext (harnext reads from preferences)', () => {
    // Simulate a hand-edited config with a stray model id set on harnext.
    const cfg = baseConfig({ codingAgent: 'harnext' });
    const withStrayModel = { ...cfg, codingAgentModel: 'should-be-ignored' };
    saveGithubConnection(projectCwd, withStrayModel as GithubConnectionConfig);
    const loaded = loadGithubConnection(projectCwd);
    expect(loaded).not.toBeNull();
    expect(loaded!.codingAgent).toBe('harnext');
    expect(loaded!.codingAgentModel).toBeUndefined();
  });
});
