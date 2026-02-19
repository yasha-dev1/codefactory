import { join, relative } from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

import { logger } from '../ui/logger.js';
import { withSpinner } from '../ui/spinner.js';
import {
  confirmPrompt,
  selectPrompt,
  multiselectPrompt,
  inputPrompt,
} from '../ui/prompts.js';
import { isGitRepo, getRepoRoot } from '../utils/git.js';
import { fileExists, readFileIfExists } from '../utils/fs.js';
import { NotAGitRepoError } from '../utils/errors.js';
import { ClaudeRunner } from '../core/claude-runner.js';
import { FileWriter } from '../core/file-writer.js';
import { loadHarnessConfig, saveHarnessConfig } from '../core/config.js';
import type { HarnessConfig } from '../core/config.js';
import {
  runHeuristicDetection,
  runFullDetection,
} from '../core/detector.js';
import type { DetectionResult, HeuristicResult } from '../core/detector.js';
import { getHarnessModules } from '../harnesses/index.js';
import type {
  HarnessContext,
  HarnessOutput,
  UserPreferences,
} from '../harnesses/types.js';

const execAsync = promisify(exec);

export interface InitOptions {
  skipDetection?: boolean;
  dryRun?: boolean;
}

// Mapping from harness name to npm script entries
const HARNESS_SCRIPTS: Record<string, Record<string, string>> = {
  'risk-policy-gate': {
    'harness:risk-tier': 'npx ts-node scripts/risk-policy-gate.ts',
  },
  'risk-contract': {
    'harness:smoke': 'npx ts-node scripts/harness-smoke.ts',
  },
  'browser-evidence': {
    'harness:ui:capture-browser-evidence':
      'npx ts-node scripts/harness-ui-capture-browser-evidence.ts',
    'harness:ui:verify-browser-evidence':
      'npx ts-node scripts/harness-ui-verify-browser-evidence.ts',
    'harness:ui:pre-pr':
      'npm run harness:ui:capture-browser-evidence && npm run harness:ui:verify-browser-evidence',
  },
  'garbage-collection': {
    'harness:weekly-metrics': 'npx ts-node scripts/harness-weekly-metrics.ts',
  },
};

