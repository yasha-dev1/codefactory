/**
 * Skills installation + generation for the setup wizard's analysis step.
 *
 * Two concerns, one module:
 *
 *  1. **Install bundled skills** into the *right* directory for the chosen
 *     coding agent — harnext reads `.harnext/skills/`, Claude Code reads
 *     `.claude/skills/`, Codex reads `.codex/skills/`. The setup wizard
 *     calls `installBundledSkills` so whichever agent drives the pipeline
 *     picks up the built-ins without the user wiring anything.
 *
 *  2. **Generate project-specific skills** via the coding agent itself,
 *     using the ProjectProfile to tailor content. The agent writes each
 *     `<skill>/SKILL.md` directly into the resolved dir — the tmp-JSON
 *     protocol isn't needed here because the final artifact *is* the
 *     skill file; we only need to know which skill names to expect.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { join, relative } from 'node:path';

import type { CodingAgentId } from '../coding-agents.js';
import type { ExternalAgentSpawner } from '../coding-agent-runner.js';
import { CONFIG_DIR_NAME } from '../config.js';
import { getBundledSkillsDir } from '../seed.js';
import { runCodingAgent } from './run-coding-agent.js';
import type { ProjectProfile } from './profile.js';

/**
 * Project-local skills directory for a given coding agent. Each agent
 * loads skills from a different path, so the setup wizard writes to the
 * one the active agent actually inspects.
 *
 * harnext → `.harnext/skills/`     (loaded by packages/core/src/skills.ts)
 * claude-code → `.claude/skills/`  (Claude Code's Agent Skills dir)
 * codex → `.codex/skills/`         (Codex doesn't document a formal skills
 *                                   dir; we use a sibling-style path that
 *                                   keeps the skills out of `.harnext/`
 *                                   and visible to the user)
 */
export function resolveAgentSkillsDir(cwd: string, codingAgent: CodingAgentId): string {
  switch (codingAgent) {
    case 'harnext':
      return join(cwd, CONFIG_DIR_NAME, 'skills');
    case 'claude-code':
      return join(cwd, '.claude', 'skills');
    case 'codex':
      return join(cwd, '.codex', 'skills');
  }
}

export interface InstallBundledSkillsResult {
  target: string;
  installed: string[];
  skipped: string[];
  error?: string;
}

/**
 * Copy every bundled skill directory into the agent-specific project
 * skills dir. Each bundled skill lives at `<pkg>/skills/<name>/SKILL.md`.
 * Existing directories are preserved (never clobbered) so a user who
 * edited their `init/SKILL.md` doesn't lose the edit on re-run.
 */
