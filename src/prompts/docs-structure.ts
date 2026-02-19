import type { DetectionResult, UserPreferences } from './types.js';

/**
 * Prompt for generating documentation structure files.
 */
export function buildDocsStructurePrompt(
  detection: DetectionResult,
  prefs: UserPreferences,
): string {
  const layers = detection.architecturalLayers;
  const hasLayers = layers.length > 0;

  return `Generate documentation files that describe this project's architecture, conventions, and layer structure. These docs serve as the source of truth for both human developers and AI coding agents.

## Detected Stack Context

- **Language**: ${detection.primaryLanguage}
- **Framework**: ${detection.framework ?? 'none'}
- **Package Manager**: ${detection.packageManager ?? 'none'}
- **Build Tool**: ${detection.buildTool ?? 'none'}
- **Test Framework**: ${detection.testFramework ?? 'none'}
- **Linter**: ${detection.linter ?? 'none'}
- **Formatter**: ${detection.formatter ?? 'none'}
- **Type Checker**: ${detection.typeChecker ?? 'none'}
- **Monorepo**: ${detection.monorepo}
- **Has UI Components**: ${detection.hasUIComponents}
- **Architectural Layers**: ${layers.join(', ') || 'none detected'}
- **Existing Docs**: ${detection.existingDocs.join(', ') || 'none'}
- **Critical Paths**: ${detection.criticalPaths.join(', ') || 'none'}

## Files to Generate

### 1. docs/architecture.md

A comprehensive architecture document. Read the actual source code before writing this — every statement must be verifiable. Include these sections:

#### Project Structure
- Describe the top-level directory layout and the purpose of each directory
- If monorepo (${detection.monorepo}): document the package/app structure and inter-package relationships
- Identify the entry point(s) of the application

#### Architectural Pattern
- Name the architectural pattern (layered, hexagonal, MVC, microservices, modular monolith, etc.)
- Explain WHY this pattern suits the project (infer from the structure)
- Describe the key design principles that guide the architecture

#### Component Diagram
- Create a Mermaid diagram showing component relationships:
\`\`\`mermaid
graph TD
  A[Component A] --> B[Component B]
  B --> C[Component C]
\`\`\`

${hasLayers ? `#### Layer Structure
Based on detected layers (${layers.join(', ')}):
${layers.map(l => `- **${l}**: Describe this layer's responsibility, what it contains, and its allowed dependencies`).join('\n')}

Include an ASCII or Mermaid dependency diagram showing allowed import directions.` :
`#### Directory Organization
- Analyze the source directory structure to identify implicit layer boundaries
- Document the observed organization pattern
- Suggest formal layer boundaries if the structure supports it`}

#### Data Flow
- Describe how a typical request flows through the system from entry to response
- If the project has UI components: describe the rendering/data-fetching flow
- If the project has background jobs or event-driven logic: describe that flow

#### External Dependencies
- List key external services, APIs, or databases the project depends on
- Document how these dependencies are abstracted (clients, adapters, etc.)

#### Architecture Decision Records
- Include a section for ADRs with a template for future decisions
- Reference any existing ADRs if found in the project

**Target length**: ~150-200 lines. Every paragraph must describe the real project, not generic advice.

### 2. docs/conventions.md

A coding conventions document that codifies the project's standards. Read actual source files and config to determine these — do not guess.

#### Naming Conventions
- File naming style (kebab-case, camelCase, PascalCase, snake_case) — observe from existing files
- Variable/function naming (camelCase, snake_case, etc.)
- Class/type naming (PascalCase)
- Constants (UPPER_SNAKE_CASE or other)
- Test file naming (*.test.ts, *_test.go, test_*.py, etc.)

#### Import/Module Organization
- Import ordering (stdlib first, then external, then internal, then relative)
- Barrel export usage (index.ts files)
- Module boundary rules
- For ${detection.primaryLanguage} specifically:
${detection.primaryLanguage === 'typescript' || detection.primaryLanguage === 'javascript' ?
  '  - ESM vs CJS convention\n  - Path alias usage (@/ or ~/)\n  - Type-only import syntax' :
detection.primaryLanguage === 'python' ?
  '  - Absolute vs relative imports\n  - __init__.py conventions\n  - Type stub usage' :
detection.primaryLanguage === 'go' ?
  '  - Package naming conventions\n  - Internal package usage\n  - Interface placement' :
  '  - Language-specific module and import conventions'}

#### Error Handling
- How errors are propagated (exceptions, Result types, error codes)
- Logging conventions
- User-facing vs internal error messages

#### Testing Conventions
- Test file location (co-located vs separate test directory)
- Test naming patterns (describe/it, test_*, Test*, etc.)
- Fixture and mock conventions
- What must be tested (public API) vs what is optional

#### Git Workflow
- Branch naming: \`<type>/<description>\`
- Commit message format: conventional commits
- PR size guidelines
- Merge strategy (squash, rebase, or merge commits)

#### Code Review Standards
- What the automated review agent checks
- What human reviewers should focus on
- When to request changes vs approve with comments

**Target length**: ~100-150 lines.

### 3. docs/layers.md

${hasLayers ? `A focused document about architectural layer boundaries.

#### Layer Definitions

For each layer (${layers.join(', ')}):
- **Purpose**: What this layer is responsible for
- **Contains**: Types of files and constructs
- **Allowed Dependencies**: Which layers this one may import from
- **Forbidden Dependencies**: Which layers must never be imported (and why)
- **Public API**: What this layer exposes to other layers

#### Dependency Matrix

| From \\\\ To | ${layers.join(' | ')} |
|---|${layers.map(() => '---').join('|')}|
${layers.map(from => `| **${from}** | ${layers.map(to => from === to ? '-' : '?').join(' | ')} |`).join('\n')}

Fill in each cell with Y (allowed) or N (forbidden) based on the architectural pattern.

#### Enforcement
- Architectural linter scripts enforce these boundaries in the structural-tests CI job
- Violations fail the build and must be fixed before merge
- To request an exemption, add a comment: \`// arch-exempt: <reason>\`

#### Common Violations and Fixes
- List the most common boundary violations
- Provide refactoring examples showing how to move logic to the correct layer` :

`Since no formal layers were detected, this document should:
- Analyze the existing directory structure to identify implicit boundaries
- Propose reasonable layer definitions based on observed organization
- Define dependency direction rules for the proposed layers
- Provide guidance on evolving toward a more structured layered architecture`}

**Target length**: ~80-120 lines.

## Quality Requirements

- Each document must be self-contained and readable independently
- Use clear headings, bullet points, and tables for scannability
- Include actual code examples from the project where they clarify a convention
- Reference harness.config.json risk tiers where relevant
- Language must be precise and authoritative — these docs are the project's law
- Read existing documentation (${detection.existingDocs.join(', ') || 'none'}) first to avoid contradicting established patterns
- Do NOT generate placeholder or example content — everything must reflect the real project

## Output Format

Return the complete markdown content for each file, separated by a comment line with the target file path (e.g., \`<!-- FILE: docs/architecture.md -->\`). Do not wrap in additional markdown code fences.`;
}
