/**
 * Generate project-specific Agent Skills tailored to the TechStack.
 *
 * This is the Phase 3 replacement for the legacy
 * `packages/core/src/analysis/skills.ts` `generateProjectSkills` —
 * same pattern (agent writes `SKILL.md` directly into the skills dir,
 * we verify frontmatter after) but driven by the bundled YAML prompt
 * and consuming TechStack directly instead of ProjectProfile.
 *
 * Installation of the **bundled** skills (the built-in init / review
 * / browser-verify set) is still a pure file copy — it doesn't invoke
 * an agent and lives in `install-bundled-skills.ts` next door.
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { CodingAgentId } from '../../coding-agents.js';
import type { ExternalAgentSpawner } from '../../coding-agent-runner.js';
import { runCodingAgent } from '../run-coding-agent.js';
import { resolveAgentSkillsDir } from './install-bundled-skills.js';
import { loadPrompt, renderPrompt } from '../prompt-loader.js';
import type { SessionDir } from '../session-dir.js';
import type { TechStack } from '../types.js';

export const DEFAULT_GENERATED_SKILL_SLUGS = [
  'codebase-conventions',
  'run-checks',
  'verify-implementation',
];

const SLUG_DESCRIPTIONS: Record<string, string> = {
  'codebase-conventions':
    "Document the repo's naming, import, formatting, and error-handling rules so the agent follows them when editing code.",
  'run-checks':
    'Document the exact commands for tests, lint, typecheck, and build — and when to run each one (pre-commit vs. pre-PR).',
  'verify-implementation':
    "Document how to verify a change actually works end-to-end, referencing the TechStack's real test/lint/typecheck/build commands. When any package has hasUI=true, also document driving a real browser — prefer the bundled `browser-verify` skill (produces video + Playwright trace + a11y snapshots), or fall back to `chrome-devtools` MCP tools if configured. Skip browser work when the PR doesn't touch a UI path.",
};

export interface RunProjectSkillsStageOptions {
  cwd: string;
  codingAgent: CodingAgentId;
  codingAgentModel?: string;
  session: SessionDir;
  techStack: TechStack;
  /** Slugs to request. Defaults to `DEFAULT_GENERATED_SKILL_SLUGS`. */
  skillSlugs?: string[];
  spawner?: ExternalAgentSpawner;
  runHarnextAgent?: (prompt: string, cwd: string) => Promise<string>;
  onActivity?: (line: string) => void;
}

export interface RunProjectSkillsStageResult {
  /** Absolute path of the skills dir for the active coding agent. */
  target: string;
  /** Slugs that ended up with a well-formed SKILL.md (frontmatter present). */
  generated: string[];
  /** Slugs we asked for but the agent didn't produce (or produced malformed). */
  missing: string[];
  /** Populated on spawn failure / agent error. */
  error?: string;
}

/**
 * Frontmatter sanity check — the skills loader does stricter validation
 * at runtime; this is a fast pass to reject obviously broken files.
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

export async function runProjectSkillsStage(
  opts: RunProjectSkillsStageOptions,
): Promise<RunProjectSkillsStageResult> {
  const target = resolveAgentSkillsDir(opts.cwd, opts.codingAgent);
  mkdirSync(target, { recursive: true });

  const slugs = opts.skillSlugs ?? DEFAULT_GENERATED_SKILL_SLUGS;
  const slugsList = slugs
    .map((slug) => {
      const d = SLUG_DESCRIPTIONS[slug] ?? '';
      return `  - ${slug}${d ? ` — ${d}` : ''}`;
    })
    .join('\n');

  const prompt = renderPrompt(loadPrompt('project-skills'), {
    skillsDir: target,
    slugsList,
    techStackJson: JSON.stringify(opts.techStack, null, 2),
    sessionDir: opts.session.root,
    cwd: opts.cwd,
  });

  const { error } = await runCodingAgent({
    cwd: opts.cwd,
    codingAgent: opts.codingAgent,
    codingAgentModel: opts.codingAgentModel,
    prompt,
    spawner: opts.spawner,
    runHarnextAgent: opts.runHarnextAgent,
    onActivity: opts.onActivity,
  });

  if (error) {
    opts.session.appendManifest({ stage: 'project-skills', outputs: [target] });
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

  opts.session.appendManifest({ stage: 'project-skills', outputs: [target] });
  return { target, generated, missing };
}
