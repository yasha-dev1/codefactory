import type { DetectionResult, UserPreferences } from './types.js';

/**
 * Prompt for generating PR templates with risk tier sections.
 */
export function buildPrTemplatesPrompt(
  detection: DetectionResult,
  prefs: UserPreferences,
): string {
  return `Generate pull request templates for this ${detection.primaryLanguage} project. These templates guide both human developers and AI agents to provide complete, risk-aware PR descriptions.

## Detected Stack Context

- **Language**: ${detection.primaryLanguage}
- **Framework**: ${detection.framework ?? 'none'}
- **CI Provider**: ${prefs.ciProvider}
- **Has UI Components**: ${detection.hasUIComponents}
- **Strictness**: ${prefs.strictnessLevel}
- **Test Command**: \`${detection.testCommand ?? 'not detected'}\`
- **Critical Paths**: ${detection.criticalPaths.join(', ') || 'none'}

## Files to Generate

### 1. ${prefs.ciProvider === 'github-actions' ? '.github/PULL_REQUEST_TEMPLATE.md' : prefs.ciProvider === 'gitlab-ci' ? '.gitlab/merge_request_templates/Default.md' : '.bitbucket/PULL_REQUEST_TEMPLATE.md'}

The default PR template for human-authored pull requests. Structure:

\`\`\`markdown
## Summary
<!-- Brief description of what this PR does and why. Link to the issue if applicable. -->

## Risk Tier
<!-- The risk-policy-gate will auto-detect, but manually classify here for reviewer context -->
- [ ] **Tier 1 (Low)**: Documentation, config, comments, minor fixes
- [ ] **Tier 2 (Medium)**: Business logic, new features, refactors, test changes
- [ ] **Tier 3 (High)**: Critical paths (auth, payments, migrations, infrastructure)

## Changes
<!-- What files/components were modified and why? Group by logical concern. -->

### Added
-

### Changed
-

### Removed
-

## Testing
<!-- How were these changes validated? -->
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
${detection.hasUIComponents ? '- [ ] Browser evidence captured (screenshots in .harness/evidence/)' : ''}
- [ ] Manual testing completed
- [ ] Test command passes: \`${detection.testCommand ?? 'not configured'}\`

## Evidence
<!-- Required for Tier 2+. For Tier 3, all evidence types are mandatory. -->
${detection.hasUIComponents ? '- **Screenshots**: <!-- link to browser evidence artifacts or paste inline -->' : ''}
- **Test results**: <!-- paste summary or link to CI run -->
- **Lint results**: <!-- confirm clean: \`${detection.lintCommand ?? 'not configured'}\` -->
${detection.typeChecker ? `- **Type check**: <!-- confirm clean: ${detection.typeChecker} --noEmit -->` : ''}

## Review Checklist
- [ ] Code follows project conventions (see \`docs/conventions.md\`)
- [ ] No security vulnerabilities introduced
- [ ] No secrets, API keys, or credentials committed
- [ ] Documentation updated if public API changed
- [ ] Risk tier accurately reflects the scope of changes
- [ ] Architectural boundaries respected (see \`docs/layers.md\`)
${prefs.strictnessLevel === 'strict' ? '- [ ] All evidence requirements for the risk tier are met' : ''}
\`\`\`

### 2. ${prefs.ciProvider === 'github-actions' ? '.github/PULL_REQUEST_TEMPLATE/agent-pr.md' : prefs.ciProvider === 'gitlab-ci' ? '.gitlab/merge_request_templates/Agent.md' : '.bitbucket/PULL_REQUEST_TEMPLATE_AGENT.md'}

A specialized template for agent-authored PRs (Claude Code, remediation agent, etc.):

\`\`\`markdown
## Agent-Generated PR

**Agent**: <!-- agent name and version (e.g., Claude Code v1.0) -->
**Trigger**: <!-- what triggered this PR: remediation, feature request, scheduled task -->
**Head SHA**: \`<!-- exact commit SHA this PR was generated at -->\`

## Summary
<!-- Auto-generated summary describing all changes -->

## Risk Assessment
- **Detected Risk Tier**: <!-- auto-populated by risk-policy-gate -->
- **Critical paths touched**: <!-- list any files matching critical path patterns -->
- **Confidence level**: <!-- high/medium/low — how confident the agent is in the changes -->

## Changes Made
<!-- Complete list of every file modified, with brief explanation for each -->
| File | Change Type | Description |
|------|-------------|-------------|
| | | |

## Validation Results
| Check | Status | Details |
|-------|--------|---------|
| Lint | <!-- PASS/FAIL --> | \`${detection.lintCommand ?? 'not configured'}\` |
${detection.typeChecker ? `| Type Check | <!-- PASS/FAIL --> | \`${detection.typeChecker} --noEmit\` |` : ''}
| Tests | <!-- PASS/FAIL --> | \`${detection.testCommand ?? 'not configured'}\` |
| Build | <!-- PASS/FAIL --> | \`${detection.buildCommand ?? 'not configured'}\` |
${detection.hasUIComponents ? '| Browser Evidence | <!-- PASS/FAIL --> | Screenshots captured |' : ''}

## Review Agent Status
- [ ] Review agent has analyzed this PR
- [ ] No unresolved blocking findings
- [ ] Review SHA matches current HEAD
- **Verdict**: <!-- APPROVE / REQUEST_CHANGES / PENDING -->

## Human Review Required
${prefs.strictnessLevel === 'strict' ? '- [ ] **REQUIRED**: Human approval is mandatory for all agent PRs in strict mode' :
  '- [ ] Required for Tier 3 (high-risk) changes\n- [ ] Optional but recommended for Tier 2 changes'}

## Remediation History
<!-- Only applicable if this PR was created by the remediation agent -->
- Original PR: #<!-- number -->
- Review findings addressed: <!-- count -->
- Findings that could not be auto-fixed: <!-- count with brief reasons -->
- Remediation attempt: <!-- 1/2/3 -->
\`\`\`

## Template Quality Requirements

- All templates must be valid markdown that renders correctly on ${prefs.ciProvider === 'github-actions' ? 'GitHub' : prefs.ciProvider === 'gitlab-ci' ? 'GitLab' : 'Bitbucket'}
- HTML comments (<!-- -->) should guide the author on what to fill in
- Checkbox items must be actionable and relevant to this specific project
- The agent PR template must capture enough context for a human reviewer to quickly assess safety
- Risk tier sections must align with the tier definitions in harness.config.json
- Evidence sections must match the evidence requirements defined per tier
- Include both templates in the output, clearly separated by file path

## Output Format

Return the complete markdown content for each template file, separated by a comment line with the target file path. Do not wrap in additional markdown code fences.`;
}
