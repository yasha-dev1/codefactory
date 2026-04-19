import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CONFIG_DIR_NAME,
} from '../src/config.js';
import {
  AWAITING_APPROVAL_LABEL,
  DEFAULT_STAGES,
  loadGithubConnection,
  saveGithubConnection,
  type GithubConnectionConfig,
  type GithubIssueFilter,
  type StageDefinition,
} from '../src/github-connection.js';
import {
  DEFAULT_RUN_LOG_RETENTION_DAYS,
  MAX_STAGE_CHAIN,
  acquireLock,
  buildGithubPollCronLine,
  buildStagePrompt,
  detectStageForItem,
  getGithubPollPaths,
  getGithubRunsDir,
  passesFilter,
  pruneAgentRunLogs,
  releaseLock,
  runPollTick,
  writeAgentRunLog,
  type AgentRunLogRecord,
  type AgentRunResult,
  type GithubIssueItem,
  type PollTickIO,
  type StageTickRecord,
} from '../src/github-poller.js';

function tmpCwd(): string {
  return mkdtempSync(join(tmpdir(), 'harnext-gh-poll-'));
}

function makeItem(overrides: Partial<GithubIssueItem> = {}): GithubIssueItem {
  return {
    number: 1,
    title: 'Example issue',
    body: 'Some body',
    state: 'open',
    html_url: 'https://github.com/example/repo/issues/1',
    labels: [],
    updated_at: '2026-04-19T12:00:00Z',
    user: { login: 'alice' },
    assignees: [],
    ...overrides,
  };
}

function baseConfig(overrides: Partial<GithubConnectionConfig> = {}): GithubConnectionConfig {
  return {
    repo: 'example/repo',
    pollIntervalMinutes: 15,
    filter: { kind: 'none' },
    stages: DEFAULT_STAGES.map((s) => ({ ...s })),
    lastSeenUpdatedAt: '2026-04-19T10:00:00Z',
    updatedAt: Date.now(),
    ...overrides,
  };
}

/**
 * Scriptable IO stub for runPollTick. Each field records calls so tests
 * can assert exactly what the poller asked gh/the agent to do.
 */
function makeIo(opts: {
  items: GithubIssueItem[];
  agentResults: AgentRunResult[];
  /**
   * When a refetch is requested, we pop from this queue so YOLO chains see
   * the correct "next" label without touching real gh.
   */
  refetchResults?: GithubIssueItem[];
  transitionFailOn?: Array<{ itemNumber: number; removeLabel: string; message: string }>;
}): PollTickIO & {
  ticks: StageTickRecord[];
  prompts: string[];
  transitions: Array<{ remove: string; add?: string; itemNumber: number }>;
  refetches: number[];
  warnings: string[];
} {
  const ticks: StageTickRecord[] = [];
  const prompts: string[] = [];
  const transitions: Array<{ remove: string; add?: string; itemNumber: number }> = [];
  const refetches: number[] = [];
  const warnings: string[] = [];

  const agentQueue = [...opts.agentResults];
  const refetchQueue = [...(opts.refetchResults ?? [])];

  const io: PollTickIO = {
    fetch: () => ({ ok: true, value: opts.items }),
    refetch: (_repo, itemNumber) => {
      refetches.push(itemNumber);
      const next = refetchQueue.shift();
      if (!next) throw new Error(`test missing refetch for #${itemNumber}`);
      return { ok: true, value: next };
    },
    transition: (_repo, itemNumber, remove, add) => {
      transitions.push({ itemNumber, remove, add });
      const fail = opts.transitionFailOn?.find(
        (f) => f.itemNumber === itemNumber && f.removeLabel === remove,
      );
      if (fail) {
        return { ok: false, message: fail.message, exitCode: 1 };
      }
      return { ok: true, value: null };
    },
    runAgent: async (prompt) => {
      prompts.push(prompt);
      const next = agentQueue.shift();
      if (!next) throw new Error('test ran out of scripted agent results');
      return next;
    },
    appendTick: (r) => {
      ticks.push(r);
    },
    warn: (m) => {
      warnings.push(m);
    },
  };

  return Object.assign(io, { ticks, prompts, transitions, refetches, warnings });
}

// ─────────────────────────────────────────────────────────────────────

