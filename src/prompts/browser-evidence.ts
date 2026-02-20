import type { DetectionResult, UserPreferences } from './types.js';

export function buildBrowserEvidencePrompt(
  detection: DetectionResult,
  _prefs: UserPreferences,
): string {
  const framework = detection.framework ?? 'unknown';

  return `Generate a browser evidence capture and verification system for this ${detection.primaryLanguage} project with ${framework} framework.

## Context

This project uses:
- Language: ${detection.primaryLanguage}
- Framework: ${framework}
- Package manager: ${detection.packageManager ?? 'npm'}
- Has UI components: ${detection.hasUIComponents}
- Test framework: ${detection.testFramework ?? 'none'}

## Files to Generate

### 1. scripts/harness-ui-capture-browser-evidence.ts

A TypeScript script that captures browser evidence for UI changes.

Purpose: Before submitting a PR that touches UI components, capture screenshots and interaction evidence proving the UI works correctly. This script is designed to be driven by a Claude agent using the Chrome DevTools MCP server (\`@modelcontextprotocol/server-puppeteer\`, configured in \`.mcp.json\`). When running in agent context, the agent uses \`mcp__puppeteer__*\` tools directly; when running in CI as a standalone script, it falls back to the Puppeteer Node API.

Implementation:
1. Detect which UI flows need evidence based on changed files
2. For each required flow:
   a. Navigate to the entrypoint URL (via MCP \`mcp__puppeteer__navigate\` or Puppeteer API)
   b. Capture a full-page screenshot (via MCP \`mcp__puppeteer__screenshot\` or Puppeteer API)
   c. Capture any console errors/warnings (via MCP \`mcp__puppeteer__evaluate\` or Puppeteer event listener)
   d. Record the navigation path and final URL
   e. If authentication required, use a test account (from env vars)
3. Write an evidence manifest to \`.harness/evidence/manifest.json\`:
\`\`\`json
{
  "capturedAt": "ISO timestamp",
  "headSha": "current git SHA",
  "captureMode": "mcp | puppeteer",
  "flows": [
    {
      "name": "flow-name",
      "entrypoint": "/path",
      "screenshot": ".harness/evidence/screenshots/flow-name.png",
      "consoleErrors": [],
      "finalUrl": "/path/after-navigation",
      "accountIdentity": "test-user@example.com or null",
      "durationMs": 1234
    }
  ]
}
\`\`\`
4. Store screenshots in \`.harness/evidence/screenshots/\`

The script should:
- Accept \`--flows\` argument to specify which flows to capture (or "all")
- Accept \`--base-url\` argument (default: http://localhost:3000)
- Exit with non-zero if any flow fails to capture
- Output a human-readable summary to stdout

**Note**: When a Claude agent is running this validation directly (not via CI script), it should use the \`mcp__puppeteer__*\` tools from the project's \`.mcp.json\` configuration instead of spawning this script. The script exists for CI environments where an agent runtime is not present.

### 2. scripts/harness-ui-verify-browser-evidence.ts

A TypeScript script that verifies evidence manifests meet requirements:

Assertions:
1. Manifest exists and is valid JSON
2. All required flows are present (based on changed files vs flow mapping)
3. Each flow has a valid screenshot file that exists and is non-empty
4. Captured SHA matches the current HEAD SHA (evidence is fresh)
5. No console errors in any flow (warnings are OK)
6. If authentication was required, account identity is present
7. Evidence is not older than a configurable threshold (default: 1 hour)

Exit codes:
- 0: All assertions pass
- 1: Assertions failed (with detailed report)

### 3. .github/workflows/browser-evidence.yml

A GitHub Actions workflow for CI integration:

Trigger: pull_request when high-risk UI files are changed

Steps:
1. Check out the PR
2. Set up Node.js and install dependencies
3. Install browser dependencies (Playwright browsers)
4. Start the dev server in background
5. Wait for server to be ready
6. Run \`scripts/harness-ui-capture-browser-evidence.ts\`
7. Run \`scripts/harness-ui-verify-browser-evidence.ts\`
8. Upload evidence artifacts (screenshots + manifest)
9. Post evidence summary as a PR comment

The workflow should have a path filter to only run when UI-related files change.

## Quality Requirements

- Scripts should be executable with ts-node or tsx
- Include proper error handling for browser launch failures
- Support CI (headless) and local (headed for debugging) modes via \`--headed\` flag
- Evidence directory should be gitignored by default
- Add \`.harness/\` to .gitignore if not already present`;
}
