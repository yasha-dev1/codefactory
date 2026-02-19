import type { DetectionResult, UserPreferences } from './types.js';

/**
 * Prompt for generating pre-commit hooks configuration.
 */
export function buildPreCommitHooksPrompt(
  detection: DetectionResult,
  prefs: UserPreferences,
): string {
  const isNode = ['javascript', 'typescript'].includes(detection.primaryLanguage.toLowerCase());
  const isPython = detection.primaryLanguage.toLowerCase() === 'python';

  const hookSystem = isNode ? 'Husky (`.husky/` directory) with lint-staged' :
    isPython ? 'pre-commit framework (`.pre-commit-config.yaml`)' :
    'a shell-based git hooks setup';

  const packageInstall = isNode
    ? `\`${detection.packageManager ?? 'npm'} install husky lint-staged --save-dev\``
    : isPython
    ? '`pip install pre-commit` or add to dev dependencies'
    : 'manual installation of git hooks';

  return `Generate pre-commit hook configuration for this ${detection.primaryLanguage} project using ${hookSystem}.

## Detected Stack Context

- **Language**: ${detection.primaryLanguage}
- **Package Manager**: ${detection.packageManager ?? 'none'}
- **Linter**: ${detection.linter ?? 'none'}
- **Linter Command**: \`${detection.lintCommand ?? 'not detected'}\`
- **Formatter**: ${detection.formatter ?? 'none'}
- **Type Checker**: ${detection.typeChecker ?? 'none'}
- **Test Framework**: ${detection.testFramework ?? 'none'}
- **Test Command**: \`${detection.testCommand ?? 'not detected'}\`
- **Strictness**: ${prefs.strictnessLevel}

## Hook System

Use ${hookSystem} as the pre-commit hook framework. Installation requires: ${packageInstall}.

## Files to Generate

${isNode ? `### 1. .husky/pre-commit

A shell script executed before each commit:

\`\`\`sh
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx lint-staged
\`\`\`

The script must be executable (chmod +x). It delegates all file-specific checks to lint-staged, which only operates on staged files for speed.

### 2. .lintstagedrc.json

Configure lint-staged to run the appropriate checks on staged files by file pattern:

${detection.linter ? `- \`"*.{ts,tsx,js,jsx}"\`: Run linter with auto-fix: \`${detection.lintCommand ?? 'eslint'} --fix\`` : ''}
${detection.formatter ? `- \`"*.{ts,tsx,js,jsx,json,md,yaml,yml,css,scss}"\`: Run formatter: \`${detection.formatter} --write\`` : ''}
${detection.typeChecker ? `- For type checking: Run \`tsc --noEmit\` on the whole project (type checking cannot be scoped to individual files reliably)` : ''}

Only include commands for tools that are actually installed and configured in the project.

### 3. .husky/commit-msg (conditional on strictness)

${prefs.strictnessLevel === 'strict' ? `A commit message validation hook enforcing conventional commits format:

\`\`\`sh
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

commit_msg=$(cat "$1")
pattern="^(feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert)(\\\\(.+\\\\))?: .{1,72}$"

if ! echo "$commit_msg" | grep -qE "$pattern"; then
  echo "ERROR: Commit message does not follow conventional commits format."
  echo ""
  echo "Expected: <type>(<scope>): <description>"
  echo "Examples:"
  echo "  feat(auth): add login endpoint"
  echo "  fix: resolve null pointer in parser"
  echo "  docs: update API reference"
  exit 1
fi
\`\`\`

This hook rejects commits that don't match the conventional commits pattern. The pattern allows optional scope in parentheses and limits the description to 72 characters.` : 'Skip this hook — commit message validation is only enforced in strict mode. CI will validate commit messages separately.'}

### 4. package.json script additions

Add these to the scripts section of package.json:
- \`"prepare": "husky"\` — auto-installs hooks when dependencies are installed (Husky v9+)

Add lint-staged to devDependencies if not already present.` :

