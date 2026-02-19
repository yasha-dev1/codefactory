import type { DetectionResult, UserPreferences } from './types.js';

/**
 * Prompt for generating the issue-implementer agent workflow and supporting scripts.
 */
export function buildIssueImplementerPrompt(
  detection: DetectionResult,
  prefs: UserPreferences,
): string {
  return `Generate an issue-implementer agent system for this ${detection.primaryLanguage} project. When a new issue is opened (or labeled with a trigger label), the system spawns a Claude Code agent that reads the issue, creates a worktree branch, implements the change, and opens a pull request.

## Detected Stack Context

- **Language**: ${detection.primaryLanguage}
- **Framework**: ${detection.framework ?? 'none'}
- **CI Provider**: ${prefs.ciProvider}
- **Strictness**: ${prefs.strictnessLevel}
- **Test Command**: \`${detection.testCommand ?? 'not detected'}\`
- **Lint Command**: \`${detection.lintCommand ?? 'not detected'}\`
- **Build Command**: \`${detection.buildCommand ?? 'not detected'}\`
- **Type Checker**: ${detection.typeChecker ?? 'none'}
- **Package Manager**: ${detection.packageManager ?? 'npm'}
- **Monorepo**: ${detection.monorepo}
- **Architectural Layers**: ${detection.architecturalLayers.join(', ') || 'none'}
- **Has UI Components**: ${detection.hasUIComponents}
- **Critical Paths**: ${detection.criticalPaths.length > 0 ? detection.criticalPaths.join(', ') : 'none detected'}

## Files to Generate

### 1. ${prefs.ciProvider === 'github-actions' ? '.github/workflows/issue-implementer.yml' : prefs.ciProvider === 'gitlab-ci' ? '.gitlab/ci/issue-implementer.yml' : 'bitbucket-pipelines-issue-implementer.yml'}

A CI workflow triggered when a new issue is opened or labeled with the trigger label \`agent:implement\`.

**Trigger**:
${
  prefs.ciProvider === 'github-actions'
    ? `\`\`\`yaml
on:
  issues:
    types: [opened, labeled]
\`\`\`

The workflow must check that either:
- The issue was just opened AND has the \`agent:implement\` label, OR
- The \`agent:implement\` label was just added (labeled event)

If neither condition is met, skip execution.`
    : prefs.ciProvider === 'gitlab-ci'
      ? 'Trigger via webhook on issue creation or label change. Use a CI job that checks for the `agent:implement` label.'
      : 'Trigger via webhook on issue creation. Use a pipeline that checks for the `agent:implement` label.'
}

**Permissions** (${prefs.ciProvider === 'github-actions' ? 'GitHub Actions' : prefs.ciProvider}):
- contents: write (to push branches)
- pull-requests: write (to create PRs)
- issues: write (to comment status updates on the issue)

**Workflow steps**:

