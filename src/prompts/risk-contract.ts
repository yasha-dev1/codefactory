import type { DetectionResult, UserPreferences } from './types.js';

/**
 * Prompt for generating the harness.config.json risk contract.
 */
export function buildRiskContractPrompt(detection: DetectionResult, prefs: UserPreferences): string {
  const criticalPaths = [
    ...detection.criticalPaths,
    ...(prefs.customCriticalPaths ?? []),
  ];

  const strictnessModifier = {
    relaxed: 'Use lenient thresholds. Allow self-merge for Tier 1. Require 1 reviewer for Tier 2.',
    standard: 'Use balanced thresholds. Require 1 reviewer for Tier 2, 2 for Tier 3.',
    strict: 'Use strict thresholds. Require review-agent approval for all tiers. Require 2 reviewers for Tier 2, 3 for Tier 3. Enforce browser evidence for any UI changes.',
  }[prefs.strictnessLevel];

  return `Generate a \`harness.config.json\` file that defines the risk contract for this repository. This file is the central policy document that all CI gates, review agents, and remediation loops reference.

## Detected Stack Context

- **Language**: ${detection.primaryLanguage}
- **Framework**: ${detection.framework ?? 'none'}
- **Test Framework**: ${detection.testFramework ?? 'none'}
- **Linter**: ${detection.linter ?? 'none'}
- **Type Checker**: ${detection.typeChecker ?? 'none'}
- **CI Provider**: ${prefs.ciProvider}
- **Has UI Components**: ${detection.hasUIComponents}
- **Monorepo**: ${detection.monorepo}
- **Architectural Layers**: ${detection.architecturalLayers.join(', ') || 'none detected'}

## Critical Paths

The following paths have been identified as high-risk areas:
${criticalPaths.map(p => `- \`${p}\``).join('\n')}

## Strictness Level: ${prefs.strictnessLevel}

${strictnessModifier}

## Required Structure

Generate a JSON file with the following top-level sections:

### 1. \`version\`
Schema version string, use "1.0.0".

### 2. \`riskTiers\`
An object with three tiers, each containing:

- **tier1** (Low Risk):
  - \`name\`: "low"
  - \`description\`: Brief description of what qualifies
  - \`patterns\`: Array of glob patterns matching low-risk files (docs, comments, READMEs, changelogs, .md files, non-code config)
  - \`requiredChecks\`: Minimal checks — lint and basic CI pass
  - \`mergePolicy\`: Object with \`minApprovals\` (0 or 1), \`requireReviewAgent\` (boolean), \`allowSelfMerge\` (boolean based on strictness)
  - \`evidenceRequirements\`: Empty array or minimal

- **tier2** (Medium Risk):
  - \`name\`: "medium"
  - \`description\`: Business logic, features, refactors
  - \`patterns\`: Array of glob patterns matching source code, test files, non-critical configs
  - \`requiredChecks\`: Full test suite, lint, type check (if applicable), review-agent
  - \`mergePolicy\`: Object with appropriate approval counts based on strictness
  - \`evidenceRequirements\`: ["tests-pass", "lint-clean", "type-check-clean"]

- **tier3** (High Risk):
  - \`name\`: "high"
  - \`description\`: Critical paths, infrastructure, auth, payments
  - \`patterns\`: Array of glob patterns matching the detected critical paths above
  - \`requiredChecks\`: Everything from tier2 plus browser evidence (if UI), manual approval, expanded coverage
  - \`mergePolicy\`: Strictest approval requirements
  - \`evidenceRequirements\`: ["tests-pass", "lint-clean", "type-check-clean", "browser-evidence", "manual-review"]

### 3. \`commands\`
Object containing the actual commands to run:
- \`test\`: "${detection.testCommand ?? 'echo \"no test command detected\"'}"
- \`build\`: "${detection.buildCommand ?? 'echo \"no build command detected\"'}"
- \`lint\`: "${detection.lintCommand ?? 'echo \"no lint command detected\"'}"
- \`typeCheck\`: The type-check command appropriate for ${detection.typeChecker ?? 'none'}, or null

### 4. \`docsDrift\`
Rules for detecting documentation drift:
- \`trackedDocs\`: Array of documentation file paths to monitor (based on detected existing docs: ${detection.existingDocs.join(', ') || 'none'})
- \`maxStaleDays\`: Number of days before a doc is considered stale (7 for strict, 14 for standard, 30 for relaxed)
- \`requireUpdateWithCodeChange\`: Boolean — if true, PRs touching source code must also update relevant docs
- \`exemptPatterns\`: Glob patterns for files exempt from docs drift checks (e.g., test files, generated files)

### 5. \`shaDiscipline\`
- \`enforceExactSha\`: true
- \`rejectStaleReviews\`: true — reject reviews that were performed on a different SHA than HEAD

### 6. \`evidenceConfig\`
- \`screenshotDir\`: ".harness/evidence"
- \`retentionDays\`: 30
- \`requiredForUI\`: ${detection.hasUIComponents}
- \`browserTool\`: "playwright" (for JS/TS projects) or appropriate tool for the detected stack

### 7. \`architecturalBoundaries\`
Based on the detected layers (${detection.architecturalLayers.join(', ') || 'none'}), define dependency direction rules:
- Each layer lists which other layers it may import from
- Violations of these boundaries should be caught by architectural linter scripts

### 8. \`monorepo\`
- \`enabled\`: ${detection.monorepo}
- \`packages\`: If monorepo, list detected package directories; otherwise empty array
- \`sharedChecks\`: Checks that apply to all packages

## Output Format

Return ONLY the complete JSON content for \`harness.config.json\`. The JSON must be valid and parseable. Do not wrap in markdown code fences. Do not include explanatory text.`;
}