isPython ? `### 1. .pre-commit-config.yaml

A pre-commit framework configuration with these hook repositories:

\`\`\`yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-json
      - id: check-added-large-files
        args: ['--maxkb=500']
      - id: check-merge-conflict
      - id: detect-private-key
${detection.linter === 'ruff' ? `
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.3.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format` :
detection.linter === 'flake8' ? `
  - repo: https://github.com/PyCQA/flake8
    rev: 7.0.0
    hooks:
      - id: flake8` : `
  # Add your preferred Python linter here`}
${detection.formatter === 'black' ? `
  - repo: https://github.com/psf/black
    rev: 24.2.0
    hooks:
      - id: black` : ''}
${detection.typeChecker === 'mypy' ? `
  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.8.0
    hooks:
      - id: mypy
        additional_dependencies: []` :
detection.typeChecker === 'pyright' ? `
  - repo: https://github.com/RobertCraigie/pyright-python
    rev: v1.1.350
    hooks:
      - id: pyright` : ''}
\`\`\`

Use the latest stable \`rev\` values. Include only hooks for tools that are actually detected.

### 2. Setup instructions

\`\`\`sh
pip install pre-commit
pre-commit install
pre-commit install --hook-type commit-msg  # only for strict mode
pre-commit run --all-files  # initial run to validate existing code
\`\`\`

### 3. Commit-msg hook (strict mode only)

${prefs.strictnessLevel === 'strict' ? `Add the conventional-pre-commit hook:
\`\`\`yaml
  - repo: https://github.com/compilerla/conventional-pre-commit
    rev: v3.1.0
    hooks:
      - id: conventional-pre-commit
        stages: [commit-msg]
\`\`\`` : 'Skip commit-msg hooks — only enforced in strict mode.'}` :

`### 1. .githooks/pre-commit

A portable POSIX shell script for pre-commit checks:

\`\`\`sh
#!/usr/bin/env sh
set -e

echo "Running pre-commit checks..."

STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

if [ -z "$STAGED_FILES" ]; then
  echo "No staged files to check."
  exit 0
fi

${detection.lintCommand ? `echo "Running linter..."
${detection.lintCommand}` : '# No linter detected'}

${detection.testCommand ? `echo "Running tests..."
${detection.testCommand}` : '# No test command detected'}

echo "Pre-commit checks passed."
\`\`\`

### 2. scripts/install-hooks.sh

A setup script that copies hooks into .git/hooks and makes them executable:
\`\`\`sh
#!/usr/bin/env sh
set -e
mkdir -p .git/hooks
cp .githooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
echo "Git hooks installed successfully."
\`\`\``}

## Strictness Adjustments

${prefs.strictnessLevel === 'relaxed' ? `- **Relaxed mode**: Only run the formatter on staged files. Skip linting and type checking in pre-commit hooks (rely on CI for comprehensive checks). Do not enforce commit message format. Keep hooks fast — under 5 seconds total.` :
prefs.strictnessLevel === 'standard' ? `- **Standard mode**: Run formatter and linter on staged files. Type checking is optional in pre-commit (include if it runs under 10 seconds). Do not enforce commit message format locally (CI validates). Target under 10 seconds total.` :
`- **Strict mode**: Run formatter, linter, and type checker on staged files. Enforce conventional commit message format. Run a quick smoke test if it completes under 15 seconds. Block commits that fail any check. No exceptions without --no-verify.`}

## Quality Requirements

- All hook scripts must use POSIX-compatible shell (sh, not bash-specific features)
- Hooks must handle zero staged files gracefully (exit 0, no errors)
- Hooks must provide clear error messages indicating which check failed and why
- Include a note in error output: "Use git commit --no-verify to bypass (for emergencies only)"
- Total pre-commit execution time target: under ${prefs.strictnessLevel === 'strict' ? '15' : '10'} seconds
- Hooks must work on Linux, macOS, and Windows (WSL/Git Bash)
- Do not run heavy operations (full test suite, full build) in pre-commit — those belong in CI

## Output Format

Return the complete file contents for each file, separated by a comment line with the target file path. Do not wrap in markdown code fences.`;
}
