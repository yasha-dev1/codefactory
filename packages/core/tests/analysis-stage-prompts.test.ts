import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_STAGES, type StageEntry } from '../src/github-connection.js';
import {
  applyGeneratedPrompts,
  buildStagePromptsPrompt,
  coerceStagePrompts,
  generateStagePrompts,
  type GeneratedStagePrompt,
  type StagePromptSpec,
} from '../src/analysis/stage-prompts.js';
import type { ProjectProfile } from '../src/analysis/profile.js';

const profile: ProjectProfile = {
  generatedAt: '2026-04-22T10:00:00.000Z',
  primaryLanguage: 'TypeScript',
  framework: null,
  packageManager: 'pnpm',
  testCommand: 'pnpm test',
  buildCommand: 'pnpm build',
  lintCommand: 'pnpm lint',
  typecheckCommand: 'pnpm typecheck',
  monorepo: true,
  hasUI: false,
  criticalPaths: [],
  conventions: [],
  ciProvider: 'github-actions',
  notes: '',
};

const specs: StagePromptSpec[] = [
  { id: 'triage', kind: 'normal' },
  { id: 'plan', kind: 'normal' },
  { id: 'implement', kind: 'normal' },
  { id: 'verify', kind: 'normal' },
  { id: 'review', kind: 'review-loop' },
];

describe('coerceStagePrompts', () => {
  it('keeps normal stages when prompt is a non-empty string', () => {
    const out = coerceStagePrompts(
      {
        triage: { prompt: 'tailored triage' },
        plan: { prompt: '  ' }, // blank → dropped
      },
      specs,
    );
    expect(out.triage).toEqual({ id: 'triage', prompt: 'tailored triage' });
    expect(out.plan).toBeUndefined();
  });

  it('keeps review-loop stages only when both review and fix are present', () => {
    const out = coerceStagePrompts(
      {
        review: { review: 'reviewer prompt', fix: 'fixer prompt' },
      },
      specs,
    );
    expect(out.review).toEqual({
      id: 'review',
      review: 'reviewer prompt',
      fix: 'fixer prompt',
    });
  });

  it('drops review-loop stage if fix is missing', () => {
    const out = coerceStagePrompts(
      { review: { review: 'reviewer prompt' } },
      specs,
    );
    expect(out.review).toBeUndefined();
  });

  it('ignores extra stage ids the caller did not request', () => {
    const out = coerceStagePrompts(
      {
        triage: { prompt: 'hi' },
        bogus: { prompt: 'ignored' },
      },
      specs,
    );
    expect(Object.keys(out)).toEqual(['triage']);
  });

  it('returns empty object for non-object inputs', () => {
    expect(coerceStagePrompts(null, specs)).toEqual({});
    expect(coerceStagePrompts('string', specs)).toEqual({});
    expect(coerceStagePrompts(42, specs)).toEqual({});
  });
});

describe('applyGeneratedPrompts', () => {
  const generated: Record<string, GeneratedStagePrompt> = {
    triage: { id: 'triage', prompt: 'custom triage prompt' },
    review: { id: 'review', review: 'custom review', fix: 'custom fix' },
  };

  it('overlays normal prompts onto matching baseline stages', () => {
    const result = applyGeneratedPrompts(DEFAULT_STAGES, generated);
    const triage = result.find((s) => s.id === 'triage');
    expect(triage?.kind === 'normal' && triage.prompt).toBe('custom triage prompt');
  });

  it('overlays review + fix onto a review-loop stage', () => {
    const result = applyGeneratedPrompts(DEFAULT_STAGES, generated);
    const review = result.find((s) => s.id === 'review');
    expect(review?.kind).toBe('review-loop');
    if (review?.kind === 'review-loop') {
      expect(review.review.prompt).toBe('custom review');
      expect(review.fix.prompt).toBe('custom fix');
    }
  });

  it('leaves stages without a generated entry untouched', () => {
    const result = applyGeneratedPrompts(DEFAULT_STAGES, generated);
    const plan = result.find((s) => s.id === 'plan');
    const defaultPlan = DEFAULT_STAGES.find((s) => s.id === 'plan');
    expect(plan).toEqual(defaultPlan);
  });

  it('does not overlay review-loop if either review or fix is missing', () => {
    const result = applyGeneratedPrompts(DEFAULT_STAGES, {
      review: { id: 'review', review: 'only-review' },
    });
    const review = result.find((s) => s.id === 'review');
    const defaultReview = DEFAULT_STAGES.find((s) => s.id === 'review');
    expect(review).toEqual(defaultReview);
  });

  it('does not overlay normal stage if prompt missing', () => {
    const baseline: StageEntry[] = [
      { kind: 'normal', id: 'triage', label: 'l', mode: 'yolo', prompt: 'original' },
    ];
    const result = applyGeneratedPrompts(baseline, {
      triage: { id: 'triage' },
    });
    expect(result).toEqual(baseline);
  });
});

