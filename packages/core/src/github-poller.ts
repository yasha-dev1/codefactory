import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';

import { getProjectStateDir } from './config.js';
import {
  AWAITING_APPROVAL_LABEL,
  GITHUB_CONFIG_FILE,
  NEEDS_JUDGMENT_LABEL,
  runGh,
  type GhResult,
  type GithubConnectionConfig,
  type GithubIssueFilter,
  type StageDefinition,
  type StageMode,
} from './github-connection.js';
import type { WorktreeRecord } from './worktree.js';

/**
 * Hard upper bound on how many stage chains one item can advance through
 * within a single tick. Protects against misconfigurations (e.g. a stage
 * whose next ends up re-pointing at itself) that would otherwise loop
 * forever.
 */
export const MAX_STAGE_CHAIN = 10;

export const GITHUB_POLL_LOG_FILE = 'github-poller.jsonl';
export const GITHUB_POLL_LOCK_FILE = 'github-poller.lock';
/** Per-tick full agent transcripts live under the project state dir. */
export const GITHUB_RUNS_DIR_NAME = 'github-runs';
/** Default retention for per-run logs. Ticks older than this get pruned. */
export const DEFAULT_RUN_LOG_RETENTION_DAYS = 7;

// ── Types returned from the GitHub issues/PR search ─────────────────

export interface GithubIssueItem {
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  labels: Array<{ name: string }>;
  updated_at: string;
  /** Present (with `html_url`) when the item is actually a PR. */
  pull_request?: { html_url: string };
  user: { login: string };
  assignees: Array<{ login: string }>;
}

export interface StageTickRecord {
  ts: string;
  itemNumber: number;
  itemKind: 'issue' | 'pr';
  stageId: string;
  stageLabel: string;
  mode: StageMode;
  exit: number;
  durationMs: number;
  output: string;
  error?: string;
}

// ── Paths ───────────────────────────────────────────────────────────

export interface GithubPollPaths {
  dir: string;
  log: string;
  lock: string;
}

export function getGithubPollPaths(cwd: string): GithubPollPaths {
  const dir = getProjectStateDir(cwd);
  return {
    dir,
    log: join(dir, GITHUB_POLL_LOG_FILE),
    lock: join(dir, GITHUB_POLL_LOCK_FILE),
  };
}

export function getGithubRunsDir(cwd: string): string {
  return join(getProjectStateDir(cwd), GITHUB_RUNS_DIR_NAME);
}

/** Stable cron tag so we can find/update the line on reconfigure. */
export function getGithubPollCronTag(cwd: string): string {
  const h = createHash('sha256').update(cwd).digest('hex').slice(0, 10);
  return `harnext:github-poll:${h}`;
}

// ── Fetch / detect / prompt compose ─────────────────────────────────

/**
 * Page through `gh api repos/<repo>/issues?since=...` and return all items
 * in ascending-updated_at order. Uses `--paginate`, which for JSON-array
 * responses emits a single concatenated array.
 */
export function fetchUpdatedIssues(
  repo: string,
  sinceIso: string,
): GhResult<GithubIssueItem[]> {
  // `gh api` flips to POST as soon as any -f/-F flag is present. Force GET
  // explicitly so the query params are attached to the URL instead of the
  // body (a POST to /repos/X/issues tries to create an issue and 422s).
  const result = runGh([
    'api',
    '--method',
    'GET',
    `repos/${repo}/issues`,
    '-f',
    `since=${sinceIso}`,
    '-f',
    'state=all',
    '-f',
    'sort=updated',
    '-f',
    'direction=asc',
    '-f',
    'per_page=100',
    '--paginate',
  ]);
  if (!result.ok) return result;
  try {
    const parsed = JSON.parse(result.value) as GithubIssueItem[];
    return { ok: true, value: parsed };
  } catch (err) {
    return {
      ok: false,
      message: `could not parse gh issues response: ${err instanceof Error ? err.message : String(err)}`,
      exitCode: 1,
    };
  }
}

/**
 * First-label-match wins. Stage order in the config is authoritative so a
 * team can define which stage takes priority when two labels are present
 * (which should not happen in steady state — poller removes them — but is
 * possible after manual label juggling).
 */
export function detectStageForItem(
  item: GithubIssueItem,
  stages: StageDefinition[],
): StageDefinition | undefined {
  const labels = new Set(item.labels.map((l) => l.name));
  for (const stage of stages) {
    if (labels.has(stage.label)) return stage;
  }
  return undefined;
}

