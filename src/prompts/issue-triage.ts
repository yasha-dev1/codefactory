import type { DetectionResult, UserPreferences } from './types.js';

/**
 * Prompt for generating the issue-triage agent workflow and supporting scripts.
 */
export function buildIssueTriagePrompt(detection: DetectionResult, prefs: UserPreferences): string {
  return `Generate an issue-triage agent system for this ${detection.primaryLanguage} project. When a new issue is opened or edited, the system evaluates it for quality and completeness, then routes actionable issues to the implementation pipeline by adding the \`agent:implement\` label.

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

### 1. ${prefs.ciProvider === 'github-actions' ? '.github/workflows/issue-triage.yml' : prefs.ciProvider === 'gitlab-ci' ? '.gitlab/ci/issue-triage.yml' : 'bitbucket-pipelines-issue-triage.yml'}

A CI workflow triggered when a new issue is opened or an existing issue is edited.

**Trigger**:
${
  prefs.ciProvider === 'github-actions'
    ? `\`\`\`yaml
on:
  issues:
    types: [opened, edited]
\`\`\`

The workflow runs on every issue open and edit event. The guard script determines whether triage should proceed.`
    : prefs.ciProvider === 'gitlab-ci'
      ? 'Trigger via webhook on issue creation or update. Use a CI job that runs the triage guard first.'
      : 'Trigger via webhook on issue creation or update. Use a pipeline that runs the triage guard first.'
}

**Permissions** (${prefs.ciProvider === 'github-actions' ? 'GitHub Actions' : prefs.ciProvider}):
- issues: write (to add labels and comments)
- contents: read (to read repo context)

**Workflow steps**:

