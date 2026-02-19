import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface AgentSystemPromptOptions {
  branchName: string;
  repoRoot: string;
  harnessCommands: {
    test: string;
    build: string;
    lint: string;
    typeCheck: string;
  } | null;
}

const DEFAULT_TEMPLATE = `# CodeFactory Agent Session

You are working in a git worktree on branch \`{{branchName}}\`.
Your task is described in the first message. Execute it fully.

## Execution Strategy

SPEED FIRST:
- Start coding immediately. Do not ask clarifying questions unless genuinely ambiguous.
- Read CLAUDE.md first for project conventions.
- Make informed decisions rather than asking. Adjust later if needed.

PARALLELIZATION:
- For tasks with 3+ independent subtasks, use TeamCreate and Task tool to spawn parallel agents.
- Each agent should own a clear, non-overlapping piece of work.
- Coordinate via the task list. Do not duplicate effort.
- Example: feature with API + UI + tests → spawn agents for each.

## Harness Compliance

This project uses harness engineering:
- Read CLAUDE.md for all project conventions.
- Respect architectural boundaries in harness.config.json.
- Changes to Tier 3 (critical) paths require extra test coverage.
- Never disable linters, type checking, or test suites.
- Do not refactor code unrelated to your task.

## Quality Gates

Before finishing, run ALL of these and fix any failures:
{{qualityGates}}

## Git Workflow

You are on branch \`{{branchName}}\`. All commits go here.
- Use conventional commits: feat:, fix:, refactor:, test:, chore:, docs:
- Make atomic commits as you work.

## When You Are Done

After all quality gates pass:
1. Push the branch: \`git push -u origin {{branchName}}\`
2. Create a PR: \`gh pr create --title "<short task summary>" --body "<summary of changes, files modified, test results>"\`
3. Print the PR URL so the user can see it.`;

function buildQualityGates(
  commands: AgentSystemPromptOptions['harnessCommands'],
): string {
  if (!commands) {
    return '- Check package.json for available scripts (test, lint, build, typecheck)';
  }

  const gates: string[] = [];
  let i = 1;

  if (commands.lint) {
    gates.push(`${i}. \`${commands.lint}\``);
    i++;
  }
  if (commands.typeCheck) {
    gates.push(`${i}. \`${commands.typeCheck}\``);
    i++;
  }
  if (commands.test) {
    gates.push(`${i}. \`${commands.test}\``);
    i++;
  }
  if (commands.build) {
    gates.push(`${i}. \`${commands.build}\``);
    i++;
  }

  return gates.length > 0
    ? gates.join('\n')
    : '- Check package.json for available scripts (test, lint, build, typecheck)';
}

export async function buildAgentSystemPrompt(
  options: AgentSystemPromptOptions,
): Promise<string> {
  const { branchName, repoRoot, harnessCommands } = options;

  let template: string;
  try {
    template = await readFile(join(repoRoot, '.claude', 'leader_prompt.md'), 'utf-8');
  } catch {
    template = DEFAULT_TEMPLATE;
  }

  const qualityGates = buildQualityGates(harnessCommands);

  return template
    .replace(/\{\{branchName\}\}/g, branchName)
    .replace(/\{\{qualityGates\}\}/g, qualityGates);
}
