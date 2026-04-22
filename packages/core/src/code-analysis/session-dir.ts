/**
 * Persistent scratch directory shared across all code-analysis sub-stages.
 *
 * The classic per-stage `mkdtempSync` → `rmSync` pattern means each stage's
 * tmp files are gone before the next stage starts. The new pipeline wants
 * later stages' agent runs to be able to read earlier stages' JSON output
 * without re-invoking the earlier stage, so we allocate one directory at
 * pipeline entry and keep it alive for the whole run.
 *
 * Location: `<cwd>/.harnext/analysis-runs/<ISO-timestamp>-<rand6>/`.
 * In-repo (not OS tmp) so:
 *   - the agent can reference paths relative to cwd,
 *   - the user can inspect a retained session after a failure,
 *   - debugging workflows don't require a system tmpdir crawl.
 *
 * A `.gitignore` entry for `analysis-runs/` is appended-if-missing to
 * `<cwd>/.harnext/.gitignore` so these dirs never get committed.
 */

import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { CONFIG_DIR_NAME } from '../config.js';

const SESSION_SUBDIR = 'analysis-runs';
const KEEP_ENV_VAR = 'HARNEXT_KEEP_ANALYSIS_DIR';
const GITIGNORE_ENTRY = `${SESSION_SUBDIR}/`;

export interface ManifestEntry {
  stage: string;
  outputs: string[];
}

export interface SessionDir {
  /** Absolute path to the session root. */
  readonly root: string;
  /** Absolute path to `<root>/manifest.json`. */
  readonly manifestPath: string;
  /**
   * Absolute path under the session for a stage's file. Creates the
   * per-stage subdirectory lazily.
   */
  pathFor(stageId: string, fileName: string): string;
  /** Append an entry to `manifest.json` (rewrites the whole file atomically). */
  appendManifest(entry: ManifestEntry): void;
  /**
   * Remove the session root. No-op if `retain()` was called or
   * `HARNEXT_KEEP_ANALYSIS_DIR=1` was set at construction time.
   */
  cleanup(): void;
  /**
   * Suppress subsequent `cleanup()` calls. Typically called from the
   * orchestrator's error branch so a failed run's intermediates stay
   * around for inspection. `reason` is appended to the manifest for
   * debugging context.
   */
  retain(reason: string): void;
}

export function createSessionDir(cwd: string): SessionDir {
  const parent = join(cwd, CONFIG_DIR_NAME, SESSION_SUBDIR);
  mkdirSync(parent, { recursive: true });
  ensureGitignore(cwd);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const suffix = randomBytes(3).toString('hex');
  const root = join(parent, `${stamp}-${suffix}`);
  mkdirSync(root, { recursive: true });

  const manifestPath = join(root, 'manifest.json');
  writeFileSync(
    manifestPath,
    JSON.stringify({ createdAt: new Date().toISOString(), entries: [] }, null, 2) +
      '\n',
    'utf-8',
  );

  let retained = process.env[KEEP_ENV_VAR] === '1';
  let retainReason: string | null = null;

  const pathFor = (stageId: string, fileName: string): string => {
    const dir = join(root, stageId);
    mkdirSync(dir, { recursive: true });
    return join(dir, fileName);
  };

  const appendManifest = (entry: ManifestEntry): void => {
    let current: { createdAt: string; entries: ManifestEntry[]; retain?: string };
    try {
      const raw = readFileSync(manifestPath, 'utf-8');
      current = JSON.parse(raw) as typeof current;
      if (!Array.isArray(current.entries)) current.entries = [];
    } catch {
      current = { createdAt: new Date().toISOString(), entries: [] };
    }
    current.entries.push(entry);
    if (retainReason) current.retain = retainReason;
    writeFileSync(manifestPath, JSON.stringify(current, null, 2) + '\n', 'utf-8');
  };

  const retain = (reason: string): void => {
    retained = true;
    retainReason = reason;
    // Stamp the manifest so inspectors see why the run was kept.
    try {
      const raw = readFileSync(manifestPath, 'utf-8');
      const current = JSON.parse(raw) as {
        createdAt: string;
        entries: ManifestEntry[];
        retain?: string;
      };
      current.retain = reason;
      writeFileSync(manifestPath, JSON.stringify(current, null, 2) + '\n', 'utf-8');
    } catch {
      // best effort; manifest stamping isn't load-bearing
    }
  };

  const cleanup = (): void => {
    if (retained) return;
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // best effort; a leftover dir in .harnext/analysis-runs is benign
    }
  };

  return {
    root,
    manifestPath,
    pathFor,
    appendManifest,
    cleanup,
    retain,
  };
}

/**
 * Appends `analysis-runs/` to `.harnext/.gitignore` if it isn't already
 * present. Creates the `.gitignore` when missing. Never clobbers existing
 * lines (important — `.harnext/` may accumulate user-authored ignores).
 */
function ensureGitignore(cwd: string): void {
  const gitignorePath = join(cwd, CONFIG_DIR_NAME, '.gitignore');
  mkdirSync(dirname(gitignorePath), { recursive: true });
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, `${GITIGNORE_ENTRY}\n`, 'utf-8');
    return;
  }
  let existing: string;
  try {
    existing = readFileSync(gitignorePath, 'utf-8');
  } catch {
    return;
  }
  const lines = existing.split('\n').map((l) => l.trim());
  if (lines.includes(GITIGNORE_ENTRY) || lines.includes(SESSION_SUBDIR)) return;
  const prefix = existing.endsWith('\n') || existing.length === 0 ? '' : '\n';
  appendFileSync(gitignorePath, `${prefix}${GITIGNORE_ENTRY}\n`, 'utf-8');
}