1. **Gate check**:
   - Verify the issue has the \`agent:implement\` label
   - Skip if the issue already has a linked PR (check for \`<!-- issue-implementer: #<issue> -->\` marker in PR body)
   - Skip if the issue has the \`agent:skip\` or \`wontfix\` label
   - Post a comment on the issue: "🤖 Implementation agent starting..."

2. **Branch creation**:
   - Derive a branch name from the issue: \`cf/<slugified-issue-title>-<issue-number>\`
   - Truncate the slug to keep branch name under 60 characters
   - Create a new git worktree (or branch) from the default branch HEAD

3. **Agent execution**:
   - Invoke Claude Code with the implementer prompt (see below)
   - Pass the full issue body as context
   - The agent reads CLAUDE.md and harness.config.json for project conventions
   - Allow tools: Read, Write, Edit, Bash (with safety constraints), Glob, Grep
   - Set a timeout of ${prefs.strictnessLevel === 'strict' ? '30' : prefs.strictnessLevel === 'standard' ? '45' : '60'} minutes

4. **Quality gates**:
   - After the agent finishes, run validation:
     - \`${detection.lintCommand ?? 'echo "no linter"'}\`
     ${detection.typeChecker ? `- Type check: \`${detection.typeChecker === 'typescript' ? 'tsc --noEmit' : detection.typeChecker + ' --check .'}\`` : ''}
     - \`${detection.testCommand ?? 'echo "no tests"'}\`
     ${detection.buildCommand ? `- Build: \`${detection.buildCommand}\`` : ''}
   - If any gate fails, the agent gets one retry attempt to fix the failures
   - If still failing after retry, post a comment on the issue with the failure details and add the \`agent:needs-help\` label

5. **PR creation**:
   - Commit all changes with: \`feat: implement #<issue-number> — <issue-title>\`
   - Push the branch
   - Create a pull request:
     - Title: the issue title
     - Body: summary of changes + \`Closes #<issue-number>\` + \`<!-- issue-implementer: #<issue-number> -->\`
     - Labels: \`agent-pr\`, plus the issue's labels
     - Link the PR to the issue
   - Comment on the issue: "✅ PR created: #<pr-number>"

6. **Failure handling**:
   - If the agent crashes or times out, comment on the issue: "❌ Agent failed: <reason>"
   - Add the \`agent:failed\` label to the issue
   - Never leave the issue in an ambiguous state — always post a status comment

**Concurrency**: Use a concurrency group keyed on the issue number to prevent duplicate runs:
\`\`\`yaml
concurrency:
  group: issue-implementer-$\{{ github.event.issue.number }}
  cancel-in-progress: true
\`\`\`

**Strictness behavior**:
${prefs.strictnessLevel === 'strict' ? '- Agent must pass ALL quality gates (lint, type-check, test, build) before creating a PR\n- If any critical path (Tier 3) is modified, add the `needs-human-review` label to the PR\n- Maximum 1 retry attempt on gate failure' : prefs.strictnessLevel === 'standard' ? '- Agent must pass lint and type-check gates. Test failures trigger a retry.\n- Modified critical paths get flagged in the PR description\n- Maximum 2 retry attempts on gate failure' : '- Agent should attempt quality gates but can create a PR with warnings\n- Failures are noted in the PR description rather than blocking\n- Maximum 3 retry attempts on gate failure'}

### 2. scripts/issue-implementer-prompt.md

A pinned markdown prompt that the implementer agent uses as its system context:

\`\`\`markdown
# Issue Implementer Agent Instructions

You are an implementation agent. Your task is to implement a feature or fix described in a GitHub issue.

## Rules

1. **Read first**: Before writing any code, read CLAUDE.md for project conventions and harness.config.json for architectural boundaries.
2. **Understand the issue**: Parse the issue title and body to understand what needs to be built. If the issue includes acceptance criteria, treat them as your definition of done.
3. **Plan before coding**: Think through the implementation approach. Identify which files need to change and what new files are needed.
4. **Follow conventions**: Match the existing code style, naming conventions, import patterns, and architectural boundaries.
5. **Write tests**: Add or update tests for your changes. Follow the existing test patterns in the project.
6. **Minimal scope**: Implement ONLY what the issue asks for. Do not refactor unrelated code, add extra features, or "improve" things not mentioned.
7. **Quality gates**: Run all quality gates before finishing:
   - Lint: \`${detection.lintCommand ?? 'check package.json'}\`
   - Type check: \`${detection.typeChecker ? (detection.typeChecker === 'typescript' ? 'tsc --noEmit' : detection.typeChecker + ' --check .') : 'N/A'}\`
   - Test: \`${detection.testCommand ?? 'check package.json'}\`
   ${detection.buildCommand ? `- Build: \`${detection.buildCommand}\`` : ''}
8. **Commit discipline**: Use conventional commits. Make atomic commits as you work.

## Files You Must Never Modify

- CI/CD workflow files (.github/workflows/*, .gitlab-ci.yml, etc.)
- harness.config.json
- CLAUDE.md
- Lock files (package-lock.json, yarn.lock, poetry.lock, etc.)

## Architecture Boundaries

${detection.architecturalLayers.length > 0 ? `This project has these layers: ${detection.architecturalLayers.join(', ')}. Respect import boundaries between layers.` : 'Check harness.config.json for architectural boundary rules.'}

## Critical Paths

${detection.criticalPaths.length > 0 ? `These paths are Tier 3 (critical) and require extra care and test coverage:\n${detection.criticalPaths.map((p) => `- \`${p}\``).join('\n')}` : 'Check harness.config.json for critical path definitions.'}

## Output

When finished, provide a summary:
- Files created
- Files modified
- Tests added/updated
- Quality gate results (pass/fail for each)
\`\`\`

### 3. scripts/issue-implementer-guard.ts

A utility script that determines whether the implementer agent should run:

\`\`\`typescript
interface ImplementerDecision {
  shouldImplement: boolean;
  issueNumber: number;
  issueTitle: string;
  branchName: string;
  reason: string;
  existingPR: number | null;  // non-null if a PR already exists for this issue
  blockedLabels: string[];    // labels that prevent implementation
}
\`\`\`

The script:
- Reads the issue event payload
- Checks for the \`agent:implement\` label
- Checks for blocking labels (\`agent:skip\`, \`wontfix\`, \`duplicate\`, \`invalid\`)
- Searches for existing PRs linked to this issue (via the marker comment)
- Derives the branch name from the issue title
- Returns a JSON decision object for the workflow to consume

## Safety Constraints

- The agent must NEVER modify CI workflow files, harness.config.json, CLAUDE.md, or lock files
- All commits must be clearly attributed to the implementer bot
- The agent operates on a dedicated branch — never pushes to main/default branch
- Set a hard timeout to prevent runaway execution
- If the issue references Tier 3 (critical) paths, flag the PR for human review
- Never auto-merge agent-created PRs — they always go through the full review cycle
- Every implementation action must be logged in issue comments for audit
- The agent must not access secrets or environment variables beyond what the CI provides

## Quality Requirements

- All workflows should use \`actions/github-script@v7\` for GitHub API interactions (if GitHub Actions)
- Pin all action versions to specific SHAs or major versions for security
- Include proper error handling and clear logging at each step
- Set appropriate timeout-minutes for the workflow
- Use concurrency groups to prevent parallel runs on the same issue

## Output Format

Return the complete file contents for each file, separated by a comment line with the target file path. All YAML must be valid. All scripts must be executable. Do not wrap in markdown code fences.`;
}