export async function initCommand(options: InitOptions): Promise<void> {
  // ── 1. Pre-flight checks ─────────────────────────────────────────────
  if (!(await isGitRepo())) {
    throw new NotAGitRepoError();
  }

  const repoRoot = await getRepoRoot();

  logger.header('CodeFactory - Harness Engineering Setup');
  logger.dim(
    'This wizard will analyze your repository and generate harness engineering artifacts.',
  );
  console.log();

  // Check for existing config
  const existingConfig = await loadHarnessConfig(repoRoot);
  if (existingConfig) {
    logger.warn('An existing harness.config.json was found in this repository.');
    const overwrite = await confirmPrompt(
      'Do you want to overwrite the existing configuration?',
      false,
    );
    if (!overwrite) {
      logger.info('Init cancelled. Existing configuration preserved.');
      return;
    }
  }

  // ── 2. Detection phase ───────────────────────────────────────────────
  const heuristics = await withSpinner(
    'Running heuristic analysis...',
    () => runHeuristicDetection(repoRoot),
  );

  let detection: DetectionResult;

  if (!options.skipDetection) {
    const runner = new ClaudeRunner({ cwd: repoRoot });
    detection = await withSpinner(
      'Analyzing repository with Claude (deep detection)...',
      () => runFullDetection(repoRoot, runner),
    );
  } else {
    detection = heuristicToDetectionResult(heuristics);
  }

  // ── 3. User preferences ──────────────────────────────────────────────
  displayDetectionSummary(detection);

  const detectionOk = await confirmPrompt(
    'Does this detection look correct?',
    true,
  );
  if (!detectionOk) {
    detection = await correctDetection(detection);
  }

  const ciProvider = await selectPrompt<UserPreferences['ciProvider']>(
    'Which CI provider do you use?',
    [
      { name: 'GitHub Actions', value: 'github-actions' },
      { name: 'GitLab CI', value: 'gitlab-ci' },
      { name: 'Bitbucket Pipelines', value: 'bitbucket' },
    ],
  );

  // Build harness selection list
  const tempCtx: HarnessContext = {
    repoRoot,
    detection,
    runner: new ClaudeRunner({ cwd: repoRoot }),
    fileWriter: new FileWriter(),
    userPreferences: {
      ciProvider,
      strictnessLevel: 'standard',
      selectedHarnesses: [],
    },
    previousOutputs: new Map(),
  };

  const allHarnesses = getHarnessModules();
  const harnessChoices = allHarnesses.map((h) => ({
    name: `${h.displayName} - ${h.description}`,
    value: h.name,
    checked: h.isApplicable(tempCtx),
  }));

  const selectedHarnesses = await multiselectPrompt<string>(
    'Select harnesses to install:',
    harnessChoices,
  );

  if (selectedHarnesses.length === 0) {
    logger.warn('No harnesses selected. Nothing to generate.');
    return;
  }

  // Critical paths
  console.log();
  if (detection.criticalPaths.length > 0) {
    logger.info('Auto-detected critical paths:');
    for (const p of detection.criticalPaths) {
      logger.dim(`  - ${p}`);
    }
  }

  const editPaths = await confirmPrompt(
    'Would you like to add or modify critical paths?',
    false,
  );
  let customCriticalPaths: string[] | undefined;
  if (editPaths) {
    const pathInput = await inputPrompt(
      'Enter additional critical paths (comma-separated):',
    );
    const extra = pathInput
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    customCriticalPaths = [...detection.criticalPaths, ...extra];
  }

  const strictnessLevel = await selectPrompt<UserPreferences['strictnessLevel']>(
    'Strictness level for harness rules:',
    [
      { name: 'Relaxed - warnings only, no blocking', value: 'relaxed' },
      { name: 'Standard - block on high-risk, warn on medium', value: 'standard' },
      { name: 'Strict - block on medium and high-risk', value: 'strict' },
    ],
  );

  const userPreferences: UserPreferences = {
    ciProvider,
    strictnessLevel,
    selectedHarnesses,
    customCriticalPaths,
  };

  // Dry-run bail-out
  if (options.dryRun) {
    displayDryRun(detection, userPreferences, allHarnesses);
    return;
  }

  // ── 4. Harness execution ─────────────────────────────────────────────
  const runner = new ClaudeRunner({ cwd: repoRoot });
  const fileWriter = new FileWriter();
  const previousOutputs = new Map<string, HarnessOutput>();

  const ctx: HarnessContext = {
    repoRoot,
    detection,
    runner,
    fileWriter,
    userPreferences,
    previousOutputs,
  };

  console.log();
  logger.header('Generating harness artifacts');

  const selectedModules = allHarnesses.filter((h) =>
    selectedHarnesses.includes(h.name),
  );

  for (const harness of selectedModules) {
    try {
      const output = await withSpinner(
        `Generating ${harness.displayName}...`,
        () => harness.execute(ctx),
      );

      previousOutputs.set(harness.name, output);

      for (const f of output.filesCreated) {
        logger.fileCreated(relative(repoRoot, f));
      }
      for (const f of output.filesModified) {
        logger.fileModified(relative(repoRoot, f));
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Harness "${harness.displayName}" failed: ${msg}`);
      logger.dim('  Continuing with remaining harnesses...');
    }
  }

  // ── 5. Add npm scripts to target repo's package.json ─────────────────
  await addHarnessScripts(repoRoot, selectedHarnesses, fileWriter);

  // ── 6. Save harness config ───────────────────────────────────────────
  const config: HarnessConfig = {
    version: '1.0.0',
    repoRoot,
    detection: {
      primaryLanguage: detection.primaryLanguage,
      framework: detection.framework,
      packageManager: detection.packageManager,
      ciProvider: detection.ciProvider,
      monorepo: detection.monorepo,
    },
    harnesses: selectedModules.map((h) => {
      const output = previousOutputs.get(h.name);
      return {
        name: h.name,
        enabled: true,
        generatedAt: new Date().toISOString(),
        files: output
          ? [...output.filesCreated, ...output.filesModified]
          : [],
      };
    }),
    generatedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  };

  await saveHarnessConfig(repoRoot, config);
  logger.fileCreated('harness.config.json');

  // ── 7. Summary ───────────────────────────────────────────────────────
  console.log();
  logger.header('Summary');

  const allCreated = fileWriter.getCreatedFiles();
  const allModified = fileWriter.getModifiedFiles();

  if (allCreated.length > 0) {
    logger.success(`Files created (${allCreated.length}):`);
    for (const f of allCreated) {
      logger.dim(`  + ${relative(repoRoot, f)}`);
    }
  }

  if (allModified.length > 0) {
    logger.success(`Files modified (${allModified.length}):`);
    for (const f of allModified) {
      logger.dim(`  ~ ${relative(repoRoot, f)}`);
    }
  }

  // Useful command set
  console.log();
  logger.info('Useful commands:');
  logger.dim('  npm run typecheck');
  logger.dim('  npm test');
  logger.dim('  npm run build');

  if (selectedHarnesses.includes('risk-contract')) {
    logger.dim('  npm run harness:smoke');
  }
  if (selectedHarnesses.includes('browser-evidence') && detection.hasUIComponents) {
    logger.dim('  npm run harness:ui:pre-pr');
  }
  if (selectedHarnesses.includes('risk-policy-gate')) {
    logger.dim('  npm run harness:risk-tier');
  }
  if (selectedHarnesses.includes('garbage-collection')) {
    logger.dim('  npm run harness:weekly-metrics');
  }

  // Offer to commit
  console.log();
  const shouldCommit = await confirmPrompt(
    'Would you like to create a git commit with the generated files?',
    true,
  );

  if (shouldCommit) {
    try {
      const allFiles = [...allCreated, ...allModified, join(repoRoot, 'harness.config.json')];
      const relativePaths = allFiles.map((f) => relative(repoRoot, f));
      const uniquePaths = [...new Set(relativePaths)];

      await execAsync(
        `git add ${uniquePaths.map((p) => `"${p}"`).join(' ')}`,
        { cwd: repoRoot },
      );
      await execAsync(
        `git commit -m "chore: initialize harness engineering with CodeFactory"`,
        { cwd: repoRoot },
      );
      logger.success('Created commit: chore: initialize harness engineering with CodeFactory');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Git commit failed: ${msg}`);
      logger.dim('  You can commit the changes manually.');
    }
  }

  // Next steps
  console.log();
  logger.header('Next steps');
  logger.info(
    '1. Review the generated CLAUDE.md and harness.config.json files.',
  );
  logger.info(
    '2. Run "npm run harness:smoke" to verify the harness setup works.',
  );
  logger.info(
    '3. Open a PR with these changes and observe the CI harness checks.',
  );
  logger.info(
    '4. Customize risk tiers and policies in harness.config.json as needed.',
  );
  console.log();
  logger.success('Harness engineering setup complete!');
}