describe('detectStageForItem', () => {
  const stages: StageDefinition[] = [
    { id: 'triage', label: 'harnext:triage', prompt: 'p', mode: 'yolo' },
    { id: 'plan', label: 'harnext:plan', prompt: 'p', mode: 'human-approval' },
    { id: 'implement', label: 'harnext:implement', prompt: 'p', mode: 'human-approval' },
  ];

  it('returns undefined when no stage label is present', () => {
    const item = makeItem({ labels: [{ name: 'bug' }, { name: 'priority:low' }] });
    expect(detectStageForItem(item, stages)).toBeUndefined();
  });

  it('returns the matching stage when one label matches', () => {
    const item = makeItem({ labels: [{ name: 'harnext:plan' }, { name: 'bug' }] });
    expect(detectStageForItem(item, stages)?.id).toBe('plan');
  });

  it('picks the earliest stage in config order when multiple labels match', () => {
    const item = makeItem({
      labels: [{ name: 'harnext:implement' }, { name: 'harnext:triage' }],
    });
    expect(detectStageForItem(item, stages)?.id).toBe('triage');
  });
});

describe('passesFilter', () => {
  it('none always passes', () => {
    expect(passesFilter(makeItem(), { kind: 'none' })).toBe(true);
  });

  it('label filter matches only when label is present', () => {
    const filter: GithubIssueFilter = { kind: 'label', label: 'team:me' };
    expect(passesFilter(makeItem({ labels: [{ name: 'team:me' }] }), filter)).toBe(true);
    expect(passesFilter(makeItem({ labels: [{ name: 'team:other' }] }), filter)).toBe(false);
  });

  it('assignee filter checks the assignees list', () => {
    const filter: GithubIssueFilter = { kind: 'assignee', assignee: 'alice' };
    expect(passesFilter(makeItem({ assignees: [{ login: 'alice' }] }), filter)).toBe(true);
    expect(passesFilter(makeItem({ assignees: [{ login: 'bob' }] }), filter)).toBe(false);
  });
});

describe('buildStagePrompt', () => {
  const stage: StageDefinition = {
    id: 'triage',
    label: 'harnext:triage',
    prompt: 'STAGE PROMPT',
    mode: 'yolo',
  };

  it('composes stage prompt + issue context, with no shared base layer', () => {
    const item = makeItem({ labels: [{ name: 'harnext:triage' }] });
    const out = buildStagePrompt(stage, item);
    expect(out).toContain('STAGE PROMPT');
    expect(out).toContain('Kind: issue.');
    expect(out).toContain(`Number: #${item.number}`);
    expect(out).toContain(item.title);
  });

  it('identifies pull requests via pull_request field', () => {
    const pr = makeItem({ pull_request: { html_url: 'https://example/pr' } });
    const out = buildStagePrompt(stage, pr);
    expect(out).toContain('Kind: pull request.');
  });

  it('handles empty body and no labels gracefully', () => {
    const item = makeItem({ body: '', labels: [] });
    const out = buildStagePrompt(stage, item);
    expect(out).toContain('(empty)');
    expect(out).toContain('(no labels)');
  });
});

// ─────────────────────────────────────────────────────────────────────

