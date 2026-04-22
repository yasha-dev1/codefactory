/**
 * Copy the bundled skills shipped with `@harnext/core` into the project's
 * agent-specific skills directory.
 *
 * This is a pure filesystem op — no agent invocation, no prompt, no
 * YAML. It's split out from `project-skills.ts` because the two concerns
 * (install bundled defaults, generate project-specific skills) have
 * nothing to share beyond a destination resolver, and tests benefit from
 * being able to exercise each independently.
 */

import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { CodingAgentId } from '../../coding-agents.js';
import { CONFIG_DIR_NAME } from '../../config.js';
import { getBundledSkillsDir } from '../../seed.js';

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
