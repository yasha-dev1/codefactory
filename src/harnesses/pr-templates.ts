import { join } from 'node:path';
import type { HarnessModule, HarnessContext, HarnessOutput } from './types.js';

const PULL_REQUEST_TEMPLATE = `## Summary
<!-- Brief description of what this PR does and why. Link to the issue if applicable. -->

## Risk Tier
<!-- The risk-policy-gate auto-detects the tier, but classify here for reviewer context. -->
<!-- See harness.config.json for full pattern definitions. -->
- [ ] **Tier 1 (Low)**: Docs, comments, \`.md\`/\`.txt\` files, \`.gitignore\`, \`.editorconfig\`, \`.prettierrc\`, \`.vscode/\`
- [ ] **Tier 2 (Medium)**: Source in \`src/ui/\`, \`src/utils/\`, \`src/prompts/\`, \`src/providers/\`, \`tests/\`
- [ ] **Tier 3 (High)**: Entry points, core engine, harness registry, build/CI infra (\`src/index.ts\`, \`src/cli.ts\`, \`src/commands/\`, \`src/core/\`, \`src/harnesses/index.ts\`, \`src/harnesses/types.ts\`, \`package.json\`, \`tsconfig.json\`, \`tsup.config.ts\`, \`vitest.config.ts\`, \`eslint.config.js\`)

## Changes
<!-- Group modified files by logical concern. -->

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
- [ ] Manual testing completed
- [ ] All checks pass locally:
  \`\`\`
  npm run lint && npm run typecheck && npm test
  \`\`\`

## Evidence
<!-- Tier 1: none required. Tier 2: tests-pass, lint-clean, type-check-clean. Tier 3: all of Tier 2 + manual-review. -->

| Check | Result |
|-------|--------|
| \`eslint src/\` | <!-- PASS / FAIL --> |
| \`tsc --noEmit\` | <!-- PASS / FAIL --> |
| \`vitest run\` | <!-- PASS / FAIL --> |
| \`tsup\` (build) | <!-- PASS / FAIL --> |

## Architectural Compliance
<!-- Confirm layer boundaries are respected (see docs/layers.md). -->
- [ ] No circular imports introduced
- [ ] Import rules followed: \`utils\` imports nothing; \`core\` imports only \`utils\`; etc.
- [ ] No imports from \`commands\` or \`harnesses\` inside \`core\`

## Review Checklist
- [ ] Code follows project conventions (\`docs/conventions.md\`, \`CLAUDE.md\`)
- [ ] ESM imports use \`.js\` extensions for local files
- [ ] \`import type\` used for type-only imports
- [ ] No secrets, API keys, or \`.env\` files committed
- [ ] No ESLint rules or TypeScript strict mode disabled
- [ ] Documentation updated if public API changed
- [ ] Risk tier accurately reflects scope of changes
`;

const AGENT_PR_TEMPLATE = `## Agent-Generated PR

**Agent**: <!-- agent name and version (e.g., Claude Code v1.0, remediation-bot) -->
**Trigger**: <!-- what triggered this PR: review remediation, feature request, scheduled task -->
**Head SHA**: \`<!-- exact commit SHA this PR was generated at -->\`

## Summary
<!-- Auto-generated summary describing all changes. -->

## Risk Assessment

- **Detected Risk Tier**: <!-- auto-populated by risk-policy-gate -->
- **Critical paths touched**:
  <!-- List any files matching Tier 3 patterns from harness.config.json:
       src/index.ts, src/cli.ts, src/commands/**, src/core/**,
       src/harnesses/index.ts, src/harnesses/types.ts,
       package.json, tsconfig.json, tsup.config.ts, vitest.config.ts, eslint.config.js -->
  -
- **Confidence level**: <!-- high / medium / low -->

## Changes Made
<!-- Complete list of every file modified. -->

| File | Change Type | Description |
|------|-------------|-------------|
| | added / modified / deleted | |

## Validation Results

| Check | Status | Command |
|-------|--------|---------|
| Lint | <!-- PASS / FAIL --> | \`eslint src/\` |
| Type Check | <!-- PASS / FAIL --> | \`tsc --noEmit\` |
| Tests | <!-- PASS / FAIL --> | \`vitest run\` |
| Build | <!-- PASS / FAIL --> | \`tsup\` |

## Architectural Compliance
<!-- Layer boundary check results (see docs/layers.md, harness.config.json -> architecturalBoundaries). -->
- [ ] No circular imports
- [ ] Import rules respected
- [ ] No protected files modified (\`.github/workflows/\`, \`harness.config.json\`, \`CLAUDE.md\`, lockfiles)

## Review Agent Status
- [ ] Review agent has analyzed this PR
- [ ] No unresolved blocking findings
- [ ] Review SHA matches current HEAD (\`<!-- SHA -->\`)
- **Verdict**: <!-- APPROVE / REQUEST_CHANGES / PENDING -->

## Human Review Required
<!-- Tier 3 changes require manual approval via the tier3-approval environment gate. -->
- [ ] Required — Tier 3 (high-risk) changes detected
- [ ] Optional but recommended — Tier 2 changes

## Remediation History
<!-- Only if this PR was created or updated by the remediation agent. Remove this section otherwise. -->
- **Original PR**: #<!-- number -->
- **Remediation attempt**: <!-- 1 / 2 / 3 (max 3 per harness.config.json) -->
- **Findings fixed**: <!-- count -->
- **Findings skipped**: <!-- count, with brief reasons -->
- **Validation after fix**: <!-- all passed / partial — specify which failed -->
`;

export const prTemplatesHarness: HarnessModule = {
  name: 'pr-templates',
  displayName: 'PR Templates',
  description: 'Generates pull request templates with risk tier and evidence sections',
  order: 10,

  isApplicable(): boolean {
    return true;
  },

  async execute(ctx: HarnessContext): Promise<HarnessOutput> {
    const snap = ctx.fileWriter.snapshot();

    await ctx.fileWriter.write(
      join(ctx.repoRoot, '.github', 'PULL_REQUEST_TEMPLATE.md'),
      PULL_REQUEST_TEMPLATE,
    );

    await ctx.fileWriter.write(
      join(ctx.repoRoot, '.github', 'PULL_REQUEST_TEMPLATE', 'agent-pr.md'),
      AGENT_PR_TEMPLATE,
    );

    const diff = ctx.fileWriter.diffSince(snap);

    const output: HarnessOutput = {
      harnessName: 'pr-templates',
      filesCreated: diff.created,
      filesModified: diff.modified,
      metadata: {
        targetFiles: [
          '.github/PULL_REQUEST_TEMPLATE.md',
          '.github/PULL_REQUEST_TEMPLATE/agent-pr.md',
        ],
      },
    };

    ctx.previousOutputs.set('pr-templates', output);

    return output;
  },
};
