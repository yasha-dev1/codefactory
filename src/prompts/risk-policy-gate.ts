import type { DetectionResult, UserPreferences } from './types.js';

/**
 * Prompt for generating the risk-policy-gate preflight workflow and script.
 */
export function buildRiskPolicyGatePrompt(
  detection: DetectionResult,
  prefs: UserPreferences,
): string {
  const criticalPaths = [...detection.criticalPaths, ...(prefs.customCriticalPaths ?? [])];

  const scriptRuntime =
    detection.primaryLanguage === 'python'
      ? 'Python'
      : detection.primaryLanguage === 'go'
        ? 'Go'
        : 'Node.js (with TypeScript or plain JS)';

  return `Generate the risk-policy-gate preflight system. This is the most critical piece of the harness — it runs before all other CI checks and determines what level of scrutiny a PR requires.

## Detected Stack Context

- **Language**: ${detection.primaryLanguage}
- **CI Provider**: ${prefs.ciProvider}
- **Strictness**: ${prefs.strictnessLevel}
- **Has UI Components**: ${detection.hasUIComponents}
- **Monorepo**: ${detection.monorepo}
- **Architectural Layers**: ${detection.architecturalLayers.join(', ') || 'none'}

## Critical Paths

${criticalPaths.map((p) => `- \`${p}\``).join('\n') || '- none configured'}

## Generate These Files

### 1. Risk Policy Gate Script (\`scripts/risk-policy-gate.sh\` or \`.ts\`)

A script (preferably shell for portability, with a ${scriptRuntime} alternative for complex logic) that performs the following steps in order:

#### Step 1: SHA Discipline Check
- Read the PR's head SHA from the CI environment variables
- Verify this SHA matches the actual checked-out commit
- If there's a mismatch, fail immediately with an error explaining SHA discipline
- Store the verified SHA for use by downstream jobs
- For ${prefs.ciProvider}:
${
  prefs.ciProvider === 'github-actions'
    ? '  - Use `${{ github.event.pull_request.head.sha }}` and compare with `git rev-parse HEAD`'
    : prefs.ciProvider === 'gitlab-ci'
      ? '  - Use `$CI_COMMIT_SHA` and compare with `git rev-parse HEAD`'
      : '  - Use `$BITBUCKET_COMMIT` and compare with `git rev-parse HEAD`'
}

#### Step 2: Changed File Classification
- Get the list of changed files in the PR using \`git diff --name-only\` against the base branch
- Classify each changed file into a risk tier by matching against the glob patterns defined in \`harness.config.json\`
- The overall PR risk tier is the MAXIMUM tier of any changed file
- Tier classification rules:
  - **Tier 1**: Documentation files (*.md, *.txt, docs/*, LICENSE, .gitignore, comments-only changes)
  - **Tier 2**: Source code, test files, non-critical configuration
  - **Tier 3**: Files matching critical paths: ${criticalPaths.map((p) => `\`${p}\``).join(', ') || 'none'}
  - **Tier 3 also**: CI/CD configs, security configs, dependency files (package.json, lock files) if strictness is "strict"

#### Step 3: Required Checks Computation
Based on the determined tier, output the list of required checks:

**Tier 1 required checks:**
- lint
- harness-smoke

**Tier 2 required checks:**
- lint
${detection.typeChecker ? '- type-check' : ''}
- test
- build
- structural-tests
- review-agent
- harness-smoke

**Tier 3 required checks:**
- All of Tier 2
${detection.hasUIComponents ? '- browser-evidence' : ''}
- manual-approval
- expanded-coverage

#### Step 4: Docs Drift Assertion
- If the PR modifies source code files AND the strictness level is "standard" or "strict":
  - Check if any documentation files were also modified
  - If not, emit a warning (for "standard") or fail (for "strict") with a message about docs drift
- Read the \`docsDrift\` section of \`harness.config.json\` for tracked docs list

#### Step 5: Review Agent Completion Check
- For Tier 2+, check if the review agent has completed its analysis
- On the first run, this check is skipped (review agent hasn't run yet)
- On subsequent runs (re-triggered by remediation), verify the review agent approved
- Output whether review-agent approval is pending, approved, or rejected

#### Step 6: Output Results
Output a JSON object with:
\`\`\`json
{
  "sha": "<verified-sha>",
  "tier": 1|2|3,
  "tierName": "low"|"medium"|"high",
  "requiredChecks": ["check1", "check2"],
  "changedFiles": { "tier1": [...], "tier2": [...], "tier3": [...] },
  "docsDrift": { "detected": true|false, "warning": "message" },
  "reviewAgentStatus": "pending"|"approved"|"rejected"|"skipped"
}
\`\`\`

For ${prefs.ciProvider}:
${
  prefs.ciProvider === 'github-actions'
    ? '- Set outputs using `echo "tier=$TIER" >> $GITHUB_OUTPUT`\n- Set outputs using `echo "required-checks=$CHECKS_JSON" >> $GITHUB_OUTPUT`'
    : prefs.ciProvider === 'gitlab-ci'
      ? '- Write outputs to a dotenv artifact file for downstream jobs'
      : '- Write outputs to a shared artifact file'
}

### 2. Risk Policy Gate Workflow

A CI workflow file that:
- Triggers on every pull request
- Checks out the code at the PR head SHA
- Runs the risk-policy-gate script
- Exposes the tier and required-checks as job outputs
- Other CI jobs use these outputs in their \`if\` conditions
- Has \`permissions: contents: read, pull-requests: read\`
${prefs.ciProvider === 'github-actions' ? '- Uses `concurrency` group `risk-gate-${{ github.event.pull_request.number }}` with `cancel-in-progress: true`' : ''}

### 3. harness.config.json Reader Utility

A small utility function (in the gate script or separate file) that:
- Reads and parses \`harness.config.json\` from the repo root
- Validates it has the expected structure
- Extracts tier patterns, required checks, and docs drift rules
- Falls back to sensible defaults if the config is missing or malformed

## Script Quality Requirements

- The script must be idempotent — running it twice produces the same output
- All error paths must produce clear, actionable error messages
- Exit code 0 means the gate passed (checks are computed, downstream jobs should run)
- Exit code 1 means a hard failure (SHA mismatch, config missing, etc.)
- The script should complete in under 10 seconds
- Include inline comments explaining each step

## Workflow Quality Requirements (IMPORTANT)

- **SHA-Pinned Actions**: All GitHub Actions MUST be pinned to exact commit SHAs, not version tags. Example: use \`actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683\` instead of \`actions/checkout@v4\`. This is a security requirement — version tags can be moved to point at different commits.
- **Node Version Consistency**: Use the same Node.js version (22) across all jobs and workflows for consistency with the main CI pipeline.
- **Structural Tests Job**: If a structural-tests job exists in the workflow, it MUST run \`bash scripts/structural-tests.sh\`, NOT \`npm test\`. The structural tests validate architectural boundaries, which is different from the unit test suite.
- **TypeScript Execution**: Use \`npx tsx\` to run TypeScript scripts, NOT \`npx ts-node\`. This project uses ESM (\`"type": "module"\`) and ts-node does not support ESM well.

## Output Format

Write each file using the Write tool. Files must be immediately executable/parseable.`;
}