describe('runPollTick', () => {
  it('primes the pointer and does no work on first tick', async () => {
    const fixed = new Date('2026-04-19T09:00:00Z');
    const cfg = baseConfig({ lastSeenUpdatedAt: undefined });
    const io = makeIo({ items: [], agentResults: [] });
    const result = await runPollTick(cfg, { ...io, now: () => fixed });
    expect(result.primedPointer).toBe(true);
    expect(result.newPointer).toBe(fixed.toISOString());
    expect(io.ticks).toHaveLength(0);
    expect(io.prompts).toHaveLength(0);
  });

  it('advances pointer past items without stage labels', async () => {
    const item = makeItem({
      number: 5,
      labels: [{ name: 'bug' }],
      updated_at: '2026-04-19T12:30:00Z',
    });
    const cfg = baseConfig();
    const io = makeIo({ items: [item], agentResults: [] });
    const result = await runPollTick(cfg, io);
    expect(result.processed).toBe(0);
    expect(result.newPointer).toBe(item.updated_at);
    expect(io.prompts).toHaveLength(0);
    expect(io.transitions).toHaveLength(0);
  });

  it('stops and adds awaiting-approval label for human-approval stage', async () => {
    const stages: StageDefinition[] = [
      { id: 'plan', label: 'harnext:plan', prompt: 'plan it', mode: 'human-approval' },
      { id: 'implement', label: 'harnext:implement', prompt: 'do it', mode: 'human-approval' },
    ];
    const item = makeItem({ number: 7, labels: [{ name: 'harnext:plan' }] });
    const cfg = baseConfig({ stages });
    const io = makeIo({
      items: [item],
      agentResults: [{ exit: 0, durationMs: 123, output: 'planned.' }],
    });

    const result = await runPollTick(cfg, io);
    expect(result.processed).toBe(1);
    expect(io.prompts).toHaveLength(1);
    expect(io.transitions).toEqual([
      { itemNumber: 7, remove: 'harnext:plan', add: AWAITING_APPROVAL_LABEL },
    ]);
    expect(io.refetches).toHaveLength(0);
    expect(io.ticks[0].stageId).toBe('plan');
    expect(io.ticks[0].mode).toBe('human-approval');
  });

  it('chains multiple YOLO stages within a single tick, refetching between', async () => {
    const stages: StageDefinition[] = [
      { id: 'triage', label: 'harnext:triage', prompt: 'triage', mode: 'yolo' },
      { id: 'verify', label: 'harnext:verify', prompt: 'verify', mode: 'yolo' },
      { id: 'review', label: 'harnext:review', prompt: 'review', mode: 'human-approval' },
    ];
    const initial = makeItem({ number: 9, labels: [{ name: 'harnext:triage' }] });
    const afterFirst = makeItem({ number: 9, labels: [{ name: 'harnext:verify' }] });
    const afterSecond = makeItem({ number: 9, labels: [{ name: 'harnext:review' }] });

    const cfg = baseConfig({ stages });
    const io = makeIo({
      items: [initial],
      agentResults: [
        { exit: 0, durationMs: 10, output: 'triaged' },
        { exit: 0, durationMs: 20, output: 'verified' },
        { exit: 0, durationMs: 30, output: 'reviewed' },
      ],
      refetchResults: [afterFirst, afterSecond],
    });

    await runPollTick(cfg, io);

    expect(io.prompts).toHaveLength(3);
    expect(io.ticks.map((t) => t.stageId)).toEqual(['triage', 'verify', 'review']);
    // After the human-approval terminal stage, we add awaiting-approval.
    expect(io.transitions).toEqual([
      { itemNumber: 9, remove: 'harnext:triage', add: 'harnext:verify' },
      { itemNumber: 9, remove: 'harnext:verify', add: 'harnext:review' },
      { itemNumber: 9, remove: 'harnext:review', add: AWAITING_APPROVAL_LABEL },
    ]);
    // Only YOLO steps refetch — human-approval terminal step doesn't.
    expect(io.refetches).toEqual([9, 9]);
  });

  it('halts the chain on agent failure without transitioning labels', async () => {
    const stages: StageDefinition[] = [
      { id: 'triage', label: 'harnext:triage', prompt: 'triage', mode: 'yolo' },
      { id: 'verify', label: 'harnext:verify', prompt: 'verify', mode: 'yolo' },
    ];
    const item = makeItem({ number: 3, labels: [{ name: 'harnext:triage' }] });
    const cfg = baseConfig({ stages });
    const io = makeIo({
      items: [item],
      agentResults: [{ exit: 2, durationMs: 7, output: 'tool err', error: 'boom' }],
    });

    await runPollTick(cfg, io);

    expect(io.prompts).toHaveLength(1);
    expect(io.transitions).toHaveLength(0);
    expect(io.ticks[0].exit).toBe(2);
    expect(io.warnings.some((w) => w.includes('agent failed'))).toBe(true);
  });

  it('halts chain when label transition fails', async () => {
    const stages: StageDefinition[] = [
      { id: 'triage', label: 'harnext:triage', prompt: 'triage', mode: 'yolo' },
      { id: 'verify', label: 'harnext:verify', prompt: 'verify', mode: 'yolo' },
    ];
    const item = makeItem({ number: 4, labels: [{ name: 'harnext:triage' }] });
    const cfg = baseConfig({ stages });
    const io = makeIo({
      items: [item],
      agentResults: [{ exit: 0, durationMs: 5, output: 'ok' }],
      transitionFailOn: [
        { itemNumber: 4, removeLabel: 'harnext:triage', message: 'rate limited' },
      ],
    });

    await runPollTick(cfg, io);

    expect(io.prompts).toHaveLength(1);
    expect(io.transitions).toHaveLength(1);
    expect(io.refetches).toHaveLength(0);
    expect(io.warnings.some((w) => w.includes('label transition failed'))).toBe(true);
  });

  it('last-stage YOLO removes the label and stops without a next-stage add', async () => {
    const stages: StageDefinition[] = [
      { id: 'only', label: 'harnext:only', prompt: 'only', mode: 'yolo' },
    ];
    const io = makeIo({
      items: [makeItem({ number: 12, labels: [{ name: 'harnext:only' }] })],
      agentResults: [{ exit: 0, durationMs: 1, output: '' }],
    });
    const result = await runPollTick(baseConfig({ stages }), io);
    expect(result.processed).toBe(1);
    expect(io.transitions).toEqual([
      { itemNumber: 12, remove: 'harnext:only', add: undefined },
    ]);
  });

  it('caps YOLO chain at MAX_STAGE_CHAIN when a cycle would otherwise loop', async () => {
    // Ten stages, each YOLO, each label-named after its index. The chain of
    // agent runs is capped by MAX_STAGE_CHAIN = 10. We queue exactly that
    // many agent results; if the cap weren't enforced, the test would throw
    // on the 11th runAgent call.
    const stages: StageDefinition[] = Array.from({ length: MAX_STAGE_CHAIN + 2 }, (_, i) => ({
      id: `s${i}`,
      label: `harnext:s${i}`,
      prompt: `p${i}`,
      mode: 'yolo' as const,
    }));
    const initial = makeItem({ number: 20, labels: [{ name: 'harnext:s0' }] });
    const refetchResults = Array.from({ length: MAX_STAGE_CHAIN }, (_, i) =>
      makeItem({ number: 20, labels: [{ name: `harnext:s${i + 1}` }] }),
    );
    const agentResults: AgentRunResult[] = Array.from(
      { length: MAX_STAGE_CHAIN },
      () => ({ exit: 0, durationMs: 1, output: '' }),
    );

    const io = makeIo({ items: [initial], agentResults, refetchResults });
    await runPollTick(baseConfig({ stages }), io);

    expect(io.prompts.length).toBe(MAX_STAGE_CHAIN);
  });

  it('returns the pointer unchanged when fetch fails', async () => {
    const cfg = baseConfig();
    const io: PollTickIO & { warnings: string[] } = {
      fetch: () => ({ ok: false, message: 'nope', exitCode: 1 }),
      refetch: () => {
        throw new Error('unexpected refetch');
      },
      transition: () => {
        throw new Error('unexpected transition');
      },
      runAgent: async () => {
        throw new Error('unexpected agent');
      },
      appendTick: () => {},
      warn: (m) => io.warnings.push(m),
      warnings: [],
    };
    const result = await runPollTick(cfg, io);
    expect(result.newPointer).toBe(cfg.lastSeenUpdatedAt);
    expect(result.processed).toBe(0);
    expect(io.warnings[0]).toContain('fetchUpdatedIssues failed');
  });
});

