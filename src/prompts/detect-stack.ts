/**
 * Prompt for deep repository analysis using Claude.
 */
export function buildDetectStackPrompt(heuristics: Record<string, unknown>, directoryTree: string): string {
  const heuristicsJson = JSON.stringify(heuristics, null, 2);

  return `Analyze this repository to produce a comprehensive stack detection report. You have access to file reading tools — use them to inspect configuration files and source code.

## Heuristic Pre-Scan Results

The following values were detected by a fast heuristic scan. Use these as starting hints, but verify and correct them by reading actual config files. The heuristic scan may have missed things or made incorrect guesses.

\`\`\`json
${heuristicsJson}
\`\`\`

## Directory Tree

\`\`\`
${directoryTree}
\`\`\`

## Analysis Instructions

Perform each of the following analysis steps. Read the actual config files to verify or correct the heuristic guesses.

### 1. Primary Language
- Read the root config files (package.json, pyproject.toml, Cargo.toml, go.mod, build.gradle, pom.xml, etc.)
- Check for TypeScript via tsconfig.json presence
- If multiple languages exist, pick the one with the most source files
- Return the language name in lowercase (e.g., "typescript", "python", "rust", "go", "java")

### 2. Framework Detection
- For JS/TS: Check for next.config.*, nuxt.config.*, angular.json, svelte.config.*, astro.config.*, remix.config.*, vite.config.*
- For Python: Check for django settings, flask app factory, fastapi imports
- For Go: Check for gin/echo/fiber imports in go.sum
- For Rust: Check Cargo.toml dependencies for actix-web, axum, rocket
- For Java: Check for Spring Boot, Quarkus, Micronaut in pom.xml or build.gradle
- Return null if no framework detected

### 3. Package Manager
- Node: Look for package-lock.json (npm), yarn.lock (yarn), pnpm-lock.yaml (pnpm), bun.lockb (bun)
- Python: Look for poetry.lock (poetry), Pipfile.lock (pipenv), requirements.txt (pip), uv.lock (uv)
- Return the package manager name or null

### 4. Test Framework
- Read the test configuration sections of package.json, pyproject.toml, etc.
- Check for jest.config.*, vitest.config.*, pytest.ini, .pytest.ini, setup.cfg [tool:pytest]
- Check for test directories: __tests__, tests/, test/, spec/
- Return the framework name or null

### 5. Linter
- Check for .eslintrc.*, eslint.config.*, .pylintrc, ruff.toml, pyproject.toml [tool.ruff], .rubocop.yml, golangci-lint config
- Return the linter name or null

### 6. Formatter
- Check for .prettierrc*, prettier.config.*, pyproject.toml [tool.black], rustfmt.toml, .editorconfig
- Return the formatter name or null

### 7. Type Checker
- TypeScript projects: "typescript" if tsconfig.json exists
- Python: Check for mypy.ini, pyproject.toml [tool.mypy], pyrightconfig.json, pyproject.toml [tool.pyright]
- Return the type checker name or null

### 8. Build Tool
- Check for tsup.config.*, webpack.config.*, rollup.config.*, esbuild config, vite.config.*, turbo.json
- Python: setuptools, hatch, flit, maturin
- Return the build tool name or null

### 9. CI Provider
- Check for .github/workflows/ directory (github-actions)
- Check for .gitlab-ci.yml (gitlab-ci)
- Check for bitbucket-pipelines.yml (bitbucket)
- Check for .circleci/ directory (circleci)
- Return the provider name or null

### 10. Existing Documentation
- List all markdown files in the root and docs/ directory
- Include: README.md, CONTRIBUTING.md, CHANGELOG.md, docs/*.md, architecture.md, etc.
- Return as an array of relative file paths

### 11. Existing CLAUDE.md
- Check if CLAUDE.md exists in the repository root
- Return true/false

### 12. Architectural Layers
- Scan the source directory structure for common layer patterns
- Look for: api/, routes/, controllers/, services/, models/, repositories/, db/, middleware/, utils/, lib/, core/, domain/, infrastructure/, presentation/, application/
- Read any existing architecture docs for declared layers
- Return as an array of layer names (e.g., ["api", "services", "models", "db"])

### 13. Monorepo Detection
- Check for workspaces in package.json, pnpm-workspace.yaml, lerna.json, nx.json, turbo.json
- Check for packages/ or apps/ directories with their own package.json files
- Return true/false

### 14. UI Components
- Check for React/Vue/Svelte/Angular component files
- Look for component directories, storybook config, design system packages
- Return true if the project has user-facing UI components, false otherwise

### 15. Critical Paths
- Identify files and directories that handle: authentication, authorization, payments, billing, data migrations, database schemas, infrastructure config, secrets management, API keys, encryption
- Look for: auth/, payments/, billing/, migrations/, schema/, infra/, terraform/, pulumi/
- Scan for files with names containing: auth, login, session, payment, billing, migrate, schema
- Return as an array of relative directory/file paths

### 16. Commands
- Determine the test command (e.g., "npm test", "pytest", "cargo test")
- Determine the build command (e.g., "npm run build", "python -m build", "cargo build")
- Determine the lint command (e.g., "npm run lint", "ruff check .", "cargo clippy")
- Read package.json scripts, Makefile targets, or pyproject.toml scripts sections

## Output Format

Return your analysis as a single JSON object matching this exact schema. Do not include any text before or after the JSON.

\`\`\`json
{
  "primaryLanguage": "string",
  "framework": "string | null",
  "packageManager": "string | null",
  "testFramework": "string | null",
  "linter": "string | null",
  "formatter": "string | null",
  "typeChecker": "string | null",
  "buildTool": "string | null",
  "ciProvider": "string | null",
  "existingDocs": ["string"],
  "existingClaude": false,
  "architecturalLayers": ["string"],
  "monorepo": false,
  "testCommand": "string | null",
  "buildCommand": "string | null",
  "lintCommand": "string | null",
  "hasUIComponents": false,
  "criticalPaths": ["string"]
}
\`\`\`

Important: Return ONLY the JSON object. No markdown fences, no explanatory text. Just the raw JSON.`;
}
