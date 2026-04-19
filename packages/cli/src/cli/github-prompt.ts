import { createInterface } from 'node:readline';

import chalk from 'chalk';
import {
  DEFAULT_STAGES,
  GITHUB_POLL_INTERVAL_PRESETS,
  buildCronSchedule,
  buildGithubPollCronLine,
  buildHarnextLabelSpecs,
  deleteGithubConnection,
  ensureRepoLabels,
  findCronLine,
  getGithubConfigPath,
  getGithubPollCronTag,
  getRepoFromCwd,
  installCronLine,
  listRepoAssignableUsers,
  listRepoLabels,
  loadGithubConnection,
  removeCronLine,
  saveGithubConnection,
  verifyGhAuth,
  type GhResult,
  type GithubConnectionConfig,
  type GithubIssueFilter,
  type GithubPollIntervalMinutes,
  type StageDefinition,
  type StageMode,
} from '@harnext/core';

import { editPrompt } from './external-editor.js';
import { select } from './select.js';
import type { SelectItem } from './select.js';

function readLine(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise<string>((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function confirm(question: string, defaultYes = false): Promise<boolean> {
  const suffix = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = (await readLine(chalk.cyan(`  ${question} ${suffix}: `))).trim();
  if (answer.length === 0) return defaultYes;
  if (defaultYes) return !/^n(o)?$/i.test(answer);
  return /^y(es)?$/i.test(answer);
}

function formatInterval(minutes: number): string {
  if (minutes < 60) return `every ${minutes} min`;
  if (minutes === 60) return 'hourly';
  if (minutes < 1440) return `every ${minutes / 60}h`;
  return 'daily';
}

function formatFilter(filter: GithubIssueFilter): string {
  switch (filter.kind) {
    case 'label':
      return `label = ${filter.label}`;
    case 'assignee':
      return `assignee = ${filter.assignee}`;
    case 'none':
      return 'all open issues';
  }
}

function formatMode(mode: StageMode): string {
  return mode === 'yolo' ? 'YOLO (auto-chain)' : 'Human approval';
}

function renderStagesTable(stages: StageDefinition[]): void {
  console.log(chalk.dim('  #  id            label                          mode'));
  stages.forEach((s, i) => {
    const idx = String(i + 1).padEnd(2);
    const id = s.id.padEnd(12);
    const label = s.label.padEnd(30);
    console.log(chalk.dim(`  ${idx} `) + chalk.cyan(id) + ' ' + label + ' ' + formatMode(s.mode));
  });
}

function validateStageLabel(label: string, stages: StageDefinition[], self?: number): string | null {
  if (!label) return 'label is required';
  if (/\s/.test(label)) return 'label must not contain whitespace';
  const duplicate = stages.findIndex((s, i) => s.label === label && i !== self);
  if (duplicate >= 0) return `label "${label}" already used by stage ${duplicate + 1}`;
  return null;
}

function cloneStages(stages: StageDefinition[]): StageDefinition[] {
  return stages.map((s) => ({ ...s }));
}

async function pickStageMode(current: StageMode): Promise<StageMode | undefined> {
  const items: SelectItem<StageMode>[] = [
    {
      label: 'YOLO (auto-chain)',
      value: 'yolo',
      hint:
        current === 'yolo'
          ? 'current — poller moves to the next stage automatically'
          : 'poller moves to the next stage automatically',
    },
    {
      label: 'Human approval',
      value: 'human-approval',
      hint:
        current === 'human-approval'
          ? 'current — poller stops and waits for a human'
          : 'poller stops and waits for a human',
    },
  ];
  return select(items, { title: 'When the agent finishes this stage…' });
}

/**
 * Edit a single stage: label, prompt, mode, or id. Mutates `stages` in place.
 * Returns true if anything was changed.
 */
async function editStage(
  stages: StageDefinition[],
  index: number,
): Promise<boolean> {
  const stage = stages[index];
  let changed = false;

  for (;;) {
    console.log();
    console.log(chalk.bold(`  Editing stage ${index + 1}: `) + chalk.cyan(stage.id));
    console.log(chalk.dim(`    label:  ${stage.label}`));
    console.log(chalk.dim(`    mode:   ${formatMode(stage.mode)}`));
    console.log(chalk.dim(`    prompt: ${stage.prompt.split('\n')[0].slice(0, 80)}…`));

    type Action =
      | { kind: 'label' }
      | { kind: 'prompt' }
      | { kind: 'mode' }
      | { kind: 'id' }
      | { kind: 'done' };
    const items: SelectItem<Action>[] = [
      { label: 'Edit label', value: { kind: 'label' } },
      { label: 'Edit prompt', value: { kind: 'prompt' } },
      { label: 'Edit mode', value: { kind: 'mode' } },
      { label: 'Edit id', value: { kind: 'id' }, hint: 'internal identifier — used in logs' },
      { label: 'Done', value: { kind: 'done' } },
    ];
    const action = await select(items, { title: 'What do you want to change?' });
    if (!action || action.kind === 'done') return changed;

    if (action.kind === 'label') {
      const answer = (await readLine(chalk.cyan(`  label [${stage.label}]: `))).trim();
      if (!answer) continue;
      const err = validateStageLabel(answer, stages, index);
      if (err) {
        console.log(chalk.red(`  ${err}`));
        continue;
      }
      stage.label = answer;
      changed = true;
    } else if (action.kind === 'prompt') {
      const updated = await editPrompt(stage.prompt, {
        title: `Edit prompt for stage "${stage.id}"`,
      });
      if (updated && updated !== stage.prompt) {
        stage.prompt = updated;
        changed = true;
      }
    } else if (action.kind === 'mode') {
      const mode = await pickStageMode(stage.mode);
      if (mode && mode !== stage.mode) {
        stage.mode = mode;
        changed = true;
      }
    } else if (action.kind === 'id') {
      const answer = (await readLine(chalk.cyan(`  id [${stage.id}]: `))).trim();
      if (!answer || answer === stage.id) continue;
      if (!/^[a-z0-9-]+$/.test(answer)) {
        console.log(chalk.red('  id must be lowercase a-z, 0-9, hyphens'));
        continue;
      }
      stage.id = answer;
      changed = true;
    }
  }
}

async function runStagesStep(current?: StageDefinition[]): Promise<StageDefinition[] | undefined> {
  const stages = cloneStages(current ?? DEFAULT_STAGES);

  for (;;) {
    console.log();
    renderStagesTable(stages);
    console.log();

    type Action =
      | { kind: 'done' }
      | { kind: 'edit'; index: number }
      | { kind: 'add' }
      | { kind: 'remove' }
      | { kind: 'move' }
      | { kind: 'reset' }
      | { kind: 'cancel' };

    const items: SelectItem<Action>[] = [
      { label: 'Done — keep these stages', value: { kind: 'done' } },
    ];
    stages.forEach((s, i) => {
      items.push({
        label: `Edit stage ${i + 1}: ${s.id}`,
        value: { kind: 'edit', index: i },
        hint: `${s.label} · ${formatMode(s.mode)}`,
      });
    });
    items.push({ label: 'Add a stage', value: { kind: 'add' } });
    if (stages.length > 1) items.push({ label: 'Remove a stage', value: { kind: 'remove' } });
    if (stages.length > 1) items.push({ label: 'Reorder stages', value: { kind: 'move' } });
    items.push({ label: 'Reset to defaults', value: { kind: 'reset' } });
    items.push({ label: 'Cancel wizard', value: { kind: 'cancel' } });

    const action = await select(items, { title: 'Workflow stages' });
    if (!action || action.kind === 'cancel') return undefined;

    if (action.kind === 'done') {
      if (stages.length === 0) {
        console.log(chalk.red('  At least one stage is required.'));
        continue;
      }
      return stages;
    }

    if (action.kind === 'edit') {
      await editStage(stages, action.index);
    } else if (action.kind === 'add') {
      const added = await addStage(stages);
      if (added) stages.push(added);
    } else if (action.kind === 'remove') {
      const removed = await removeStage(stages);
      if (removed !== undefined) stages.splice(removed, 1);
    } else if (action.kind === 'move') {
      await reorderStages(stages);
    } else if (action.kind === 'reset') {
      if (await confirm('Replace current stages with the defaults?')) {
        stages.splice(0, stages.length, ...cloneStages(DEFAULT_STAGES));
      }
    }
  }
}

async function addStage(stages: StageDefinition[]): Promise<StageDefinition | undefined> {
  const id = (await readLine(chalk.cyan('  new stage id: '))).trim();
  if (!id || !/^[a-z0-9-]+$/.test(id)) {
    console.log(chalk.red('  id must be lowercase a-z, 0-9, hyphens'));
    return undefined;
  }
  if (stages.some((s) => s.id === id)) {
    console.log(chalk.red(`  id "${id}" already exists`));
    return undefined;
  }
  const label = (await readLine(chalk.cyan(`  label [harnext:${id}]: `))).trim() || `harnext:${id}`;
  const labelErr = validateStageLabel(label, stages);
  if (labelErr) {
    console.log(chalk.red(`  ${labelErr}`));
    return undefined;
  }
  const mode = await pickStageMode('human-approval');
  if (!mode) return undefined;
  const prompt = await editPrompt('', {
    title: `Prompt for new stage "${id}"`,
    allowEmpty: false,
  });
  if (!prompt) {
    console.log(chalk.red('  prompt cannot be empty'));
    return undefined;
  }
  return { id, label, mode, prompt };
}

async function removeStage(stages: StageDefinition[]): Promise<number | undefined> {
  const items: SelectItem<number>[] = stages.map((s, i) => ({
    label: `${i + 1}. ${s.id}`,
    value: i,
    hint: s.label,
  }));
  const idx = await select(items, { title: 'Remove which stage?' });
  if (idx === undefined) return undefined;
  if (!(await confirm(`Remove stage "${stages[idx].id}"?`))) return undefined;
  return idx;
}

async function reorderStages(stages: StageDefinition[]): Promise<void> {
  console.log(chalk.dim('  Pick the stage to move, then pick its new position.'));
  const pickItems: SelectItem<number>[] = stages.map((s, i) => ({
    label: `${i + 1}. ${s.id}`,
    value: i,
    hint: s.label,
  }));
  const from = await select(pickItems, { title: 'Move which stage?' });
  if (from === undefined) return;
  const posItems: SelectItem<number>[] = stages.map((_, i) => ({
    label: `Position ${i + 1}`,
    value: i,
  }));
  const to = await select(posItems, { title: 'Move to which position?' });
  if (to === undefined) return;
  if (from === to) return;
  const [moved] = stages.splice(from, 1);
  stages.splice(to, 0, moved);
}

export interface ConnectGithubOptions {
  cwd: string;
  /** Absolute path to the harnext CLI entrypoint (process.argv[1]). */
  cliPath: string;
  /** Absolute path to the node binary (process.execPath). */
  nodePath: string;
}

/**
 * Top-level /connect-github entry point. Caller must have paused its sticky
 * input so readline/select own stdin.
 */
export async function runConnectGithubCommand(opts: ConnectGithubOptions): Promise<void> {
  const existing = loadGithubConnection(opts.cwd);

  console.log();
  if (!existing) {
    console.log(chalk.bold('  GitHub connection: not configured for this project.'));
    console.log();
    await createFlow(opts);
    return;
  }

  console.log(chalk.bold('  GitHub connection for this project:'));
  printConfig(existing);
  console.log();

  type TopAction =
    | { kind: 'view' }
    | { kind: 'edit' }
    | { kind: 'remove' }
    | { kind: 'cancel' };

  const items: SelectItem<TopAction>[] = [
    { label: 'View full config', value: { kind: 'view' }, hint: 'print the agent prompt and filter' },
    { label: 'Edit', value: { kind: 'edit' }, hint: 're-run the wizard with current values as defaults' },
    { label: 'Remove', value: { kind: 'remove' }, hint: 'delete this project\'s github.json' },
    { label: 'Cancel', value: { kind: 'cancel' } },
  ];

  const action = await select(items, { title: 'What do you want to do?' });
  if (!action || action.kind === 'cancel') {
    console.log(chalk.dim('  Cancelled.'));
    console.log();
    return;
  }

  switch (action.kind) {
    case 'view':
      viewFlow(existing);
      return;
    case 'edit':
      await createFlow(opts, existing);
      return;
    case 'remove':
      await removeFlow(opts);
      return;
  }
}

function printConfig(cfg: GithubConnectionConfig): void {
  console.log(chalk.dim(`    repo:     `) + chalk.cyan(cfg.repo));
  console.log(chalk.dim(`    interval: `) + formatInterval(cfg.pollIntervalMinutes));
  console.log(chalk.dim(`    filter:   `) + formatFilter(cfg.filter));
  console.log(
    chalk.dim(`    stages:   `) +
      `${cfg.stages.length} (${cfg.stages.map((s) => s.id).join(' → ')})`,
  );
  if (cfg.lastSeenUpdatedAt) {
    console.log(chalk.dim(`    pointer:  `) + cfg.lastSeenUpdatedAt);
  }
}

function viewFlow(cfg: GithubConnectionConfig): void {
  console.log();
  printConfig(cfg);
  console.log();
  console.log(chalk.bold('  Stages:'));
  renderStagesTable(cfg.stages);
  console.log();
  for (const stage of cfg.stages) {
    console.log(chalk.bold(`  Stage "${stage.id}" prompt:`));
    for (const line of stage.prompt.split('\n')) {
      console.log(`    ${line}`);
    }
    console.log();
  }
}

async function removeFlow(opts: ConnectGithubOptions): Promise<void> {
  if (!(await confirm('Remove the GitHub connection for this project?'))) {
    console.log(chalk.dim('  Cancelled.'));
    console.log();
    return;
  }
  const tag = getGithubPollCronTag(opts.cwd);
  try {
    removeCronLine(tag);
  } catch (err) {
    console.log(
      chalk.red('  Failed to update crontab: ') +
        (err instanceof Error ? err.message : String(err)),
    );
  }
  const removed = deleteGithubConnection(opts.cwd);
  if (removed) {
    console.log(chalk.green('  GitHub connection removed.'));
  } else {
    console.log(chalk.yellow('  No config file found to remove.'));
  }
  console.log();
}

/**
 * Create (or edit) flow. When `current` is passed, its values are used as
 * defaults so the user can keep fields unchanged by accepting the default.
 */
async function createFlow(
  opts: ConnectGithubOptions,
  current?: GithubConnectionConfig,
): Promise<void> {
  // Step 1: verify gh auth.
  console.log(chalk.bold('  Step 1/4: verify gh CLI'));
  const auth = verifyGhAuth();
  if (!auth.ok) {
    console.log(chalk.red('  gh is not ready: ') + auth.message);
    console.log(chalk.dim('  Install the GitHub CLI (https://cli.github.com) and run `gh auth login`.'));
    console.log();
    return;
  }
  console.log(
    chalk.green('  gh authenticated as ') +
      chalk.cyan(auth.value.username) +
      chalk.dim(` on ${auth.value.host}`),
  );
  console.log();

  // Step 1b: resolve & confirm repo from cwd.
  const repoResult = getRepoFromCwd(opts.cwd);
  if (!repoResult.ok) {
    console.log(chalk.red('  Could not detect a GitHub repo in the current directory.'));
    console.log(chalk.dim(`    ${repoResult.message}`));
    console.log(chalk.dim('  Run /connect-github from inside a git repo with a GitHub remote.'));
    console.log();
    return;
  }
  const detectedRepo = repoResult.value;
  const repoLabel = current && current.repo !== detectedRepo
    ? `${detectedRepo} (previously: ${current.repo})`
    : detectedRepo;
  console.log(chalk.bold('  Detected repo: ') + chalk.cyan(repoLabel));
  if (!(await confirm(`Connect this project to ${detectedRepo}?`, true))) {
    console.log(chalk.dim('  Cancelled.'));
    console.log();
    return;
  }
  console.log();

  // Step 2: polling interval.
  console.log(chalk.bold('  Step 2/4: polling interval'));
  const interval = await pickInterval(current?.pollIntervalMinutes);
  if (!interval) {
    console.log(chalk.dim('  Cancelled.'));
    console.log();
    return;
  }
  console.log();

  // Step 3: filter.
  console.log(chalk.bold('  Step 3/4: issue filter (optional)'));
  const filter = await pickFilter(detectedRepo, current?.filter);
  if (!filter) {
    console.log(chalk.dim('  Cancelled.'));
    console.log();
    return;
  }
  console.log();

  // Step 4: workflow stages.
  console.log(chalk.bold('  Step 4/4: workflow stages'));
  console.log(
    chalk.dim('    Each stage has its own prompt and mode. Accept defaults or customize.'),
  );
  const stages = await runStagesStep(current?.stages);
  if (!stages) {
    console.log(chalk.dim('  Cancelled.'));
    console.log();
    return;
  }
  console.log();

  const cfg: GithubConnectionConfig = {
    repo: detectedRepo,
    pollIntervalMinutes: interval,
    filter,
    stages,
    lastSeenUpdatedAt: current?.lastSeenUpdatedAt,
    updatedAt: Date.now(),
  };

  const schedule = buildCronSchedule(cfg.pollIntervalMinutes);
  const tag = getGithubPollCronTag(opts.cwd);
  const cronLine = buildGithubPollCronLine({
    schedule,
    cliPath: opts.cliPath,
    cwd: opts.cwd,
    tag,
    nodePath: opts.nodePath,
    path: process.env.PATH,
  });
  const existingCron = findCronLine(tag);

  console.log(chalk.bold('  Ready to save:'));
  printConfig(cfg);
  console.log();
  console.log(chalk.dim(`    cron ${existingCron ? '(replace)' : '(install)'}:`));
  console.log(chalk.dim(`      ${cronLine}`));
  console.log();

  if (!(await confirm('Save this connection and install the cron line?', true))) {
    console.log(chalk.dim('  Cancelled.'));
    console.log();
    return;
  }

  try {
    saveGithubConnection(opts.cwd, cfg);
    installCronLine(cronLine, tag);

    console.log(chalk.dim('  Ensuring pipeline labels exist on the repo…'));
    const labelResult = ensureRepoLabels(cfg.repo, buildHarnextLabelSpecs(cfg.stages));
    if (labelResult.created.length > 0) {
      console.log(chalk.green(`    created: ${labelResult.created.join(', ')}`));
    }
    if (labelResult.existed.length > 0) {
      console.log(chalk.dim(`    existed: ${labelResult.existed.join(', ')}`));
    }
    if (labelResult.failed.length > 0) {
      console.log(chalk.yellow('    failed:'));
      for (const f of labelResult.failed) {
        console.log(chalk.yellow(`      ${f.name}: ${f.message}`));
      }
      console.log(
        chalk.dim('    (labels that failed can be created manually later with `gh label create`)'),
      );
    }

    console.log(chalk.green('  GitHub connection saved and poller scheduled.'));
    console.log(chalk.dim(`    config: ${getGithubConfigPath(opts.cwd)}`));
    console.log(chalk.dim(`    cron tag: ${tag}`));
    console.log();
  } catch (err) {
    console.log(
      chalk.red('  Failed to save config: ') +
        (err instanceof Error ? err.message : String(err)),
    );
    console.log(chalk.dim('  If this machine has no `crontab`, install cron first.'));
    console.log();
  }
}

async function pickInterval(
  current?: GithubPollIntervalMinutes,
): Promise<GithubPollIntervalMinutes | undefined> {
  const items: SelectItem<GithubPollIntervalMinutes>[] = GITHUB_POLL_INTERVAL_PRESETS.map((m) => ({
    label: formatInterval(m),
    value: m,
    hint: current === m ? 'current' : `${m} min`,
  }));
  return select(items, { title: 'Pick how often to poll for new tasks (esc to cancel)' });
}

async function pickFilter(
  repo: string,
  current?: GithubIssueFilter,
): Promise<GithubIssueFilter | undefined> {
  type Action =
    | { kind: 'none' }
    | { kind: 'label' }
    | { kind: 'assignee' }
    | { kind: 'cancel' };

  const hintFor = (kind: GithubIssueFilter['kind']): string | undefined =>
    current?.kind === kind ? 'current' : undefined;

  const items: SelectItem<Action>[] = [
    { label: 'No filter', value: { kind: 'none' }, hint: hintFor('none') ?? 'pick up any open issue' },
    { label: 'By label', value: { kind: 'label' }, hint: hintFor('label') ?? 'only issues with a specific label' },
    { label: 'By assignee', value: { kind: 'assignee' }, hint: hintFor('assignee') ?? 'only issues assigned to a specific user' },
    { label: 'Cancel', value: { kind: 'cancel' } },
  ];
  const action = await select(items, { title: 'Filter issues' });
  if (!action || action.kind === 'cancel') return undefined;

  if (action.kind === 'none') return { kind: 'none' };

  if (action.kind === 'label') {
    const result = listRepoLabels(repo);
    if (!result.ok) {
      console.log(chalk.red('  Could not fetch labels: ') + result.message);
      return undefined;
    }
    if (result.value.length === 0) {
      console.log(chalk.yellow('  This repo has no labels defined.'));
      return undefined;
    }
    const currentLabel = current?.kind === 'label' ? current.label : undefined;
    const labelItems: SelectItem<string>[] = result.value.map((lbl) => ({
      label: lbl.name,
      value: lbl.name,
      hint: currentLabel === lbl.name ? 'current' : (lbl.description || undefined),
    }));
    const picked = await select(labelItems, { title: `Pick a label (${result.value.length} available)` });
    if (!picked) return undefined;
    return { kind: 'label', label: picked };
  }

  // assignee
  const users = listRepoAssignableUsers(repo);
  if (!users.ok) {
    console.log(chalk.yellow('  Could not fetch assignable users: ') + users.message);
    return fallbackAssigneeEntry(current);
  }
  if (users.value.length === 0) {
    console.log(chalk.yellow('  No assignable users returned — type a login manually.'));
    return fallbackAssigneeEntry(current);
  }
  const currentAssignee = current?.kind === 'assignee' ? current.assignee : undefined;
  const userItems: SelectItem<string>[] = users.value.map((login) => ({
    label: login,
    value: login,
    hint: currentAssignee === login ? 'current' : undefined,
  }));
  userItems.push({ label: 'Type a login manually…', value: '__manual__' });
  const picked = await select(userItems, { title: `Pick an assignee (${users.value.length} users)` });
  if (!picked) return undefined;
  if (picked === '__manual__') return fallbackAssigneeEntry(current);
  return { kind: 'assignee', assignee: picked };
}

async function fallbackAssigneeEntry(
  current?: GithubIssueFilter,
): Promise<GithubIssueFilter | undefined> {
  const def = current?.kind === 'assignee' ? current.assignee : '';
  const answer = (await readLine(chalk.cyan(`  assignee login${def ? ` [${def}]` : ''}: `))).trim();
  const login = answer || def;
  if (!login) return undefined;
  return { kind: 'assignee', assignee: login };
}

// re-exports for callers that only want the wizard entry point
export type { GhResult };