// ─────────────────────────────────────────────────────────────────────

describe('schema backfill', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = tmpCwd();
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('loads an old github.json without stages and backfills defaults', () => {
    const dir = join(cwd, CONFIG_DIR_NAME);
    mkdirSync(dir, { recursive: true });
    const old = {
      repo: 'example/repo',
      pollIntervalMinutes: 15,
      filter: { kind: 'none' },
      updatedAt: 1700000000000,
    };
    writeFileSync(join(dir, 'github.json'), JSON.stringify(old), 'utf-8');

    const loaded = loadGithubConnection(cwd);
    expect(loaded).not.toBeNull();
    expect(loaded?.stages).toHaveLength(DEFAULT_STAGES.length);
    expect(loaded?.stages.map((s) => s.id)).toEqual(DEFAULT_STAGES.map((s) => s.id));
    expect(loaded?.lastSeenUpdatedAt).toBeUndefined();
  });

  it('preserves stages and pointer through a save/load round-trip', () => {
    const cfg = baseConfig({
      stages: [
        { id: 'triage', label: 'harnext:triage', prompt: 'p', mode: 'yolo' },
        { id: 'plan', label: 'harnext:plan', prompt: 'q', mode: 'human-approval' },
      ],
      lastSeenUpdatedAt: '2026-04-19T12:00:00Z',
    });
    saveGithubConnection(cwd, cfg);
    const loaded = loadGithubConnection(cwd);
    expect(loaded?.stages.map((s) => s.id)).toEqual(['triage', 'plan']);
    expect(loaded?.lastSeenUpdatedAt).toBe('2026-04-19T12:00:00Z');
  });
});

