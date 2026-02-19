import type { DetectionResult, UserPreferences } from './types.js';

/**
 * Prompt for generating the CLAUDE.md agent instructions file.
 */
export function buildClaudeMdPrompt(detection: DetectionResult, prefs: UserPreferences): string {
  const criticalPaths = [
    ...detection.criticalPaths,
    ...(prefs.customCriticalPaths ?? []),
  ];

  return `Generate a \`CLAUDE.md\` file for this repository. CLAUDE.md is the primary instruction file that AI coding agents (Claude Code, Cursor, etc.) read before making changes. It must be concise (~100 lines), authoritative, and contain everything an agent needs to work safely in this codebase.

## Detected Stack Context

- **Language**: ${detection.primaryLanguage}
- **Framework**: ${detection.framework ?? 'none'}
- **Package Manager**: ${detection.packageManager ?? 'none'}
- **Test Framework**: ${detection.testFramework ?? 'none'}
- **Linter**: ${detection.linter ?? 'none'}
- **Formatter**: ${detection.formatter ?? 'none'}
- **Type Checker**: ${detection.typeChecker ?? 'none'}
- **Build Tool**: ${detection.buildTool ?? 'none'}
- **Monorepo**: ${detection.monorepo}
- **Architectural Layers**: ${detection.architecturalLayers.join(', ') || 'none detected'}
- **Has UI Components**: ${detection.hasUIComponents}

## Commands

- **Test**: \`${detection.testCommand ?? 'not detected'}\`
- **Build**: \`${detection.buildCommand ?? 'not detected'}\`
- **Lint**: \`${detection.lintCommand ?? 'not detected'}\`

## Critical Paths

${criticalPaths.map(p => `- \`${p}\``).join('\n') || '- none detected'}

## CLAUDE.md Structure Requirements

Generate the file with exactly these sections in this order:

### 1. Project Overview (2-3 lines)
One-sentence description of what this project does, the primary language, and the framework. Keep it factual. Read the existing README.md or package description to extract this.

### 2. Build & Run Commands
List the exact commands for common operations in a compact format:
\`\`\`
# Install dependencies
${detection.packageManager ?? 'unknown'} install

# Run tests
${detection.testCommand ?? 'unknown'}

# Run single test file
<single-file test command appropriate for ${detection.testFramework ?? 'unknown'}>

# Build
${detection.buildCommand ?? 'unknown'}

# Lint
${detection.lintCommand ?? 'unknown'}

# Type check
<type check command for ${detection.typeChecker ?? 'none'}>
\`\`\`
Include only commands that are actually available. Omit sections for tools that aren't detected.

### 3. Code Style Rules
Concise bullet list covering:
- Import ordering conventions (read the existing linter config to determine this)
- Naming conventions (camelCase, snake_case, PascalCase — match the project's actual style)
- File naming conventions (kebab-case.ts, PascalCase.tsx, etc.)
- Export style (named exports vs default exports — check the codebase)
- Error handling patterns (throw vs return Result, try/catch conventions)
- Any framework-specific conventions (e.g., React hooks rules, Django view patterns)

### 4. Architecture Overview
Brief description of the project's architectural layers:
${detection.architecturalLayers.map(l => `- **${l}**: Brief description of this layer's responsibility`).join('\n') || '- Describe the observed directory structure and its purpose'}

Include a one-line dependency rule: which layers can import from which.

### 5. Critical Paths — Extra Care Required
List the critical paths that require heightened attention:
${criticalPaths.map(p => `- \`${p}\``).join('\n') || '- none identified'}

State that changes to these paths:
- Require additional test coverage
- Must be reviewed by a human (not just the review agent)
- Should include browser evidence if they affect UI
- Reference the risk tier system in harness.config.json

### 6. Security Constraints
Bullet list:
- Never commit secrets, API keys, or credentials
- Never disable security linters or type checking
- Validate all external input at system boundaries
- Use parameterized queries for database access (if applicable)
- Follow the principle of least privilege in all configurations

### 7. Dependency Management
- How to add a new dependency (\`${detection.packageManager ?? 'unknown'} add <pkg>\`)
- Always commit the lock file
- Do not upgrade major versions without explicit instruction
- Pin exact versions in production dependencies

### 8. Harness System Reference
Brief note that this project uses harness engineering:
- Risk tiers are defined in \`harness.config.json\`
- CI gates enforce risk-appropriate checks on every PR
- A review agent will automatically review PRs
- Pre-commit hooks enforce local quality checks
- See \`docs/architecture.md\` and \`docs/conventions.md\` for detailed guidelines

### 9. PR Conventions
- Branch naming: \`<type>/<short-description>\` (e.g., \`feat/add-auth\`, \`fix/null-check\`)
- Commit messages: conventional commits format
- PRs must pass all CI checks before merge
- Fill out the PR template completely, including risk tier classification

## Output Format

Return ONLY the complete markdown content for CLAUDE.md. Target approximately 100 lines. Be concise — every line should provide actionable information to an AI agent. Do not include meta-commentary or explanations outside the file content.`;
}