/** Filter predicate that mirrors the wizard's filter options. */
export function passesFilter(item: GithubIssueItem, filter: GithubIssueFilter): boolean {
  switch (filter.kind) {
    case 'none':
      return true;
    case 'label':
      return item.labels.some((l) => l.name === filter.label);
    case 'assignee':
      return item.assignees.some((a) => a.login === filter.assignee);
  }
}

export function isPullRequest(item: GithubIssueItem): boolean {
  return !!item.pull_request;
}

/**
 * Compose the prompt sent to the agent for one stage run. The stage-specific
 * prompt comes first (what to do), followed by a rigid context block (the
 * item). There is no shared/base layer — each stage stands on its own.
 */
export function buildStagePrompt(
  stage: StageDefinition,
  item: GithubIssueItem,
): string {
  const kind = isPullRequest(item) ? 'pull request' : 'issue';
  const labelList = item.labels.map((l) => l.name).join(', ') || '(no labels)';
  const assigneeList = item.assignees.map((a) => a.login).join(', ') || '(none)';

  const context = [
    `## Context`,
    ``,
    `- Repo: this working directory.`,
    `- Kind: ${kind}.`,
    `- Number: #${item.number}.`,
    `- URL: ${item.html_url}`,
    `- State: ${item.state}.`,
    `- Author: ${item.user.login}.`,
    `- Assignees: ${assigneeList}.`,
    `- Labels: ${labelList}.`,
    ``,
    `### Title`,
    item.title,
    ``,
    `### Body`,
    item.body && item.body.trim().length > 0 ? item.body : '(empty)',
  ].join('\n');

  return [stage.prompt, '', context].join('\n');
}

// ── Label transitions ───────────────────────────────────────────────

/**
 * Remove a label from an item and (optionally) add another. Two `gh api`
 * calls because the labels endpoint does not atomically swap. Errors from
 * either call are surfaced so the caller can log them; we still treat a
 * "label not found on issue" 404 as success (idempotent remove).
 */
export function transitionLabels(
  repo: string,
  itemNumber: number,
  removeLabel: string,
  addLabel?: string,
): GhResult<null> {
  const removeResult = runGh([
    'api',
    '--method',
    'DELETE',
    `repos/${repo}/issues/${itemNumber}/labels/${encodeURIComponent(removeLabel)}`,
  ]);
  if (!removeResult.ok && !/404|Label does not exist/i.test(removeResult.message)) {
    return removeResult;
  }

  if (!addLabel) return { ok: true, value: null };

  const addResult = runGh([
    'api',
    '--method',
    'POST',
    `repos/${repo}/issues/${itemNumber}/labels`,
    '-f',
    `labels[]=${addLabel}`,
  ]);
  if (!addResult.ok) return addResult;
  return { ok: true, value: null };
}

/** Re-fetch a single item after a label transition so the next iteration of
 *  the chain sees the updated labels. */
export function refetchItem(repo: string, itemNumber: number): GhResult<GithubIssueItem> {
  const result = runGh(['api', `repos/${repo}/issues/${itemNumber}`]);
  if (!result.ok) return result;
  try {
    return { ok: true, value: JSON.parse(result.value) as GithubIssueItem };
  } catch (err) {
    return {
      ok: false,
      message: `could not parse gh issue response: ${err instanceof Error ? err.message : String(err)}`,
      exitCode: 1,
    };
  }
}

// ── Tick log ────────────────────────────────────────────────────────

export function appendGithubPollTick(cwd: string, record: StageTickRecord): void {
  const { dir, log } = getGithubPollPaths(cwd);
  mkdirSync(dir, { recursive: true });
  appendFileSync(log, JSON.stringify(record) + '\n', 'utf-8');
}

// ── Per-run transcripts ─────────────────────────────────────────────

/**
 * Snapshot of a single relevant event emitted during one agent run. We
 * intentionally flatten so the log file is readable without pulling in the
 * pi-agent-core types on the reader side.
 */
export interface AgentRunLogEvent {
  ts: string;
  type:
    | 'message_start'
    | 'message_end'
    | 'tool_execution_start'
    | 'tool_execution_end'
    | 'turn_end';
  /** Free-form so we can carry upstream message roles (incl. "toolResult") without a type crosscut. */
  role?: string;
  text?: string;
  toolName?: string;
  toolCallId?: string;
  toolInput?: unknown;
  toolOutput?: string;
  isError?: boolean;
}

