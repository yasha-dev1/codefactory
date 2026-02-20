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
- id-token: write (required for Claude Code Action OAuth)

**Workflow steps**:

1. **Gate check**:
   - Verify the issue has the \`agent:implement\` label
   - Skip if the issue already has a linked PR (check for \`<!-- issue-implementer: #<issue> -->\` marker in PR body)
   - Skip if the issue has the \`agent:skip\` or \`wontfix\` label
   - Post a comment on the issue: "🤖 Implementation agent starting..."

2. **Baseline validation**:
   - Before creating a branch, run quality gates on the default branch HEAD to record the starting state:
     - \`${detection.lintCommand ?? 'echo "no linter"'}\`
     ${detection.typeChecker ? `- Type check: \`${detection.typeChecker === 'typescript' ? 'tsc --noEmit' : detection.typeChecker + ' --check .'}\`` : ''}
     - \`${detection.testCommand ?? 'echo "no tests"'}\`
   - Record which checks pass and which fail as the baseline
   - If the baseline is already broken, note this in the issue comment and proceed — the agent must not introduce additional failures, but is not responsible for pre-existing ones

3. **Branch creation**:
   - Derive a branch name from the issue: \`cf/<slugified-issue-title>-<issue-number>\`
   - Truncate the slug to keep branch name under 60 characters
   - Create a new git worktree (or branch) from the default branch HEAD

4. **Agent execution**:
   - Invoke Claude Code using \`anthropics/claude-code-action@v1\` with \`claude_code_oauth_token: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}\` (NOT \`ANTHROPIC_API_KEY\`)
   - Pass the implementer prompt and full issue body via the action's \`prompt\` input
   - The agent reads CLAUDE.md and harness.config.json for project conventions
   - Allow tools: Read, Write, Edit, Bash (with safety constraints), Glob, Grep
   - Set a timeout of ${prefs.strictnessLevel === 'strict' ? '30' : prefs.strictnessLevel === 'standard' ? '45' : '60'} minutes

5. **Quality gate loop** (detect → remediate → re-validate):
   - After the agent finishes, run all quality gates:
     - \`${detection.lintCommand ?? 'echo "no linter"'}\`
     ${detection.typeChecker ? `- Type check: \`${detection.typeChecker === 'typescript' ? 'tsc --noEmit' : detection.typeChecker + ' --check .'}\`` : ''}
     - \`${detection.testCommand ?? 'echo "no tests"'}\`
     ${detection.buildCommand ? `- Build: \`${detection.buildCommand}\`` : ''}
   - If any gate fails, do NOT stop — invoke the agent again with the specific failure output and ask it to diagnose and fix the root cause
   - Re-validate after each fix attempt
   - Allow up to ${prefs.strictnessLevel === 'strict' ? '2' : prefs.strictnessLevel === 'standard' ? '3' : '5'} remediation attempts before escalating
   - Each remediation attempt should fix a concrete failure, not retry blindly

6. **PR creation**:
   - Commit all changes with: \`feat: implement #<issue-number> — <issue-title>\`
   - Push the branch
   - Create a pull request:
     - Title: the issue title
     - Body: summary of changes + baseline validation results + \`Closes #<issue-number>\` + \`<!-- issue-implementer: #<issue-number> -->\`
     - Labels: \`agent-pr\`, plus the issue's labels
     - Link the PR to the issue
   - Comment on the issue: "✅ PR created: #<pr-number>"

7. **Escalation (judgment required only)**:
   - Escalate to human ONLY when a genuine judgment call is required:
     - A security decision with meaningful risk implications (e.g., auth flow changes, secret handling)
     - A Tier 3 (critical path) file was modified and requires mandatory human sign-off
     - All remediation attempts are exhausted and the failure cannot be diagnosed or the correct fix is ambiguous
   - When escalating: post a structured comment with exactly what was tried, what specific failure remains, and what decision is needed from a human
   - Add the \`agent:needs-judgment\` label (not a generic failure label) to signal this is a deliberate escalation
   - Never escalate on ordinary lint, type, or test failures — these are diagnosable and fixable autonomously

**Concurrency**: Use a concurrency group keyed on the issue number to prevent duplicate runs:
\`\`\`yaml
concurrency:
  group: issue-implementer-$\{{ github.event.issue.number }}
  cancel-in-progress: true
\`\`\`

**Strictness behavior**:
${prefs.strictnessLevel === 'strict' ? '- Agent must pass ALL quality gates (lint, type-check, test, build) before creating a PR\n- If any Tier 3 (critical path) file is modified, add the `needs-human-review` label to the PR and escalate for sign-off\n- Maximum 2 remediation attempts in the quality gate loop before escalating' : prefs.strictnessLevel === 'standard' ? '- Agent must pass lint and type-check gates. Test failures enter the detect→remediate loop.\n- Modified critical paths get flagged in the PR description\n- Maximum 3 remediation attempts in the quality gate loop before escalating' : '- Agent runs quality gates but can create a PR with documented warnings if gates cannot be resolved\n- Failures are recorded in the PR description with diagnosis notes\n- Maximum 5 remediation attempts in the quality gate loop before escalating'}

### 2. Implementer prompt

The implementer agent's instructions are stored at \`.codefactory/prompts/issue-implementer.md\` in the repository. This file is managed by the CodeFactory CLI and can be customized by the team.

**The workflow must read this file at runtime** and pass its contents to Claude as the system prompt. For example in a GitHub Actions step:
\`\`\`yaml
- name: Read implementer prompt
  id: prompt
  run: echo "content=$(cat .codefactory/prompts/issue-implementer.md)" >> "$GITHUB_OUTPUT"
\`\`\`

Do NOT generate a separate \`scripts/issue-implementer-prompt.md\` file. The prompt lives in \`.codefactory/prompts/issue-implementer.md\` and is the single source of truth.

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