// ── Helper functions ──────────────────────────────────────────────────────

function heuristicToDetectionResult(h: HeuristicResult): DetectionResult {
  return {
    primaryLanguage: h.languages[0] ?? 'unknown',
    framework: h.framework,
    packageManager: h.packageManager,
    testFramework: null,
    linter: null,
    formatter: null,
    typeChecker: h.hasTypeScript ? 'TypeScript' : null,
    buildTool: null,
    ciProvider: h.ciProvider,
    existingDocs: h.existingDocs,
    existingClaude: h.existingClaude,
    architecturalLayers: [],
    monorepo: h.monorepoIndicators,
    testCommand: null,
    buildCommand: null,
    lintCommand: null,
    hasUIComponents: false,
    criticalPaths: [],
  };
}

function displayDetectionSummary(d: DetectionResult): void {
  console.log();
  logger.info('Detection results:');
  logger.dim(`  Language:        ${d.primaryLanguage}`);
  if (d.framework) logger.dim(`  Framework:       ${d.framework}`);
  if (d.packageManager) logger.dim(`  Package manager: ${d.packageManager}`);
  if (d.testFramework) logger.dim(`  Test framework:  ${d.testFramework}`);
  if (d.linter) logger.dim(`  Linter:          ${d.linter}`);
  if (d.formatter) logger.dim(`  Formatter:       ${d.formatter}`);
  if (d.typeChecker) logger.dim(`  Type checker:    ${d.typeChecker}`);
  if (d.buildTool) logger.dim(`  Build tool:      ${d.buildTool}`);
  if (d.ciProvider) logger.dim(`  CI provider:     ${d.ciProvider}`);
  logger.dim(`  Monorepo:        ${d.monorepo ? 'yes' : 'no'}`);
  logger.dim(`  UI components:   ${d.hasUIComponents ? 'yes' : 'no'}`);
  if (d.existingClaude) logger.dim('  Existing CLAUDE.md detected');
  console.log();
}