/**
 * Full transcript of a single stage run written to <cwd>/.harnext/github-runs/.
 * One file per run keeps grep/less ergonomic; `writeAgentRunLog` returns the
 * path for callers that want to point the user at it.
 */
export interface AgentRunLogRecord {
  ts: string;
  itemNumber: number;
  itemKind: 'issue' | 'pr';
  stageId: string;
  stageLabel: string;
  mode: StageMode;
  exit: number;
  durationMs: number;
  prompt: string;
  events: AgentRunLogEvent[];
  error?: string;
}

function safeTimestampForFilename(iso: string): string {
  return iso.replace(/[:.]/g, '-');
}

/**
 * Write one run's transcript. File naming: <iso-ts>-<kind>-<number>-<stage>.json.
 * Returns the absolute path so the mode can reference it in the tick summary.
 */
export function writeAgentRunLog(cwd: string, record: AgentRunLogRecord): string {
  const dir = getGithubRunsDir(cwd);
  mkdirSync(dir, { recursive: true });
  const slug = `${safeTimestampForFilename(record.ts)}-${record.itemKind}-${record.itemNumber}-${record.stageId}.json`;
  const path = join(dir, slug);
  writeFileSync(path, JSON.stringify(record, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 });
  return path;
}

/**
 * Remove run-log files older than `maxAgeDays`. Returns the number of files
 * deleted. Silently skips files we can't stat/unlink — best-effort cleanup.
 */
export function pruneAgentRunLogs(
  cwd: string,
  maxAgeDays: number = DEFAULT_RUN_LOG_RETENTION_DAYS,
  now: Date = new Date(),
): number {
  const dir = getGithubRunsDir(cwd);
  if (!existsSync(dir)) return 0;
  const cutoff = now.getTime() - Math.max(0, maxAgeDays) * 24 * 60 * 60 * 1000;
  let removed = 0;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const full = join(dir, entry);
    try {
      const st = statSync(full);
      if (st.mtimeMs < cutoff) {
        unlinkSync(full);
        removed += 1;
      }
    } catch {
      // best-effort
    }
  }
  return removed;
}

// ── Lockfile ────────────────────────────────────────────────────────

export interface LockHandle {
  path: string;
}

interface LockContents {
  pid: number;
  startedAt: string;
}

/**
 * Acquire the project's poll lock. Returns null if another tick holds a live
 * lock. If the lockfile exists but its pid is no longer running, we treat it
 * as stale and reclaim. Uses O_EXCL for atomic exclusive create.
 */
export function acquireLock(cwd: string): LockHandle | null {
  const { dir, lock } = getGithubPollPaths(cwd);
  mkdirSync(dir, { recursive: true });

  const writeOwnership = (): LockHandle => {
    const fd = openSync(lock, 'w');
    const contents: LockContents = { pid: process.pid, startedAt: new Date().toISOString() };
    writeSync(fd, JSON.stringify(contents));
    closeSync(fd);
    return { path: lock };
  };

  try {
    const fd = openSync(lock, 'wx');
    const contents: LockContents = { pid: process.pid, startedAt: new Date().toISOString() };
    writeSync(fd, JSON.stringify(contents));
    closeSync(fd);
    return { path: lock };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'EEXIST') throw err;
  }

  // Lock exists — check if the holder is still alive.
  let existing: LockContents | null = null;
  try {
    existing = JSON.parse(readFileSync(lock, 'utf-8')) as LockContents;
  } catch {
    // Unreadable lock file — reclaim.
    return writeOwnership();
  }
  if (typeof existing.pid !== 'number') return writeOwnership();
  try {
    process.kill(existing.pid, 0);
    return null; // holder is alive
  } catch {
    // Holder is dead — reclaim.
    return writeOwnership();
  }
}

export function releaseLock(handle: LockHandle): void {
  try {
    unlinkSync(handle.path);
  } catch {
    // best-effort
  }
}

// ── Cron line ───────────────────────────────────────────────────────

export interface GithubPollCronLineOptions {
  schedule: string;
  cliPath: string;
  cwd: string;
  tag: string;
  nodePath?: string;
  /** PATH value to inject so the tick can find `gh` and other user-installed binaries. */
  path?: string;
}

function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Build a crontab line for this project's GitHub poller. Output is appended
 * to the same log the tick writer uses, so a crashed boot (bad PATH, missing
 * node) leaves a trail.
 */