describe('buildStagePromptsPrompt', () => {
  it('embeds the output path and profile verbatim', () => {
    const outputPath = '/tmp/foo/stages.json';
    const text = buildStagePromptsPrompt(profile, specs, outputPath);
    expect(text).toContain(outputPath);
    expect(text).toContain('"primaryLanguage": "TypeScript"');
    expect(text).toContain('"testCommand": "pnpm test"');
  });

  it('lists review-loop shape with review+fix fields', () => {
    const text = buildStagePromptsPrompt(profile, specs, '/tmp/out.json');
    expect(text).toContain('"review":');
    expect(text).toContain('"fix":');
  });
});

describe('generateStagePrompts (integration via runHarnextAgent stub)', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'harnext-stages-test-'));
  });

  it('parses the JSON file the stub agent writes', async () => {
    const result = await generateStagePrompts({
      cwd,
      codingAgent: 'harnext',
      profile,
      specs,
      tmpDir: cwd,
      runHarnextAgent: async (prompt) => {
        const match = prompt.match(/([^\s]+stages\.json)/);
        const outputPath = match?.[1];
        expect(outputPath).toBeDefined();
        writeFileSync(
          outputPath!,
          JSON.stringify({
            triage: { prompt: 'T-prompt' },
            plan: { prompt: 'P-prompt' },
            review: { review: 'R-review', fix: 'R-fix' },
          }),
          'utf-8',
        );
        return 'wrote stages.json';
      },
    });

    expect(result.error).toBeUndefined();
    expect(result.prompts.triage?.prompt).toBe('T-prompt');
    expect(result.prompts.plan?.prompt).toBe('P-prompt');
    expect(result.prompts.review?.review).toBe('R-review');
    expect(result.prompts.review?.fix).toBe('R-fix');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('returns error when agent does not write the output file', async () => {
    const result = await generateStagePrompts({
      cwd,
      codingAgent: 'harnext',
      profile,
      specs,
      tmpDir: cwd,
      runHarnextAgent: async () => 'did nothing',
    });

    expect(result.error).toMatch(/agent did not write/);
    expect(result.prompts).toEqual({});
    rmSync(cwd, { recursive: true, force: true });
  });

  it('returns error when the written JSON is malformed', async () => {
    const result = await generateStagePrompts({
      cwd,
      codingAgent: 'harnext',
      profile,
      specs,
      tmpDir: cwd,
      runHarnextAgent: async (prompt) => {
        const match = prompt.match(/([^\s]+stages\.json)/);
        writeFileSync(match![1], '{ not: json', 'utf-8');
        return '';
      },
    });

    expect(result.error).toMatch(/failed to parse/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('propagates runHarnextAgent errors into result.error', async () => {
    const result = await generateStagePrompts({
      cwd,
      codingAgent: 'harnext',
      profile,
      specs,
      tmpDir: cwd,
      runHarnextAgent: async () => {
        throw new Error('boom');
      },
    });

    expect(result.error).toBe('boom');
    expect(result.prompts).toEqual({});
    rmSync(cwd, { recursive: true, force: true });
  });

  it('cleans up its tmp dir on success (no leaked stages.json)', async () => {
    let capturedPath = '';
    await generateStagePrompts({
      cwd,
      codingAgent: 'harnext',
      profile,
      specs,
      tmpDir: cwd,
      runHarnextAgent: async (prompt) => {
        const match = prompt.match(/([^\s]+stages\.json)/);
        capturedPath = match![1];
        writeFileSync(
          capturedPath,
          JSON.stringify({ triage: { prompt: 'x' } }),
          'utf-8',
        );
        return '';
      },
    });

    expect(() => readFileSync(capturedPath, 'utf-8')).toThrow();
    rmSync(cwd, { recursive: true, force: true });
  });
});