1. **Gate check** (via guard script):
   - Skip if the issue author is a bot (check \`github.actor\` ends with \`[bot]\` or is in known bot list)
   - Skip if the issue already has any triage result label (\`agent:implement\`, \`needs-more-info\`, \`needs-human-review\`, \`triage:failed\`)
   - Skip if the event is actually a pull request (issues API can include PRs)
   - On \`edited\` events: only re-triage if the issue currently has \`needs-more-info\` label (author updated after feedback)
   - Output a JSON decision for the workflow to consume

2. **Label setup**:
   - Ensure these labels exist in the repo (create if missing):
     - \`needs-more-info\` (color: \`#d93f0b\`) — issue lacks required details
     - \`agent:implement\` (color: \`#0e8a16\`) — issue is ready for implementation agent
     - \`triage:failed\` (color: \`#b60205\`) — triage process errored
     - \`needs-human-review\` (color: \`#fbca04\`) — issue needs manual assessment

3. **Claude triage analysis**:
   - Invoke Claude Code with the triage prompt (see below)
   - Pass the full issue title and body as context
   - The agent evaluates the issue against quality criteria:
     - **Clear description**: Does the issue clearly describe what is needed?
     - **Reproducibility** (bugs): Are steps to reproduce provided?
     - **Acceptance criteria**: Are success conditions defined or inferable?
     - **Scope**: Is the scope reasonable for a single implementation?
   - The agent must return a JSON verdict:
     \`\`\`json
     {
       "actionable": true/false,
       "confidence": 0.0-1.0,
       "missingInfo": ["list of missing details"],
       "summary": "one-line summary of the issue",
       "suggestedLabels": ["bug", "enhancement", etc.],
       "estimatedComplexity": "low" | "medium" | "high"
     }
     \`\`\`

4. **Decision routing**:
   - If \`actionable === true\` AND \`confidence >= ${prefs.strictnessLevel === 'strict' ? '0.8' : prefs.strictnessLevel === 'standard' ? '0.7' : '0.6'}\`:
     - Add the \`agent:implement\` label (triggers the issue-implementer workflow)
     - Add any \`suggestedLabels\` that exist in the repo
     - Post a comment: "Triage complete — this issue is actionable and has been queued for implementation. Complexity: <estimatedComplexity>. Summary: <summary>"
   - If \`actionable === false\` OR confidence is below threshold:
     - Add the \`needs-more-info\` label
     - Post a comment @mentioning the issue author with specific missing information:
       "Thanks for opening this issue. Before we can proceed, could you provide: <missingInfo list>. Once updated, this issue will be automatically re-triaged."
   - If \`estimatedComplexity === "high"\` or the issue references critical paths:
     - Also add \`needs-human-review\` label
     - Append to the comment: "Note: This issue has been flagged for human review due to its complexity."

5. **Failure handling**:
   - If the triage agent crashes or times out:
     - Add the \`triage:failed\` label
     - Post a comment: "Automated triage encountered an error. A maintainer will review this issue manually."
   - Never leave the issue without a status label after triage runs

**Concurrency**: Use a concurrency group keyed on the issue number to prevent duplicate triage runs:
\`\`\`yaml
concurrency:
  group: issue-triage-$\{{ github.event.issue.number }}
  cancel-in-progress: true
\`\`\`

**Strictness behavior**:
${prefs.strictnessLevel === 'strict' ? '- Confidence threshold: 0.8\n- High complexity issues always require human review\n- Issues touching critical paths always require human review\n- Re-triage on edit only if `needs-more-info` label is present' : prefs.strictnessLevel === 'standard' ? '- Confidence threshold: 0.7\n- High complexity issues get flagged for human review\n- Re-triage on edit only if `needs-more-info` label is present' : '- Confidence threshold: 0.6\n- Only critical-path issues get flagged for human review\n- Re-triage on any edit event'}

### 2. Triage prompt

The triage agent's evaluation prompt is stored at \`.codefactory/prompts/issue-triage.md\` in the repository. This file is managed by the CodeFactory CLI and can be customized by the team.

**The workflow must read this file at runtime** and pass its contents to Claude as the system prompt. For example in a GitHub Actions step:
\`\`\`yaml
- name: Read triage prompt
  id: prompt
  run: echo "content=$(cat .codefactory/prompts/issue-triage.md)" >> "$GITHUB_OUTPUT"
\`\`\`

Do NOT generate a separate \`scripts/issue-triage-prompt.md\` file. The prompt lives in \`.codefactory/prompts/issue-triage.md\` and is the single source of truth.

### 3. scripts/issue-triage-guard.ts

A utility script that determines whether triage should run for this event:

\`\`\`typescript
interface TriageDecision {
  shouldTriage: boolean;
  issueNumber: number;
  issueTitle: string;
  reason: string;
  isRetriage: boolean;  // true if this is a re-triage after author updated the issue
  skipReason: string | null;  // non-null if shouldTriage is false
}
\`\`\`

The script:
- Reads the issue event payload from \`GITHUB_EVENT_PATH\`
- Checks if the issue author is a bot (skip if so)
- Checks if the issue already has triage result labels (\`agent:implement\`, \`needs-more-info\`, \`needs-human-review\`, \`triage:failed\`)
- For \`edited\` events: only proceed if \`needs-more-info\` label is present (re-triage scenario)
- Checks if the event is actually a pull request (skip if \`pull_request\` field exists)
- Returns a JSON decision object for the workflow to consume

## Safety Constraints

- The triage agent is read-only with respect to code — it NEVER modifies repository files
- It only interacts via the GitHub Issues API (labels and comments)
- All comments must be clearly attributed to the triage bot
- Never auto-close issues — only label and comment
- Rate-limit protection: the concurrency group prevents duplicate runs
- Timeout: set a hard timeout of 5 minutes for the triage workflow

## Quality Requirements

- All workflows should use \`actions/github-script@v7\` for GitHub API interactions (if GitHub Actions)
- Pin all action versions to specific SHAs or major versions for security
- Include proper error handling and clear logging at each step
- Set appropriate timeout-minutes for the workflow (5 minutes for triage)
- Use concurrency groups to prevent parallel runs on the same issue

## Output Format

Return the complete file contents for each file, separated by a comment line with the target file path. All YAML must be valid. All scripts must be executable. Do not wrap in markdown code fences.`;
}