export function buildGithubPollCronLine(opts: GithubPollCronLineOptions): string {
  const node = opts.nodePath ?? 'node';
  const logPath = getGithubPollPaths(opts.cwd).log;
  const pathPrefix = opts.path ? `PATH=${shellQuote(opts.path)} ` : '';
  const cmd =
    `cd ${shellQuote(opts.cwd)} && ` +
    `${pathPrefix}${shellQuote(node)} ${shellQuote(opts.cliPath)} --github-poll ` +
    `>> ${shellQuote(logPath)} 2>&1`;
  return `${opts.schedule} ${cmd} # ${opts.tag}`;
}

// ── Tick driver ─────────────────────────────────────────────────────

export interface AgentRunResult {
  exit: number;
  durationMs: number;
  output: string;
  error?: string;
  /** Optional full transcript of the run. When present, runPollTick forwards it to writeRunLog. */
  events?: AgentRunLogEvent[];
}

export interface RunAgentOptions {
  /**
   * Per-item worktree path, when `resolveWorktree` is wired. When undefined
   * the runAgent implementation should fall back to its own default cwd
   * (typically the project root).
   */
  cwd?: string;
}

/**
 * IO shims the tick driver depends on. The real CLI mode wires these to gh
 * + the harnext AgentSession; tests stub them to assert chain behaviour
 * without hitting the network or the LLM.
 */
export interface PollTickIO {
  fetch: (repo: string, since: string) => GhResult<GithubIssueItem[]>;
  refetch: (repo: string, itemNumber: number) => GhResult<GithubIssueItem>;
  transition: (
    repo: string,
    itemNumber: number,
    remove: string,
    add?: string,
  ) => GhResult<null>;
  runAgent: (prompt: string, opts: RunAgentOptions) => Promise<AgentRunResult>;
  appendTick: (record: StageTickRecord) => void;
  /** If provided, each stage run's full transcript is written here. */
  writeRunLog?: (record: AgentRunLogRecord) => void;
  /**
   * If provided, called at the top of each item's stage chain. The returned
   * record's `path` becomes the cwd passed to `runAgent` for every stage the
   * item goes through during this tick.
   */
  resolveWorktree?: (item: GithubIssueItem) => Promise<WorktreeRecord>;
  /**
   * If provided, called after the chain terminates cleanly — i.e. the item
   * exited the pipeline (no next stage) and isn't parked on awaiting-approval
   * or needs-judgment. Release is best-effort: errors are swallowed into warn.
   */
  releaseWorktree?: (item: GithubIssueItem) => Promise<void>;
  /** Called for warnings that are not fatal (e.g. label transition failed). */
  warn?: (message: string) => void;
  /** Override date source for tests. */
  now?: () => Date;
}

export interface PollTickResult {
  /** New lastSeenUpdatedAt to persist. */
  newPointer: string;
  /** Number of items the loop visited (filtered or not). */
  visited: number;
  /** Number of items that triggered at least one stage run. */
  processed: number;
  /** True if the first-ever tick (no prior pointer) just primed the pointer. */
  primedPointer: boolean;
}

