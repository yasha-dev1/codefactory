import { z } from 'zod';
import { join } from 'node:path';
import { fileExists, readFileIfExists, getDirectoryTree } from '../utils/fs.js';
import type { ClaudeRunner } from './claude-runner.js';

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

const detectionResultSchema = z.object({
  primaryLanguage: z.string(),
  framework: z.string().nullable(),
  packageManager: z.string().nullable(),
  testFramework: z.string().nullable(),
  linter: z.string().nullable(),
  formatter: z.string().nullable(),
  typeChecker: z.string().nullable(),
  buildTool: z.string().nullable(),
  ciProvider: z.string().nullable(),
  existingDocs: z.array(z.string()),
  existingClaude: z.boolean(),
  architecturalLayers: z.array(z.string()),
  monorepo: z.boolean(),
  testCommand: z.string().nullable(),
  buildCommand: z.string().nullable(),
  lintCommand: z.string().nullable(),
  hasUIComponents: z.boolean(),
  criticalPaths: z.array(z.string()),
});

export interface HeuristicResult {
  languages: string[];
  framework: string | null;
  packageManager: string | null;
  hasTypeScript: boolean;
  ciProvider: string | null;
  existingClaude: boolean;
  existingDocs: string[];
  monorepoIndicators: boolean;
}

export async function runHeuristicDetection(repoRoot: string): Promise<HeuristicResult> {
  const result: HeuristicResult = {
    languages: [],
    framework: null,
    packageManager: null,
    hasTypeScript: false,
    ciProvider: null,
    existingClaude: false,
    existingDocs: [],
    monorepoIndicators: false,
  };

  // Node.js / JavaScript / TypeScript
  const packageJsonPath = join(repoRoot, 'package.json');
  if (await fileExists(packageJsonPath)) {
    result.languages.push('JavaScript');
    const raw = await readFileIfExists(packageJsonPath);
    if (raw) {
      try {
        const pkg = JSON.parse(raw) as Record<string, unknown>;
        const deps = {
          ...(pkg.dependencies as Record<string, string> | undefined),
          ...(pkg.devDependencies as Record<string, string> | undefined),
        };

        if (deps.next) result.framework = 'Next.js';
        else if (deps.react) result.framework = 'React';
        else if (deps.vue) result.framework = 'Vue';
        else if (deps.svelte || deps['@sveltejs/kit']) result.framework = 'Svelte';
        else if (deps.angular || deps['@angular/core']) result.framework = 'Angular';
        else if (deps.express) result.framework = 'Express';
        else if (deps.fastify) result.framework = 'Fastify';
        else if (deps.nest || deps['@nestjs/core']) result.framework = 'NestJS';

        // Package manager detection
        if (await fileExists(join(repoRoot, 'pnpm-lock.yaml'))) result.packageManager = 'pnpm';
        else if (await fileExists(join(repoRoot, 'yarn.lock'))) result.packageManager = 'yarn';
        else if (await fileExists(join(repoRoot, 'bun.lockb'))) result.packageManager = 'bun';
        else if (await fileExists(join(repoRoot, 'package-lock.json')))
          result.packageManager = 'npm';

        // Monorepo indicators
        if (pkg.workspaces || (await fileExists(join(repoRoot, 'pnpm-workspace.yaml')))) {
          result.monorepoIndicators = true;
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  // TypeScript
  if (await fileExists(join(repoRoot, 'tsconfig.json'))) {
    result.hasTypeScript = true;
    if (!result.languages.includes('TypeScript')) {
      result.languages.push('TypeScript');
    }
  }

  // Python
  if (
    (await fileExists(join(repoRoot, 'pyproject.toml'))) ||
    (await fileExists(join(repoRoot, 'setup.py'))) ||
    (await fileExists(join(repoRoot, 'requirements.txt')))
  ) {
    result.languages.push('Python');
    if (await fileExists(join(repoRoot, 'pyproject.toml'))) {
      const raw = await readFileIfExists(join(repoRoot, 'pyproject.toml'));
      if (raw) {
        if (raw.includes('django')) result.framework = 'Django';
        else if (raw.includes('fastapi')) result.framework = 'FastAPI';
        else if (raw.includes('flask')) result.framework = 'Flask';
      }
    }
  }

  // Go
  if (await fileExists(join(repoRoot, 'go.mod'))) {
    result.languages.push('Go');
  }

  // Rust
  if (await fileExists(join(repoRoot, 'Cargo.toml'))) {
    result.languages.push('Rust');
  }

  // CI detection
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

  // Existing CLAUDE.md
  if (await fileExists(join(repoRoot, 'CLAUDE.md'))) {
    result.existingClaude = true;
  }

  // Existing docs
  const docPaths = ['README.md', 'CONTRIBUTING.md', 'docs', 'CHANGELOG.md', 'ARCHITECTURE.md'];
  for (const docPath of docPaths) {
    if (await fileExists(join(repoRoot, docPath))) {
      result.existingDocs.push(docPath);
    }
  }

  return result;
}

export async function runFullDetection(
  repoRoot: string,
  runner: ClaudeRunner,
): Promise<DetectionResult> {
  const heuristics = await runHeuristicDetection(repoRoot);
  const tree = await getDirectoryTree(repoRoot, { maxDepth: 3 });

  const prompt = `Analyze this repository and provide a complete detection result.

## Heuristic Detection Results
${JSON.stringify(heuristics, null, 2)}

## Directory Tree
${tree}

## Repository Root
${repoRoot}

Examine the repository files to determine:
1. Primary language and framework
2. Package manager, build tool, test framework, linter, formatter, type checker
3. CI/CD provider
4. Existing documentation files
5. Whether CLAUDE.md exists
6. Architectural layers (e.g., "api", "database", "frontend", "services")
7. Whether this is a monorepo
8. Commands for test, build, lint
9. Whether the project has UI components
10. Critical file paths (entry points, config files, core business logic)

Return a JSON object matching the DetectionResult schema.`;

  return runner.analyze<DetectionResult>(prompt, detectionResultSchema);
}
