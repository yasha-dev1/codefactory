/**
 * Ask the user's coding agent to survey the current repo and emit a
 * {@link ProjectProfile} as a JSON file at a tmp path. We then read that
 * file, validate the shape, and return the profile — the agent never
 * needs to return structured data through stdout.
 *
 * The tmp-file JSON protocol is deliberate: LLM CLIs truncate, reformat,
 * or prose-wrap their stdout unpredictably, so we can't parse it reliably.
 * Writing to a file keeps the handshake crisp: "write exactly this JSON
 * at exactly this path" → we read it back → done.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CodingAgentId } from '../coding-agents.js';
import type { ExternalAgentSpawner } from '../coding-agent-runner.js';
import { runCodingAgent } from './run-coding-agent.js';
import {
  coerceProjectProfile,
  type ProjectProfile,
} from './profile.js';

export interface RunCodebaseProfilerOptions {
  cwd: string;
  codingAgent: CodingAgentId;
  codingAgentModel?: string;
  spawner?: ExternalAgentSpawner;
  /** Test hook for the harnext in-process path. */
  runHarnextAgent?: (prompt: string, cwd: string) => Promise<string>;
  /** Optional override for the tmp dir (tests). Defaults to OS tmpdir(). */
  tmpDir?: string;
}

export interface RunCodebaseProfilerResult {
  profile: ProjectProfile | null;
  /** Path we asked the agent to write; retained for diagnostics. */
  outputPath: string;
  /** Raw trailing assistant text (when available). */
  agentOutput: string;
  /** Populated when the profile could not be produced. */
  error?: string;
}

export async function runCodebaseProfiler(
  opts: RunCodebaseProfilerOptions,
): Promise<RunCodebaseProfilerResult> {
  const tmp = mkdtempSync(join(opts.tmpDir ?? tmpdir(), 'harnext-profile-'));
  const outputPath = join(tmp, 'profile.json');

  const prompt = buildProfilerPrompt(outputPath);

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
    return { profile: null, outputPath, agentOutput: output, error };
  }

  if (!existsSync(outputPath)) {
    cleanupTmp(tmp);
    return {
      profile: null,
      outputPath,
      agentOutput: output,
      error: `agent did not write ${outputPath} — check the run transcript`,
    };
  }

  let parsed: unknown;
  try {
    const raw = readFileSync(outputPath, 'utf-8');
    parsed = JSON.parse(raw);
  } catch (err) {
    cleanupTmp(tmp);
    return {
      profile: null,
      outputPath,
      agentOutput: output,
      error: `failed to parse ${outputPath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const profile = coerceProjectProfile(parsed);
  cleanupTmp(tmp);

  if (!profile) {
    return {
      profile: null,
      outputPath,
      agentOutput: output,
      error: 'profile JSON is missing required fields (need at least primaryLanguage)',
    };
  }

  return { profile, outputPath, agentOutput: output };
}

function cleanupTmp(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best effort — tmp files are cleaned up by the OS eventually
  }
}

/**
 * The prompt pinned to the agent. We keep it explicit: exact path, exact
 * JSON shape, exact ground rules. Do not touch casually — drift in the
 * output shape will silently degrade the rest of the setup flow.
 */
export function buildProfilerPrompt(outputPath: string): string {
  return [
    'You are analyzing the current repository to produce a **ProjectProfile** for harnext.',
    'harnext will use this profile to generate tailored stage prompts and skills for the',
    'coding-agent pipeline that will work on issues in this repo.',
    '',
    'Your task, in order:',
    '',
    '1. Survey the codebase. Use the read/glob/grep/bash tools you already have.',
    '   Focus on: language(s), framework(s), package manager, test / build / lint /',
    '   typecheck commands, monorepo structure, whether there is a browser UI,',
    '   CI provider, and which paths are "critical" (handlers, auth, migrations,',
    "   whatever a reviewer would scrutinize). Don't read everything — skim.",
    '',
    '2. Write a single JSON file at **exactly** this path:',
    '',
    `   ${outputPath}`,
    '',
    '   The JSON must match this shape (fields are required unless marked optional):',
    '',
    '   {',
    '     "generatedAt": "<ISO 8601 timestamp>",',
    '     "primaryLanguage": "<e.g. TypeScript, Python, Go>",',
    '     "framework": "<e.g. Next.js, FastAPI> or null",',
    '     "packageManager": "<npm|pnpm|yarn|bun|pip|poetry|cargo|...> or null",',
    '     "testCommand": "<exact shell command or null>",',
    '     "buildCommand": "<exact shell command or null>",',
    '     "lintCommand": "<exact shell command or null>",',
    '     "typecheckCommand": "<exact shell command or null>",',
    '     "monorepo": true|false,',
    '     "hasUI": true|false,',
    '     "criticalPaths": ["<repo-relative path>", "..."],',
    '     "conventions": ["<short rule>", "..."],',
    '     "ciProvider": "<github-actions|gitlab-ci|...> or null",',
    '     "notes": "<free-form paragraph, ~100-400 chars, highlighting gotchas>"',
    '   }',
    '',
    '   **Never guess a command.** If you cannot find the exact test command in',
    '   package.json / Makefile / README / CI config, emit null. Guessing will',
    '   wreck later stages.',
    '',
    '3. After writing the file, reply with one short sentence confirming the path.',
    '   Do not paste the JSON into the reply. Do not wrap the JSON in markdown.',
    '',
    "Write valid JSON only — no trailing commas, no comments. If you're unsure",
    'about a field, pick the conservative option (null for strings, false for',
    'booleans, [] for arrays). The profile does not need to be exhaustive — it',
    'needs to be correct.',
  ].join('\n');
}
