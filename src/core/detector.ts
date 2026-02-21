import { join } from 'node:path';
import { readdir } from 'node:fs/promises';
import { fileExists, readFileIfExists } from '../utils/fs.js';

export interface DetectionResult {
  primaryLanguage: string;
  framework: string | null;
  packageManager: string | null;
  testFramework: string | null;
  linter: string | null;
  formatter: string | null;
  typeChecker: string | null;
  buildTool: string | null;
  ciProvider: string | null;
  existingDocs: string[];
  existingClaude: boolean;
  architecturalLayers: string[];
  monorepo: boolean;
  testCommand: string | null;
  buildCommand: string | null;
  lintCommand: string | null;
  hasUIComponents: boolean;
  criticalPaths: string[];
}

export async function runHeuristicDetection(repoRoot: string): Promise<DetectionResult> {
  const result: DetectionResult = {
    primaryLanguage: 'unknown',
    framework: null,
    packageManager: null,
    testFramework: null,
    linter: null,
    formatter: null,
    typeChecker: null,
    buildTool: null,
    ciProvider: null,
    existingDocs: [],
    existingClaude: false,
    architecturalLayers: [],
    monorepo: false,
    testCommand: null,
    buildCommand: null,
    lintCommand: null,
    hasUIComponents: false,
    criticalPaths: [],
  };

  const languages: string[] = [];
  let hasTypeScript = false;

  // ── Node.js / JavaScript / TypeScript ──────────────────────────────────
  const packageJsonPath = join(repoRoot, 'package.json');
  if (await fileExists(packageJsonPath)) {
    languages.push('JavaScript');
    const raw = await readFileIfExists(packageJsonPath);
    if (raw) {
      try {
        const pkg = JSON.parse(raw) as Record<string, unknown>;
        const deps = {
          ...(pkg.dependencies as Record<string, string> | undefined),
          ...(pkg.devDependencies as Record<string, string> | undefined),
        };
        const devDeps = (pkg.devDependencies as Record<string, string> | undefined) ?? {};
        const scripts = (pkg.scripts as Record<string, string> | undefined) ?? {};

        // Framework detection
        if (deps.next) result.framework = 'Next.js';
        else if (deps.react) result.framework = 'React';
        else if (deps.vue) result.framework = 'Vue';
        else if (deps.svelte || deps['@sveltejs/kit']) result.framework = 'Svelte';
        else if (deps.angular || deps['@angular/core']) result.framework = 'Angular';
        else if (deps.express) result.framework = 'Express';
        else if (deps.fastify) result.framework = 'Fastify';
        else if (deps.nest || deps['@nestjs/core']) result.framework = 'NestJS';

        // UI components detection
        const uiFrameworks = ['react', 'vue', 'svelte', 'angular', '@angular/core', 'next'];
        result.hasUIComponents = uiFrameworks.some((f) => f in deps);

        // Package manager detection
        if (await fileExists(join(repoRoot, 'pnpm-lock.yaml'))) result.packageManager = 'pnpm';
        else if (await fileExists(join(repoRoot, 'yarn.lock'))) result.packageManager = 'yarn';
        else if (await fileExists(join(repoRoot, 'bun.lockb'))) result.packageManager = 'bun';
        else if (await fileExists(join(repoRoot, 'package-lock.json')))
          result.packageManager = 'npm';

        // Test framework detection
        if (devDeps.vitest || deps.vitest) result.testFramework = 'vitest';
        else if (devDeps.jest || deps.jest) result.testFramework = 'jest';
        else if (devDeps.mocha || deps.mocha) result.testFramework = 'mocha';

        // Linter detection
        if (devDeps.eslint || deps.eslint) result.linter = 'eslint';

        // Formatter detection
        if (devDeps.prettier || deps.prettier) result.formatter = 'prettier';
        else if (devDeps['@biomejs/biome'] || deps['@biomejs/biome']) result.formatter = 'biome';

        // Build tool detection
        if (devDeps.tsup || deps.tsup) result.buildTool = 'tsup';
        else if (devDeps.webpack || deps.webpack) result.buildTool = 'webpack';
        else if (devDeps.vite || deps.vite) result.buildTool = 'vite';
        else if (devDeps.esbuild || deps.esbuild) result.buildTool = 'esbuild';
        else if (devDeps.rollup || deps.rollup) result.buildTool = 'rollup';

        // Script-based command detection
        if (scripts.test) result.testCommand = `${result.packageManager ?? 'npm'} test`;
        if (scripts.build) result.buildCommand = `${result.packageManager ?? 'npm'} run build`;
        if (scripts.lint) result.lintCommand = `${result.packageManager ?? 'npm'} run lint`;

        // Monorepo indicators
        if (pkg.workspaces || (await fileExists(join(repoRoot, 'pnpm-workspace.yaml')))) {
          result.monorepo = true;
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  // TypeScript
  if (await fileExists(join(repoRoot, 'tsconfig.json'))) {
    hasTypeScript = true;
    result.typeChecker = 'tsc';
    if (!languages.includes('TypeScript')) {
      languages.push('TypeScript');
    }
  }

  // ── Python ─────────────────────────────────────────────────────────────
  const hasPyproject = await fileExists(join(repoRoot, 'pyproject.toml'));
  if (
    hasPyproject ||
    (await fileExists(join(repoRoot, 'setup.py'))) ||
    (await fileExists(join(repoRoot, 'requirements.txt')))
  ) {
    languages.push('Python');

    if (hasPyproject) {
      const raw = await readFileIfExists(join(repoRoot, 'pyproject.toml'));
      if (raw) {
        // Framework
        if (raw.includes('django')) result.framework = 'Django';
        else if (raw.includes('fastapi')) result.framework = 'FastAPI';
        else if (raw.includes('flask')) result.framework = 'Flask';

        // Test framework
        if (raw.includes('pytest')) result.testFramework = 'pytest';

        // Linter
        if (raw.includes('ruff')) result.linter = 'ruff';
        else if (raw.includes('flake8')) result.linter = 'flake8';

        // Formatter
        if (raw.includes('black')) result.formatter = 'black';
        else if (raw.includes('ruff')) result.formatter = result.formatter ?? 'ruff';

        // Type checker
        if (raw.includes('mypy')) result.typeChecker = 'mypy';
        else if (raw.includes('pyright')) result.typeChecker = 'pyright';
      }
    }

    // Python commands (heuristic)
    if (!result.testCommand && result.testFramework === 'pytest') {
      result.testCommand = 'pytest';
    }
    if (!result.lintCommand && result.linter === 'ruff') {
      result.lintCommand = 'ruff check .';
    }
  }

  // ── Go ─────────────────────────────────────────────────────────────────
  if (await fileExists(join(repoRoot, 'go.mod'))) {
    languages.push('Go');
    if (!result.testCommand) result.testCommand = 'go test ./...';
    if (!result.buildCommand) result.buildCommand = 'go build ./...';
    if (!result.lintCommand) result.lintCommand = 'golangci-lint run';
  }

  // ── Rust ───────────────────────────────────────────────────────────────
  if (await fileExists(join(repoRoot, 'Cargo.toml'))) {
    languages.push('Rust');
    if (!result.testCommand) result.testCommand = 'cargo test';
    if (!result.buildCommand) result.buildCommand = 'cargo build';
    if (!result.lintCommand) result.lintCommand = 'cargo clippy';
  }

  // ── CI detection ───────────────────────────────────────────────────────
  if (await fileExists(join(repoRoot, '.github'))) {
    result.ciProvider = 'GitHub Actions';
  }
  if (await fileExists(join(repoRoot, '.gitlab-ci.yml'))) {
    result.ciProvider = 'GitLab CI';
  }
  if (await fileExists(join(repoRoot, 'Jenkinsfile'))) {
    result.ciProvider = 'Jenkins';
  }
  if (await fileExists(join(repoRoot, '.circleci'))) {
    result.ciProvider = 'CircleCI';
  }

  // ── Existing CLAUDE.md ─────────────────────────────────────────────────
  if (await fileExists(join(repoRoot, 'CLAUDE.md'))) {
    result.existingClaude = true;
  }

  // ── Existing docs ──────────────────────────────────────────────────────
  const docPaths = ['README.md', 'CONTRIBUTING.md', 'docs', 'CHANGELOG.md', 'ARCHITECTURE.md'];
  for (const docPath of docPaths) {
    if (await fileExists(join(repoRoot, docPath))) {
      result.existingDocs.push(docPath);
    }
  }

  // ── Architectural layers ───────────────────────────────────────────────
  const srcDir = join(repoRoot, 'src');
  if (await fileExists(srcDir)) {
    try {
      const entries = await readdir(srcDir, { withFileTypes: true });
      result.architecturalLayers = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .filter((name) => !name.startsWith('.') && !name.startsWith('__'));
    } catch {
      // ignore read errors
    }
  }

  // ── Critical paths ─────────────────────────────────────────────────────
  const criticalCandidates = [
    'src/index.ts',
    'src/main.ts',
    'src/app.ts',
    'src/server.ts',
    'src/cli.ts',
    'src/index.js',
    'src/main.js',
    'src/app.js',
    'src/server.js',
    'main.go',
    'cmd/main.go',
    'src/main.rs',
    'src/lib.rs',
    'package.json',
    'tsconfig.json',
    'tsup.config.ts',
    'vitest.config.ts',
    'vite.config.ts',
    'webpack.config.js',
    'eslint.config.js',
    '.eslintrc.js',
    '.eslintrc.json',
    'pyproject.toml',
    'Cargo.toml',
    'go.mod',
  ];

  for (const candidate of criticalCandidates) {
    if (await fileExists(join(repoRoot, candidate))) {
      result.criticalPaths.push(candidate);
    }
  }

  // Set primary language
  result.primaryLanguage = hasTypeScript ? 'TypeScript' : (languages[0] ?? 'unknown');

  return result;
}