export async function runPollTick(
  cfg: GithubConnectionConfig,
  io: PollTickIO,
): Promise<PollTickResult> {
  const now = io.now ?? (() => new Date());
  const warn = io.warn ?? (() => {});

  // First tick: no previous pointer — prime it and return without work so we
  // don't catch up on months of history on an already-busy repo.
  if (!cfg.lastSeenUpdatedAt) {
    return {
      newPointer: now().toISOString(),
      visited: 0,
      processed: 0,
      primedPointer: true,
    };
  }

  const fetchResult = io.fetch(cfg.repo, cfg.lastSeenUpdatedAt);
  if (!fetchResult.ok) {
    warn(`fetchUpdatedIssues failed: ${fetchResult.message}`);
    return {
      newPointer: cfg.lastSeenUpdatedAt,
      visited: 0,
      processed: 0,
      primedPointer: false,
    };
  }

  let newPointer = cfg.lastSeenUpdatedAt;
  let processed = 0;
  const items = fetchResult.value;

  for (const initialItem of items) {
    let item = initialItem;

    if (!passesFilter(item, cfg.filter)) {
      newPointer = item.updated_at;
      continue;
    }

    let stage: StageDefinition | undefined = detectStageForItem(item, cfg.stages);
    if (!stage) {
      newPointer = item.updated_at;
      continue;
    }

    // Resolve a worktree for this item up front. Any subsequent stage in the
    // chain reuses it. If the resolve hook throws, we surface the error as a
    // warning and skip the item — the next tick will retry.
    let workRecord: WorktreeRecord | undefined;
    if (io.resolveWorktree) {
      try {
        workRecord = await io.resolveWorktree(item);
      } catch (err) {
        warn(
          `worktree resolve failed for #${item.number}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        newPointer = item.updated_at;
        continue;
      }
    }

    let chainDepth = 0;
    let processedThisItem = false;
    /** True iff the item exited the pipeline cleanly this tick. */
    let chainCompleted = false;

    try {
      while (stage && chainDepth < MAX_STAGE_CHAIN) {
        const prompt = buildStagePrompt(stage, item);
        const startedAt = now();
        const result = await io.runAgent(prompt, { cwd: workRecord?.path });

        const kind: 'issue' | 'pr' = isPullRequest(item) ? 'pr' : 'issue';
        io.appendTick({
          ts: startedAt.toISOString(),
          itemNumber: item.number,
          itemKind: kind,
          stageId: stage.id,
          stageLabel: stage.label,
          mode: stage.mode,
          exit: result.exit,
          durationMs: result.durationMs,
          output: result.output,
          error: result.error,
        });
        if (io.writeRunLog) {
          io.writeRunLog({
            ts: startedAt.toISOString(),
            itemNumber: item.number,
            itemKind: kind,
            stageId: stage.id,
            stageLabel: stage.label,
            mode: stage.mode,
            exit: result.exit,
            durationMs: result.durationMs,
            prompt,
            events: result.events ?? [],
            error: result.error,
          });
        }
        processedThisItem = true;

        if (result.exit !== 0) {
          // Agent failed — leave the label in place so the human can decide to
          // re-queue by touching the issue.
          warn(`agent failed on #${item.number} stage ${stage.id} (exit ${result.exit})`);
          break;
        }

        const currentStage: StageDefinition = stage;
        const nextStage: StageDefinition | undefined = cfg.stages[cfg.stages.indexOf(currentStage) + 1];
        const handoffLabel = currentStage.mode === 'human-approval'
          ? AWAITING_APPROVAL_LABEL
          : nextStage?.label;

        const transitionResult = io.transition(
          cfg.repo,
          item.number,
          currentStage.label,
          handoffLabel,
        );
        if (!transitionResult.ok) {
          warn(
            `label transition failed for #${item.number}: ${transitionResult.message}`,
          );
          break;
        }

        if (currentStage.mode === 'human-approval') break;
        if (!nextStage) {
          // Last YOLO stage; nothing further to do on this item.
          chainCompleted = true;
          break;
        }

        // YOLO: reload the item so detectStageForItem sees the newly-added next label.
        const refetched = io.refetch(cfg.repo, item.number);
        if (!refetched.ok) {
          warn(`refetch failed for #${item.number}: ${refetched.message}`);
          break;
        }
        item = refetched.value;
        stage = nextStage;
        chainDepth += 1;
      }
    } finally {
      if (io.releaseWorktree && workRecord) {
        const parkedLabels = new Set(item.labels.map((l) => l.name));
        const parked =
          parkedLabels.has(AWAITING_APPROVAL_LABEL) ||
          parkedLabels.has(NEEDS_JUDGMENT_LABEL);
        const closed = item.state === 'closed';
        if (closed || (chainCompleted && !parked)) {
          try {
            await io.releaseWorktree(item);
          } catch (err) {
            warn(
              `worktree release failed for #${item.number}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        }
      }
    }

    if (processedThisItem) processed += 1;
    newPointer = item.updated_at;
  }

  return {
    newPointer,
    visited: items.length,
    processed,
    primedPointer: false,
  };
}

/** Best-effort stringify for the config before writing it back. Exposed so
 *  tests can assert atomicity: the pointer advance write uses this. */
export function stringifyConnectionForSave(cfg: GithubConnectionConfig): string {
  return JSON.stringify(cfg, null, 2) + '\n';
}

/** Write-through helper for the pointer so callers can persist without
 *  depending on the save helper's signature. */
export function persistPointer(
  cwd: string,
  cfg: GithubConnectionConfig,
  pointer: string,
): void {
  const path = join(getProjectStateDir(cwd), GITHUB_CONFIG_FILE);
  const next: GithubConnectionConfig = { ...cfg, lastSeenUpdatedAt: pointer, updatedAt: Date.now() };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stringifyConnectionForSave(next), { encoding: 'utf-8', mode: 0o600 });
}
