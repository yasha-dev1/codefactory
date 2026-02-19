import type { DetectionResult, UserPreferences } from './types.js';

/**
 * Prompt for generating custom architectural linter scripts.
 */
export function buildArchitecturalLintersPrompt(
  detection: DetectionResult,
  prefs: UserPreferences,
): string {
  const layers = detection.architecturalLayers;
  const hasLayers = layers.length > 0;
  const layerList = hasLayers
    ? layers.map((l) => `  - ${l}`).join('\n')
    : '  - (analyze the codebase to identify layers)';

  return `Generate architectural linter scripts that enforce dependency direction and module boundary rules for this ${detection.primaryLanguage} project.

## Detected Stack Context

- **Language**: ${detection.primaryLanguage}
- **Framework**: ${detection.framework ?? 'none'}
- **Monorepo**: ${detection.monorepo}
- **Strictness**: ${prefs.strictnessLevel}
- **Architectural Layers**:
${layerList}

## Files to Generate

### 1. scripts/lint-architecture.ts

A TypeScript script (runnable with \`npx tsx\` or \`npx ts-node\`) that enforces architectural boundaries by analyzing import/dependency relationships in the source code.

#### Core Data Structures

\`\`\`typescript
interface LayerRule {
  name: string;
  patterns: string[];      // glob patterns matching files in this layer
  canDependOn: string[];   // layer names this layer is allowed to import from
}

interface Violation {
  file: string;
  line: number;
  importPath: string;
  fromLayer: string;
  toLayer: string;
  rule: string;            // human-readable description of the violated rule
}

interface LintResult {
  violations: Violation[];
  filesScanned: number;
  layerCounts: Record<string, number>;  // files per layer
}
\`\`\`

#### Implementation Requirements

1. **Define layer boundaries**: Based on the detected architectural layers, map directory patterns to layer names. ${hasLayers ? `Use these layers: ${layers.join(', ')}.` : 'Analyze the codebase directory structure to determine layers.'}

2. **File discovery**: Use fast-glob to find all source files, respecting .gitignore patterns. Skip:
   - \`node_modules/\`, \`dist/\`, \`build/\`, \`.git/\`
   - Generated files, test fixtures, and vendor directories
   - Files matching patterns in \`.gitignore\`

3. **Import extraction**: Parse source files to extract import statements using regex (no AST dependency needed):
   - For TypeScript/JavaScript:
     - \`import { X } from 'path'\` and \`import X from 'path'\`
     - \`import type { X } from 'path'\` (type-only imports can optionally be excluded)
     - \`require('path')\`
     - Dynamic \`import('path')\`
   - For Python:
     - \`import module\` and \`from module import name\`
     - Relative imports (\`from . import\`, \`from .. import\`)
   - For Go:
     - \`import "path"\` and multi-line \`import (\n  "path"\n)\`

4. **Dependency direction rules**: For each import, determine the source and target layers and check if the dependency is allowed.

   Default rules (customize based on detected layers):
${hasLayers ? layers.map((layer, i) => {
    const canImportFrom = layers.filter((_, j) => j > i).concat(['shared', 'utils']);
    return `   - **${layer}**: Can depend on [${canImportFrom.join(', ')}]`;
  }).join('\n') :
  `   - Presentation/API → Application/Services (allowed)
   - Application/Services → Domain/Models (allowed)
   - Domain/Models → (no dependencies on other layers — pure domain)
   - Infrastructure → Domain/Models (allowed)
   - Any layer → Shared/Utils (allowed)
   - No reverse dependencies (e.g., Domain must not import from Presentation)`}

5. **Exemption handling**: Support an inline exemption comment:
   - \`// arch-exempt: <reason>\` (TypeScript/JavaScript)
   - \`# arch-exempt: <reason>\` (Python)
   - Lines with this comment are skipped during violation checking

6. **Output formats**:
   - Default (human-readable): Print each violation with file path, line number, import, and rule description
   - \`--json\` flag: Output a JSON array of Violation objects for CI integration
   - \`--summary\` flag: Output only the count of violations per layer pair

7. **Exit codes**:
   - 0: No violations found
   - 1: Violations found (with details printed)
   - 2: Configuration or runtime error

#### Script CLI

\`\`\`
Usage: npx tsx scripts/lint-architecture.ts [options]

Options:
  --json       Output violations as JSON
  --summary    Output violation summary only
  --fix        Suggest fixes for each violation (print refactoring hints)
  --verbose    Print all scanned files and their layer assignments
\`\`\`

### 2. scripts/lint-architecture-config.json (optional)

If the layer rules are complex, externalize them to a config file:

\`\`\`json
{
  "layers": [
${hasLayers ? layers.map(l => `    { "name": "${l}", "patterns": ["src/${l}/**"], "canDependOn": [] }`).join(',\n') :
  '    { "name": "example", "patterns": ["src/example/**"], "canDependOn": ["shared"] }'}
  ],
  "ignorePatterns": ["**/*.test.*", "**/*.spec.*", "**/fixtures/**"],
  "exemptComment": "arch-exempt"
}
\`\`\`

The script should read this config file if it exists, otherwise fall back to built-in defaults based on directory structure analysis.

${detection.monorepo ? `### 3. Monorepo Boundary Checks

Since this is a monorepo, also enforce:
- Packages must not import from other packages' internal modules (only from the package's public API / main entry point)
- Shared packages should be explicitly listed as dependencies in each consuming package's package.json
- No circular dependencies between packages
- Detect undeclared cross-package imports` : ''}

## Quality Requirements

- The linter must be fast: under 5 seconds for a typical project (< 1000 source files)
- Use fast-glob for file discovery (already in project dependencies)
- Use line-by-line regex parsing, not AST parsing (zero extra dependencies)
- Provide clear, actionable error messages:
  \`\`\`
  VIOLATION: src/api/routes.ts:15
    Import: ../domain/user-repository
    Rule: "api" layer cannot import from "domain" directly (must go through "services")
    Fix: Move this logic to a service function in src/services/
  \`\`\`
- The layer definitions should be easy to update as the project evolves
- Include inline documentation explaining each rule and why it exists

## Output Format

Return the complete file contents for each file, separated by a comment line with the target file path. Scripts must be immediately runnable with \`npx tsx\`. Do not wrap in markdown code fences.`;
}