async function correctDetection(d: DetectionResult): Promise<DetectionResult> {
  const corrected = { ...d };

  const language = await inputPrompt(
    'Primary language:',
    d.primaryLanguage,
  );
  corrected.primaryLanguage = language;

  const framework = await inputPrompt(
    'Framework (leave empty for none):',
    d.framework ?? '',
  );
  corrected.framework = framework || null;

  const testFramework = await inputPrompt(
    'Test framework (leave empty for none):',
    d.testFramework ?? '',
  );
  corrected.testFramework = testFramework || null;

  return corrected;
}

async function addHarnessScripts(
  repoRoot: string,
  selectedHarnesses: string[],
  fileWriter: FileWriter,
): Promise<void> {
  const packageJsonPath = join(repoRoot, 'package.json');
  const raw = await readFileIfExists(packageJsonPath);
  if (!raw) return;

  try {
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    const scripts = (pkg.scripts as Record<string, string>) ?? {};

    for (const harnessName of selectedHarnesses) {
      const harnessScripts = HARNESS_SCRIPTS[harnessName];
      if (harnessScripts) {
        Object.assign(scripts, harnessScripts);
      }
    }

    pkg.scripts = scripts;
    await fileWriter.write(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
  } catch {
    logger.warn('Could not update package.json with harness scripts.');
  }
}

function displayDryRun(
  detection: DetectionResult,
  prefs: UserPreferences,
  allHarnesses: { name: string; displayName: string }[],
): void {
  console.log();
  logger.header('Dry Run - What would be generated');

  logger.info(`CI provider: ${prefs.ciProvider}`);
  logger.info(`Strictness: ${prefs.strictnessLevel}`);
  console.log();

  logger.info('Selected harnesses:');
  const selectedModules = allHarnesses.filter((h) =>
    prefs.selectedHarnesses.includes(h.name),
  );
  for (const h of selectedModules) {
    logger.dim(`  - ${h.displayName}`);
  }

  console.log();
  logger.info('Scripts that would be added to package.json:');
  for (const harnessName of prefs.selectedHarnesses) {
    const scripts = HARNESS_SCRIPTS[harnessName];
    if (scripts) {
      for (const [key, val] of Object.entries(scripts)) {
        logger.dim(`  "${key}": "${val}"`);
      }
    }
  }

  console.log();
  logger.info('No files were written (dry-run mode).');
}
