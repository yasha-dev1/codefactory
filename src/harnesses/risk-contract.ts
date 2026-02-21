import { join } from 'node:path';

import type { HarnessModule, HarnessContext, HarnessOutput } from './types.js';

export const riskContractHarness: HarnessModule = {
  name: 'risk-contract',
  displayName: 'Risk Contract',
  description:
    'Generates harness.config.json with risk tier rules, merge policies, and evidence requirements',
  order: 1,

  isApplicable(): boolean {
    return true;
  },

  async execute(ctx: HarnessContext): Promise<HarnessOutput> {
    const snap = ctx.fileWriter.snapshot();
    const { detection, userPreferences } = ctx;

    // ── Build tier3 patterns from detection + user preferences ───────────
    const tier3Patterns = [
      ...detection.criticalPaths,
      ...(userPreferences.customCriticalPaths ?? []),
    ];

    // ── Build architectural boundaries ───────────────────────────────────
    const boundaries: Record<string, { allowedImports: string[] }> = {};
    const layers = detection.architecturalLayers;
    const hasUtils = layers.includes('utils');

    for (const layer of layers) {
      if (layer === 'utils') {
        boundaries[layer] = { allowedImports: [] };
      } else {
        boundaries[layer] = { allowedImports: hasUtils ? ['utils'] : [] };
      }
    }

    // ── Build commands ───────────────────────────────────────────────────
    const commands: Record<string, string> = {};
    if (detection.testCommand) commands.test = detection.testCommand;
    if (detection.buildCommand) commands.build = detection.buildCommand;
    if (detection.lintCommand) commands.lint = detection.lintCommand;
    if (detection.typeChecker) {
      const pm = detection.packageManager ?? 'npm';
      commands.typeCheck = `${pm} run typecheck`;
    }

    // ── Assemble the config object ───────────────────────────────────────
    const config = {
      version: '1.0.0',
      repoRoot: ctx.repoRoot,
      detection: {
        primaryLanguage: detection.primaryLanguage,
        framework: detection.framework,
        packageManager: detection.packageManager,
        ciProvider: detection.ciProvider,
        monorepo: detection.monorepo,
      },
      riskTiers: {
        tier1: {
          name: 'low',
          patterns: ['docs/**', '*.md', '**/*.md'],
          requiredChecks: ['lint'],
          mergePolicy: 'auto',
          evidenceRequirements: ['lint-clean'],
        },
        tier2: {
          name: 'medium',
          patterns: ['src/**', 'tests/**'],
          requiredChecks: ['lint', 'type-check', 'test', 'build'],
          mergePolicy: 'review-agent',
          evidenceRequirements: ['tests-pass', 'lint-clean', 'type-check-clean'],
        },
        tier3: {
          name: 'high',
          patterns: tier3Patterns,
          requiredChecks: [
            'lint',
            'type-check',
            'test',
            'build',
            'structural-tests',
            'harness-smoke',
            'manual-approval',
          ],
          mergePolicy: 'review-agent + manual',
          evidenceRequirements: ['tests-pass', 'lint-clean', 'type-check-clean', 'manual-review'],
        },
      },
      commands,
      shaDiscipline: {
        enabled: true,
        description: 'All CI gates pin to exact commit SHA from the risk policy gate',
      },
      architecturalBoundaries: boundaries,
      harnesses: [],
      generatedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    const content = JSON.stringify(config, null, 2) + '\n';
    await ctx.fileWriter.write(join(ctx.repoRoot, 'harness.config.json'), content);

    const diff = ctx.fileWriter.diffSince(snap);

    const output: HarnessOutput = {
      harnessName: 'risk-contract',
      filesCreated: diff.created,
      filesModified: diff.modified,
      metadata: {
        configPath: 'harness.config.json',
      },
    };

    ctx.previousOutputs.set('risk-contract', output);

    return output;
  },
};