// ─────────────────────────────────────────────────────────────────────

describe('lockfile', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = tmpCwd();
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('second acquire while first is held returns null', () => {
    const first = acquireLock(cwd);
    expect(first).not.toBeNull();
    const second = acquireLock(cwd);
    expect(second).toBeNull();
    if (first) releaseLock(first);
  });

  it('release allows re-acquire', () => {
    const first = acquireLock(cwd);
    if (first) releaseLock(first);
    const second = acquireLock(cwd);
    expect(second).not.toBeNull();
    if (second) releaseLock(second);
  });

  it('reclaims a lock whose pid is no longer running', () => {
    const { dir, lock } = getGithubPollPaths(cwd);
    mkdirSync(dir, { recursive: true });
    // pid 2^30 is almost certainly not a live process on this host.
    const fd = openSync(lock, 'w');
    writeSync(fd, JSON.stringify({ pid: 1 << 30, startedAt: new Date().toISOString() }));
    closeSync(fd);

    const handle = acquireLock(cwd);
    expect(handle).not.toBeNull();
    const contents = JSON.parse(readFileSync(lock, 'utf-8')) as { pid: number };
    expect(contents.pid).toBe(process.pid);
    if (handle) releaseLock(handle);
  });

  it('reclaims an unreadable lockfile', () => {
    const { dir, lock } = getGithubPollPaths(cwd);
    mkdirSync(dir, { recursive: true });
    writeFileSync(lock, 'not json', 'utf-8');
    const handle = acquireLock(cwd);
    expect(handle).not.toBeNull();
    if (handle) releaseLock(handle);
  });
});

// ─────────────────────────────────────────────────────────────────────

describe('buildGithubPollCronLine', () => {
  it('emits a --github-poll invocation tagged for this cwd', () => {
    const line = buildGithubPollCronLine({
      schedule: '*/15 * * * *',
      cliPath: '/usr/local/bin/harnext',
      cwd: '/home/user/project',
      tag: 'harnext:github-poll:abcdef0123',
      nodePath: '/usr/bin/node',
    });
    expect(line).toMatch(/^\*\/15 \* \* \* \* /);
    expect(line).toContain('--github-poll');
    expect(line).toContain('# harnext:github-poll:abcdef0123');
    expect(line).toContain('cd /home/user/project');
    expect(line).toContain('/usr/bin/node /usr/local/bin/harnext --github-poll');
  });

  it('shell-quotes paths with spaces', () => {
    const line = buildGithubPollCronLine({
      schedule: '0 */1 * * *',
      cliPath: '/path with space/harnext',
      cwd: '/dir with space',
      tag: 'harnext:github-poll:xyz',
    });
    expect(line).toContain(`'/dir with space'`);
    expect(line).toContain(`'/path with space/harnext'`);
  });

  it('injects PATH when provided so cron ticks can find gh', () => {
    const line = buildGithubPollCronLine({
      schedule: '*/3 * * * *',
      cliPath: '/opt/harnext/cli.js',
      cwd: '/home/user/project',
      tag: 'harnext:github-poll:xyz',
      nodePath: '/usr/bin/node',
      path: '/home/linuxbrew/.linuxbrew/bin:/usr/bin:/bin',
    });
    // PATH must sit between `cd ... && ` and the node invocation.
    expect(line).toContain('PATH=/home/linuxbrew/.linuxbrew/bin:/usr/bin:/bin');
    expect(line).toMatch(
      /cd \/home\/user\/project && PATH=\S+ \/usr\/bin\/node \/opt\/harnext\/cli\.js --github-poll/,
    );
  });

  it('shell-quotes PATH when it contains shell-unsafe characters', () => {
    const line = buildGithubPollCronLine({
      schedule: '*/3 * * * *',
      cliPath: '/opt/cli.js',
      cwd: '/tmp',
      tag: 'harnext:github-poll:xyz',
      path: "/home/u/my bin:/usr/bin",
    });
    expect(line).toContain(`PATH='/home/u/my bin:/usr/bin'`);
  });

  it('omits the PATH prefix when path is not provided', () => {
    const line = buildGithubPollCronLine({
      schedule: '*/15 * * * *',
      cliPath: '/opt/cli.js',
      cwd: '/tmp',
      tag: 'harnext:github-poll:abc',
    });
    expect(line).not.toContain('PATH=');
  });
});

