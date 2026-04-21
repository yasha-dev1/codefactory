import { vi } from 'vitest';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadStageConfig, saveStageConfig } from '../../src/core/stage-config.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'stage-config-test-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('loadStageConfig', () => {
  it('should return null when config file does not exist', async () => {
    const result = await loadStageConfig(tempDir);
    expect(result).toBeNull();
  });

  it('should load a valid config with all fields', async () => {
    const config = {
      stages: [
        {
          id: 'triage',
          label: 'harnext:triage',
          prompt: 'Triage this',
          mode: 'yolo',
          runner: { location: 'local' },
        },
      ],
      codingAgent: 'claude',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    await mkdir(join(tempDir, '.harnext'), { recursive: true });
    await writeFile(join(tempDir, '.harnext', 'github.json'), JSON.stringify(config));

    const result = await loadStageConfig(tempDir);
    expect(result).not.toBeNull();
    expect(result!.stages).toHaveLength(1);
    expect(result!.stages[0].id).toBe('triage');
    expect(result!.stages[0].runner).toEqual({ location: 'local' });
    expect(result!.codingAgent).toBe('claude');
  });

  it('should backfill runner for stages missing it (backward compat)', async () => {
    const config = {
      stages: [
        {
          id: 'old-stage',
          label: 'harnext:old',
          prompt: 'Old prompt',
          mode: 'yolo',
        },
      ],
    };
    await mkdir(join(tempDir, '.harnext'), { recursive: true });
    await writeFile(join(tempDir, '.harnext', 'github.json'), JSON.stringify(config));

    const result = await loadStageConfig(tempDir);
    expect(result).not.toBeNull();
    expect(result!.stages[0].runner).toEqual({ location: 'local' });
  });

  it('should return null for malformed JSON and log a warning', async () => {
    await mkdir(join(tempDir, '.harnext'), { recursive: true });
    await writeFile(join(tempDir, '.harnext', 'github.json'), 'not-json{{{');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await loadStageConfig(tempDir);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[stage-config]'));
    warnSpy.mockRestore();
  });

  it('should handle empty stages array', async () => {
    const config = { stages: [] };
    await mkdir(join(tempDir, '.harnext'), { recursive: true });
    await writeFile(join(tempDir, '.harnext', 'github.json'), JSON.stringify(config));

    const result = await loadStageConfig(tempDir);
    expect(result).not.toBeNull();
    expect(result!.stages).toHaveLength(0);
  });

  it('should handle missing stages key', async () => {
    const config = { codingAgent: 'codex' };
    await mkdir(join(tempDir, '.harnext'), { recursive: true });
    await writeFile(join(tempDir, '.harnext', 'github.json'), JSON.stringify(config));

    const result = await loadStageConfig(tempDir);
    expect(result).not.toBeNull();
    expect(result!.stages).toHaveLength(0);
    expect(result!.codingAgent).toBe('codex');
  });
});

describe('saveStageConfig', () => {
  it('should write config to .harnext/github.json', async () => {
    const config = {
      stages: [
        {
          id: 'triage',
          label: 'harnext:triage',
          prompt: 'Triage this',
          mode: 'yolo' as const,
          runner: { location: 'local' as const },
        },
      ],
      codingAgent: 'claude',
    };
    await saveStageConfig(tempDir, config);

    const raw = await readFile(join(tempDir, '.harnext', 'github.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.stages).toHaveLength(1);
    expect(parsed.stages[0].id).toBe('triage');
    expect(parsed.codingAgent).toBe('claude');
  });

  it('should set updatedAt timestamp on save', async () => {
    const config = {
      stages: [],
    };
    await saveStageConfig(tempDir, config);

    const raw = await readFile(join(tempDir, '.harnext', 'github.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.updatedAt).toBeDefined();
    expect(new Date(parsed.updatedAt).getTime()).not.toBeNaN();
  });

  it('should create .harnext directory if it does not exist', async () => {
    const config = { stages: [] };
    await saveStageConfig(tempDir, config);

    const raw = await readFile(join(tempDir, '.harnext', 'github.json'), 'utf-8');
    expect(JSON.parse(raw).stages).toEqual([]);
  });

  it('should not mutate the input config object', async () => {
    const config = {
      stages: [],
      updatedAt: 'original-value',
    };
    await saveStageConfig(tempDir, config);
    expect(config.updatedAt).toBe('original-value');
  });

  it('should produce valid JSON that round-trips through load', async () => {
    const config = {
      stages: [
        {
          id: 'impl',
          label: 'harnext:implement',
          prompt: 'Implement the feature',
          mode: 'human-approval' as const,
          runner: {
            location: 'github-actions' as const,
            workflowFile: '.github/workflows/impl.yml',
            generated: true,
          },
        },
      ],
      codingAgent: 'kiro',
    };
    await saveStageConfig(tempDir, config);
    const loaded = await loadStageConfig(tempDir);

    expect(loaded).not.toBeNull();
    expect(loaded!.stages[0].id).toBe('impl');
    expect(loaded!.stages[0].runner).toEqual({
      location: 'github-actions',
      workflowFile: '.github/workflows/impl.yml',
      generated: true,
    });
    expect(loaded!.codingAgent).toBe('kiro');
  });
});
