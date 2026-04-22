/**
 * Project profile — the durable output of the setup wizard's codebase
 * analysis step. Written to `<cwd>/.harnext/project-profile.json` and
 * consumed by the stage-prompt generator and the skill generator, and
 * re-used on later `harnext setup` runs so the user can skip re-analyzing.
 *
 * The shape is intentionally agent-visible: we pin it in the profiler
 * prompt so the coding agent knows exactly which keys to emit.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { CONFIG_DIR_NAME } from '../config.js';

export const PROJECT_PROFILE_FILE = 'project-profile.json';

export interface ProjectProfile {
  /** ISO 8601 timestamp the profile was generated. */
  generatedAt: string;
  /** e.g. "TypeScript", "Python", "Go". Free-form; agent picks. */
  primaryLanguage: string;
  /** e.g. "Next.js", "FastAPI". Null when there's no dominant framework. */
  framework: string | null;
  /** "npm", "pnpm", "yarn", "bun", "pip", "poetry", "cargo"… */
  packageManager: string | null;
  /** Exact shell command to run the project's tests. Null if unknown. */
  testCommand: string | null;
  /** Exact shell command to build. Null if unknown. */
  buildCommand: string | null;
  /** Exact shell command to lint. Null if unknown. */
  lintCommand: string | null;
  /** Exact shell command to typecheck. Null if unknown. */
  typecheckCommand: string | null;
  /** True iff the repo is a monorepo (workspaces, Cargo workspace, etc.). */
  monorepo: boolean;
  /** True iff the repo has a browser-facing UI worth screenshot-verifying. */
  hasUI: boolean;
  /** Paths the agent should treat as high-risk when planning changes. */
  criticalPaths: string[];
  /** Short conventions bullets (naming, imports, error handling, …). */
  conventions: string[];
  /** "github-actions", "gitlab-ci", "circleci", null. */
  ciProvider: string | null;
  /** Free-form notes — architecture, gotchas, hot spots the agent should know. */
  notes: string;
}

export function getProjectProfilePath(cwd: string): string {
  return join(cwd, CONFIG_DIR_NAME, PROJECT_PROFILE_FILE);
}

export function loadProjectProfile(cwd: string): ProjectProfile | null {
  const path = getProjectProfilePath(cwd);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (!isProjectProfile(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveProjectProfile(cwd: string, profile: ProjectProfile): void {
  const path = getProjectProfilePath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(profile, null, 2) + '\n', { mode: 0o644 });
}

/**
 * Structural validation. Used when loading from disk and when parsing the
 * agent's tmp-JSON — we treat both as untrusted input. Missing fields that
 * are legitimately optional (all the `string | null` ones) are tolerated
 * and default to null / empty.
 */
export function isProjectProfile(value: unknown): value is ProjectProfile {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;

  const stringOrNull = (key: string): boolean =>
    v[key] === null || typeof v[key] === 'string';
  const stringArray = (key: string): boolean =>
    Array.isArray(v[key]) && (v[key] as unknown[]).every((s) => typeof s === 'string');

  return (
    typeof v.generatedAt === 'string' &&
    typeof v.primaryLanguage === 'string' &&
    stringOrNull('framework') &&
    stringOrNull('packageManager') &&
    stringOrNull('testCommand') &&
    stringOrNull('buildCommand') &&
    stringOrNull('lintCommand') &&
    stringOrNull('typecheckCommand') &&
    typeof v.monorepo === 'boolean' &&
    typeof v.hasUI === 'boolean' &&
    stringArray('criticalPaths') &&
    stringArray('conventions') &&
    stringOrNull('ciProvider') &&
    typeof v.notes === 'string'
  );
}

/**
 * Coerce a loosely-typed object (the agent's JSON) into a ProjectProfile,
 * filling in sensible defaults for missing optional fields. Returns null
 * if the object is too malformed to recover (e.g. no primaryLanguage).
 */
export function coerceProjectProfile(value: unknown): ProjectProfile | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.primaryLanguage !== 'string' || v.primaryLanguage.length === 0) {
    return null;
  }
  const str = (key: string): string | null => {
    const x = v[key];
    if (typeof x === 'string' && x.length > 0) return x;
    return null;
  };
  const arr = (key: string): string[] => {
    const x = v[key];
    if (!Array.isArray(x)) return [];
    return x.filter((s): s is string => typeof s === 'string' && s.length > 0);
  };
  return {
    generatedAt: typeof v.generatedAt === 'string' ? v.generatedAt : new Date().toISOString(),
    primaryLanguage: v.primaryLanguage,
    framework: str('framework'),
    packageManager: str('packageManager'),
    testCommand: str('testCommand'),
    buildCommand: str('buildCommand'),
    lintCommand: str('lintCommand'),
    typecheckCommand: str('typecheckCommand'),
    monorepo: typeof v.monorepo === 'boolean' ? v.monorepo : false,
    hasUI: typeof v.hasUI === 'boolean' ? v.hasUI : false,
    criticalPaths: arr('criticalPaths'),
    conventions: arr('conventions'),
    ciProvider: str('ciProvider'),
    notes: typeof v.notes === 'string' ? v.notes : '',
  };
}