// ─────────────────────────────────────────────────────────────────────

describe('writeAgentRunLog / pruneAgentRunLogs', () => {
  let cwd: string;
  beforeEach(() => {
    cwd = tmpCwd();
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  const record = (overrides: Partial<AgentRunLogRecord> = {}): AgentRunLogRecord => ({
    ts: '2026-04-19T12:45:00.000Z',
    itemNumber: 46,
    itemKind: 'issue',
    stageId: 'triage',
    stageLabel: 'harnext:triage',
    mode: 'yolo',
    exit: 0,
    durationMs: 1234,
    prompt: 'Stage: triage.',
    events: [
      { ts: '2026-04-19T12:45:00.500Z', type: 'message_end', role: 'assistant', text: 'hi' },
    ],
    ...overrides,
  });

  it('writes a JSON file named after the timestamp, kind, number, and stage', () => {
    const path = writeAgentRunLog(cwd, record());
    expect(path).toBe(
      join(
        getGithubRunsDir(cwd),
        '2026-04-19T12-45-00-000Z-issue-46-triage.json',
      ),
    );
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as AgentRunLogRecord;
    expect(parsed.itemNumber).toBe(46);
    expect(parsed.prompt).toBe('Stage: triage.');
    expect(parsed.events).toHaveLength(1);
  });

  it('does not touch files when the runs dir is missing', () => {
    // No runs dir yet — prune is a no-op and returns 0.
    expect(pruneAgentRunLogs(cwd)).toBe(0);
  });

  it('removes files whose mtime is older than the retention window', () => {
    const oldRecord = record({ itemNumber: 1, stageId: 'triage' });
    const freshRecord = record({ itemNumber: 2, stageId: 'triage' });
    const oldPath = writeAgentRunLog(cwd, oldRecord);
    const freshPath = writeAgentRunLog(cwd, freshRecord);

    // Backdate the first file past the retention window.
    const older = (DEFAULT_RUN_LOG_RETENTION_DAYS + 2) * 24 * 60 * 60;
    const past = Date.now() / 1000 - older;
    // utimesSync: access + modified time in seconds. Using fs util via a small helper.
    // We use require-free node:fs utimesSync for portability.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { utimesSync } = require('node:fs') as typeof import('node:fs');
    utimesSync(oldPath, past, past);

    const removed = pruneAgentRunLogs(cwd);
    expect(removed).toBe(1);
    // Fresh file remains.
    expect(() => readFileSync(freshPath)).not.toThrow();
    // Old file is gone.
    expect(() => readFileSync(oldPath)).toThrow();
  });

  it('is a no-op when every file is within the retention window', () => {
    writeAgentRunLog(cwd, record());
    expect(pruneAgentRunLogs(cwd)).toBe(0);
  });
});

describe('runPollTick · writeRunLog', () => {
  it('forwards the full transcript to writeRunLog when the io provides it', async () => {
    const stages: StageDefinition[] = [
      { id: 'triage', label: 'harnext:triage', prompt: 'Triage this.', mode: 'human-approval' },
    ];
    const item = makeItem({
      number: 46,
      labels: [{ name: 'harnext:triage' }],
      updated_at: '2026-04-19T12:45:00Z',
    });
    const io = makeIo({
      items: [item],
      agentResults: [
        {
          exit: 0,
          durationMs: 100,
          output: 'done',
          events: [
            { ts: 'x', type: 'message_end', role: 'assistant', text: 'done' },
          ],
        },
      ],
    });
    const runLogs: AgentRunLogRecord[] = [];
    const io2 = { ...io, writeRunLog: (rec: AgentRunLogRecord) => runLogs.push(rec) };
    await runPollTick(baseConfig({ stages }), io2);

    expect(runLogs).toHaveLength(1);
    expect(runLogs[0].itemNumber).toBe(46);
    expect(runLogs[0].stageId).toBe('triage');
    expect(runLogs[0].prompt).toContain('Triage this.');
    expect(runLogs[0].events).toHaveLength(1);
  });
});