export function installBundledSkills(
  cwd: string,
  codingAgent: CodingAgentId,
): InstallBundledSkillsResult {
  const target = resolveAgentSkillsDir(cwd, codingAgent);
  const installed: string[] = [];
  const skipped: string[] = [];

  const source = getBundledSkillsDir();
  if (!existsSync(source)) {
    return {
      target,
      installed,
      skipped,
      error: `bundled skills directory missing at ${source}`,
    };
  }

  try {
    mkdirSync(target, { recursive: true });
    for (const entry of readdirSync(source, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      if (!entry.isDirectory()) continue;
      const dest = join(target, entry.name);
      if (existsSync(dest)) {
        skipped.push(entry.name);
        continue;
      }
      cpSync(join(source, entry.name), dest, { recursive: true });
      installed.push(entry.name);
    }
    return { target, installed, skipped };
  } catch (err) {
    return {
      target,
      installed,
      skipped,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface GenerateProjectSkillsOptions {
  cwd: string;
  codingAgent: CodingAgentId;
  codingAgentModel?: string;
  profile: ProjectProfile;
  /**
   * Default skill slugs we ask the agent to produce. Overridable so tests
   * (and future variants) can request a smaller or larger set.
   */
  skillSlugs?: string[];
  spawner?: ExternalAgentSpawner;
  runHarnextAgent?: (prompt: string, cwd: string) => Promise<string>;
  tmpDir?: string;
}

export interface GenerateProjectSkillsResult {
  target: string;
  /** Skill slugs that now have a valid SKILL.md under `target`. */
  generated: string[];
  /** Slugs we asked for but the agent didn't produce (or produced malformed). */
  missing: string[];
  /** Populated on spawn failure / agent error. */
  error?: string;
}

export const DEFAULT_GENERATED_SKILL_SLUGS = [
  'codebase-conventions',
  'run-checks',
  'verify-implementation',
];

export async function generateProjectSkills(
  opts: GenerateProjectSkillsOptions,
): Promise<GenerateProjectSkillsResult> {
  const target = resolveAgentSkillsDir(opts.cwd, opts.codingAgent);
  mkdirSync(target, { recursive: true });

  const slugs = opts.skillSlugs ?? DEFAULT_GENERATED_SKILL_SLUGS;

  // Scratch dir the agent can use if it wants to stage files. We don't
  // require it — skills land directly in `target`.
  const scratch = mkdtempSync(join(opts.tmpDir ?? tmpdir(), 'harnext-skills-'));

  const prompt = buildSkillsPrompt({
    profile: opts.profile,
    targetDir: target,
    slugs,
    cwd: opts.cwd,
  });

  const { error } = await runCodingAgent({
    cwd: opts.cwd,
    codingAgent: opts.codingAgent,
    codingAgentModel: opts.codingAgentModel,
    prompt,
    spawner: opts.spawner,
    runHarnextAgent: opts.runHarnextAgent,
  });

  // Clean scratch regardless of outcome
  try {
    rmSync(scratch, { recursive: true, force: true });
  } catch {
    // best effort
  }

  if (error) {
    return {
      target,
      generated: [],
      missing: slugs.slice(),
      error,
    };
  }

  const generated: string[] = [];
  const missing: string[] = [];
  for (const slug of slugs) {
    const file = join(target, slug, 'SKILL.md');
    if (!existsSync(file)) {
      missing.push(slug);
      continue;
    }
    try {
      const raw = readFileSync(file, 'utf-8');
      if (hasValidFrontmatter(raw)) {
        generated.push(slug);
      } else {
        missing.push(slug);
      }
    } catch {
      missing.push(slug);
    }
  }

  return { target, generated, missing };
}

/**
 * Lightweight frontmatter sanity check — we only require a `name` and
 * `description` block at the top. The skills loader does stricter
 * validation at runtime; this is a fast pass to reject obviously broken
 * files the agent might have written.
 */
export function hasValidFrontmatter(content: string): boolean {
  if (!content.startsWith('---')) return false;
  const end = content.indexOf('\n---', 3);
  if (end < 0) return false;
  const block = content.slice(3, end);
  const hasName = /^\s*name\s*:\s*\S+/m.test(block);
  const hasDesc = /^\s*description\s*:\s*\S+/m.test(block);
  return hasName && hasDesc;
}

interface SkillsPromptInput {
  profile: ProjectProfile;
  targetDir: string;
  slugs: string[];
  cwd: string;
}

export function buildSkillsPrompt(input: SkillsPromptInput): string {
  const relTarget = relative(input.cwd, input.targetDir) || input.targetDir;
  const profileBlock = JSON.stringify(input.profile, null, 2);
  const slugDescriptions: Record<string, string> = {
    'codebase-conventions':
      "Document the repo's naming, import, formatting, and error-handling rules so the agent follows them when editing code.",
    'run-checks':
      'Document the exact commands for tests, lint, typecheck, and build — and when to run each one (pre-commit vs. pre-PR).',
    'verify-implementation':
      "Document how to verify a change actually works end-to-end, including UI/browser checks if the repo has a UI, and what evidence to post on the PR.",
  };
  const slugLines = input.slugs
    .map((slug) => {
      const d = slugDescriptions[slug] ?? '';
      return `  - ${slug}${d ? ` — ${d}` : ''}`;
    })
    .join('\n');

  return [
    'You are generating **Agent Skills** for harnext, tailored to this codebase.',
    'Each skill is a self-contained folder with a `SKILL.md` file the coding agent',
    'will read when its description matches the current task.',
    '',
    'Write each skill directly to disk. Do **not** emit the content in chat.',
    `Skills live under: **${relTarget}/**`,
    '',
    'Per skill, create:',
    '',
    `  ${relTarget}/<slug>/SKILL.md`,
    '',
    'The SKILL.md must start with YAML frontmatter:',
    '',
    '  ---',
    '  name: <slug>',
    '  description: <one-sentence trigger — what task this skill applies to>',
    '  ---',
    '',
    '  # <slug>',
    '',
    '  <body in markdown — steps, commands, examples. Be concrete. Reference',
    "  this repo's actual paths and commands from the ProjectProfile below.>",
    '',
    'Rules:',
    '  - The `name` field MUST equal the folder slug (lowercase a-z, digits, hyphens).',
    '  - The `description` must be a crisp one-sentence trigger. No fluff.',
    "  - The body must use this repo's actual commands. Don't suggest `npm test` if",
    '    the testCommand in the profile is `pnpm -w test`.',
    '  - Keep each skill focused (~40-150 lines of markdown). If a skill balloons',
    '    past that, split off sub-steps or trim detail.',
    '',
    'Generate exactly these skills:',
    '',
    slugLines,
    '',
    'ProjectProfile (use this to ground every skill in repo-specific facts):',
    profileBlock,
    '',
    'After writing every skill, reply with one short sentence listing the slugs',
    'you wrote. Do not paste the SKILL.md contents into the reply.',
  ].join('\n');
}
