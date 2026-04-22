/**
 * Generate tailored stage prompts from a {@link ProjectProfile}. The agent
 * writes a JSON map (stage id → prompt, with special-case review+fix
 * sub-keys for review-loops) to a tmp file; we read and validate it.
 *
 * Why a single call for all stages? Because the agent can compose prompts
 * that reference each other (e.g. verify references the test command from
 * plan) and stays consistent in tone across the pipeline. Splitting per-
 * stage would force the user to wait N times and risk tonal drift.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CodingAgentId } from '../coding-agents.js';
import type { ExternalAgentSpawner } from '../coding-agent-runner.js';
import type { StageEntry } from '../github-connection.js';
import { runCodingAgent } from './run-coding-agent.js';
import type { ProjectProfile } from './profile.js';

/** Shape of an individual stage we request prompts for. */
export interface StagePromptSpec {
  id: string;
  kind: 'normal' | 'review-loop';
}

/**
 * For a normal stage, `prompt` is set. For a review-loop stage, `review`
 * and `fix` are set and `prompt` is absent.
 */
export interface GeneratedStagePrompt {
  id: string;
  prompt?: string;
  review?: string;
  fix?: string;
}

export interface GenerateStagePromptsOptions {
  cwd: string;
  codingAgent: CodingAgentId;
  codingAgentModel?: string;
  profile: ProjectProfile;
  /** Which stages to generate prompts for, in the order to hint to the agent. */
  specs: StagePromptSpec[];
  spawner?: ExternalAgentSpawner;
  runHarnextAgent?: (prompt: string, cwd: string) => Promise<string>;
  tmpDir?: string;
}

export interface GenerateStagePromptsResult {
  /** Keyed by stage id. May be empty (or partial) when parsing fails. */
  prompts: Record<string, GeneratedStagePrompt>;
  outputPath: string;
  agentOutput: string;
  error?: string;
}

export async function generateStagePrompts(
  opts: GenerateStagePromptsOptions,
): Promise<GenerateStagePromptsResult> {
  const tmp = mkdtempSync(join(opts.tmpDir ?? tmpdir(), 'harnext-stages-'));
  const outputPath = join(tmp, 'stages.json');

  const prompt = buildStagePromptsPrompt(opts.profile, opts.specs, outputPath);

  const { output, error } = await runCodingAgent({
    cwd: opts.cwd,
    codingAgent: opts.codingAgent,
    codingAgentModel: opts.codingAgentModel,
    prompt,
    spawner: opts.spawner,
    runHarnextAgent: opts.runHarnextAgent,
  });

  if (error) {
    cleanupTmp(tmp);
    return { prompts: {}, outputPath, agentOutput: output, error };
  }

  if (!existsSync(outputPath)) {
    cleanupTmp(tmp);
    return {
      prompts: {},
      outputPath,
      agentOutput: output,
      error: `agent did not write ${outputPath}`,
    };
  }

  let parsed: unknown;
  try {
    const raw = readFileSync(outputPath, 'utf-8');
    parsed = JSON.parse(raw);
  } catch (err) {
    cleanupTmp(tmp);
    return {
      prompts: {},
      outputPath,
      agentOutput: output,
      error: `failed to parse ${outputPath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const prompts = coerceStagePrompts(parsed, opts.specs);
  cleanupTmp(tmp);
  return { prompts, outputPath, agentOutput: output };
}

function cleanupTmp(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best effort
  }
}

/**
 * Accept only the entries we asked for — the agent might emit extras and
 * we don't want to silently pollute the user's stage list. Entries with
 * the wrong shape for their kind are dropped with no error so the caller
 * can fall back to `DEFAULT_STAGES` for the missing slots.
 */
export function coerceStagePrompts(
  value: unknown,
  specs: StagePromptSpec[],
): Record<string, GeneratedStagePrompt> {
  if (!value || typeof value !== 'object') return {};
  const root = value as Record<string, unknown>;
  const out: Record<string, GeneratedStagePrompt> = {};

  for (const spec of specs) {
    const entry = root[spec.id];
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;

    if (spec.kind === 'normal') {
      if (typeof e.prompt === 'string' && e.prompt.trim().length > 0) {
        out[spec.id] = { id: spec.id, prompt: e.prompt };
      }
      continue;
    }

    // review-loop — require both review and fix prompts
    if (
      typeof e.review === 'string' &&
      e.review.trim().length > 0 &&
      typeof e.fix === 'string' &&
      e.fix.trim().length > 0
    ) {
      out[spec.id] = { id: spec.id, review: e.review, fix: e.fix };
    }
  }

  return out;
}

/**
 * Apply generated prompts on top of a baseline stage list (typically
 * DEFAULT_STAGES). Stages we have tailored prompts for get updated in
 * place; others are left untouched so nothing accidentally regresses to a
 * blank prompt.
 */
export function applyGeneratedPrompts(
  baseline: StageEntry[],
  generated: Record<string, GeneratedStagePrompt>,
): StageEntry[] {
  return baseline.map((stage) => {
    const hit = generated[stage.id];
    if (!hit) return stage;
    if (stage.kind === 'review-loop') {
      if (!hit.review || !hit.fix) return stage;
      return {
        ...stage,
        review: { ...stage.review, prompt: hit.review },
        fix: { ...stage.fix, prompt: hit.fix },
      };
    }
    if (!hit.prompt) return stage;
    return { ...stage, prompt: hit.prompt };
  });
}

export function buildStagePromptsPrompt(
  profile: ProjectProfile,
  specs: StagePromptSpec[],
  outputPath: string,
): string {
  const stageLines = specs
    .map((s) =>
      s.kind === 'review-loop'
        ? `  "${s.id}": { "review": "<prompt for reviewer agent>", "fix": "<prompt for fixer agent>" }`
        : `  "${s.id}": { "prompt": "<prompt text>" }`,
    )
    .join(',\n');

  const profileBlock = JSON.stringify(profile, null, 2);

  return [
    'You are generating **stage prompts** for harnext — the pipeline that processes',
    'GitHub issues on this repo. Each stage is a single run of the coding agent; the',
    'prompts you write are what the agent sees when that stage fires.',
    '',
    'Tailor each prompt to this codebase using the ProjectProfile below. Reference',
    'the exact test/build/lint commands when relevant. Mention the critical paths',
    'by name when appropriate. Keep prompts tight — aim for 8-20 lines each, no',
    'filler. Write in the imperative ("Read the issue body…"), not the descriptive.',
    '',
    'Stage-by-stage guidance:',
    '  - triage    : no code changes. Post one GitHub comment classifying the issue',
    '                (severity, scope, ready-to-plan).',
    '  - plan      : no code changes. Post one GitHub comment with an implementation',
    '                plan (summary, files to change, approach, risks, test plan).',
    '  - implement : create a branch issue/<num>-<slug>, make the changes, open a',
    '                DRAFT PR that closes the issue. Do not merge.',
    '  - verify    : check out the PR branch, run tests/lint/typecheck, post one',
    '                PR comment with exit codes. Commit mechanical fixes only.',
    '  - review    : review = post one PR review (approve / request changes / comment).',
    '                fix    = address a changes_requested review by editing the branch.',
    '',
    'ProjectProfile:',
    profileBlock,
    '',
    'Write a single JSON file at **exactly** this path:',
    '',
    `  ${outputPath}`,
    '',
    'Shape:',
    '',
    '{',
    stageLines,
    '}',
    '',
    'Include only the stage ids listed above. No extra keys. No markdown. No comments.',
    'After writing the file, reply with one short sentence confirming the path.',
  ].join('\n');
}
