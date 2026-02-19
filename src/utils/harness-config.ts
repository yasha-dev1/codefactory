import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { fileExists } from './fs.js';

// --- Types for the raw harness.config.json structure ---

export interface RiskTierDefinition {
  name: string;
  description: string;
  patterns: string[];
  requiredChecks: string[];
  mergePolicy: {
    minApprovals: number;
    requireReviewAgent: boolean;
    allowSelfMerge: boolean;
  };
  evidenceRequirements: string[];
}

export interface DocsDriftConfig {
  trackedDocs: string[];
  maxStaleDays: number;
  requireUpdateWithCodeChange: boolean;
  exemptPatterns: string[];
}

export interface ShaDisciplineConfig {
  enforceExactSha: boolean;
  rejectStaleReviews: boolean;
}

export interface ArchitecturalBoundary {
  allowedImports: string[];
}

export interface RawHarnessConfig {
  version: string;
  riskTiers: {
    tier1: RiskTierDefinition;
    tier2: RiskTierDefinition;
    tier3: RiskTierDefinition;
  };
  commands: {
    test: string;
    build: string;
    lint: string;
    typeCheck: string;
  };
  docsDrift: DocsDriftConfig;
  shaDiscipline: ShaDisciplineConfig;
  architecturalBoundaries: Record<string, ArchitecturalBoundary>;
  monorepo: {
    enabled: boolean;
    packages: string[];
    sharedChecks: string[];
  };
}

// --- Extracted structures for consumers ---

export interface TierPatterns {
  tier: 1 | 2 | 3;
  name: string;
  patterns: string[];
  requiredChecks: string[];
}

export interface RiskClassification {
  tiers: [TierPatterns, TierPatterns, TierPatterns];
  docsDrift: DocsDriftConfig;
  shaDiscipline: ShaDisciplineConfig;
  commands: RawHarnessConfig['commands'];
}

// --- Defaults ---

const DEFAULT_TIER1: RiskTierDefinition = {
  name: 'low',
  description: 'Documentation and non-code changes',
  patterns: ['**/*.md', '**/*.txt', 'LICENSE', '.gitignore', '.editorconfig', '.prettierrc*', '.vscode/**'],
  requiredChecks: ['lint'],
  mergePolicy: { minApprovals: 0, requireReviewAgent: false, allowSelfMerge: true },
  evidenceRequirements: [],
};

const DEFAULT_TIER2: RiskTierDefinition = {
  name: 'medium',
  description: 'Source code and non-critical configuration',
  patterns: ['src/**/*.ts', 'tests/**/*.ts'],
  requiredChecks: ['lint', 'type-check', 'test', 'review-agent'],
  mergePolicy: { minApprovals: 1, requireReviewAgent: true, allowSelfMerge: false },
  evidenceRequirements: ['tests-pass', 'lint-clean', 'type-check-clean'],
};

const DEFAULT_TIER3: RiskTierDefinition = {
  name: 'high',
  description: 'Entry points, core engine, and build infrastructure',
  patterns: ['package.json', 'tsconfig.json'],
  requiredChecks: ['lint', 'type-check', 'test', 'review-agent', 'manual-review'],
  mergePolicy: { minApprovals: 1, requireReviewAgent: true, allowSelfMerge: false },
  evidenceRequirements: ['tests-pass', 'lint-clean', 'type-check-clean', 'manual-review'],
};

const DEFAULT_DOCS_DRIFT: DocsDriftConfig = {
  trackedDocs: ['README.md'],
  maxStaleDays: 30,
  requireUpdateWithCodeChange: false,
  exemptPatterns: ['tests/**', '**/*.test.ts', '**/*.spec.ts', 'dist/**'],
};

const DEFAULT_SHA_DISCIPLINE: ShaDisciplineConfig = {
  enforceExactSha: true,
  rejectStaleReviews: true,
};

const DEFAULT_COMMANDS: RawHarnessConfig['commands'] = {
  test: 'npm test',
  build: 'npm run build',
  lint: 'npm run lint',
  typeCheck: 'npm run typecheck',
};

// --- Validation helpers ---

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isValidTierDef(value: unknown): value is RiskTierDefinition {
  if (!isObject(value)) return false;
  return typeof value.name === 'string' && isStringArray(value.patterns) && isStringArray(value.requiredChecks);
}

/**
 * Validates the raw parsed JSON has the minimum expected structure.
 * Returns the config if valid, null otherwise.
 */
function validateConfig(raw: unknown): RawHarnessConfig | null {
  if (!isObject(raw)) return null;
  if (typeof raw.version !== 'string') return null;

  const tiers = raw.riskTiers;
  if (!isObject(tiers)) return null;
  if (!isValidTierDef(tiers.tier1) || !isValidTierDef(tiers.tier2) || !isValidTierDef(tiers.tier3)) {
    return null;
  }

  return raw as unknown as RawHarnessConfig;
}

// --- Public API ---

const CONFIG_FILENAME = 'harness.config.json';

/**
 * Reads and validates harness.config.json from the given repo root.
 * Returns the fully parsed config, or null if missing/malformed.
 */
export async function readRawHarnessConfig(repoRoot: string): Promise<RawHarnessConfig | null> {
  const configPath = join(repoRoot, CONFIG_FILENAME);

  if (!(await fileExists(configPath))) {
    return null;
  }

  try {
    const raw = await readFile(configPath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    return validateConfig(parsed);
  } catch {
    return null;
  }
}

/**
 * Extracts risk classification data from harness.config.json.
 * Falls back to sensible defaults if the config is missing or malformed.
 */
export async function loadRiskClassification(repoRoot: string): Promise<RiskClassification> {
  const config = await readRawHarnessConfig(repoRoot);

  if (config) {
    return {
      tiers: [
        { tier: 1, name: config.riskTiers.tier1.name, patterns: config.riskTiers.tier1.patterns, requiredChecks: config.riskTiers.tier1.requiredChecks },
        { tier: 2, name: config.riskTiers.tier2.name, patterns: config.riskTiers.tier2.patterns, requiredChecks: config.riskTiers.tier2.requiredChecks },
        { tier: 3, name: config.riskTiers.tier3.name, patterns: config.riskTiers.tier3.patterns, requiredChecks: config.riskTiers.tier3.requiredChecks },
      ],
      docsDrift: config.docsDrift ?? DEFAULT_DOCS_DRIFT,
      shaDiscipline: config.shaDiscipline ?? DEFAULT_SHA_DISCIPLINE,
      commands: config.commands ?? DEFAULT_COMMANDS,
    };
  }

  // Fallback to defaults
  return {
    tiers: [
      { tier: 1, name: DEFAULT_TIER1.name, patterns: DEFAULT_TIER1.patterns, requiredChecks: DEFAULT_TIER1.requiredChecks },
      { tier: 2, name: DEFAULT_TIER2.name, patterns: DEFAULT_TIER2.patterns, requiredChecks: DEFAULT_TIER2.requiredChecks },
      { tier: 3, name: DEFAULT_TIER3.name, patterns: DEFAULT_TIER3.patterns, requiredChecks: DEFAULT_TIER3.requiredChecks },
    ],
    docsDrift: DEFAULT_DOCS_DRIFT,
    shaDiscipline: DEFAULT_SHA_DISCIPLINE,
    commands: DEFAULT_COMMANDS,
  };
}

/**
 * Matches a file path against a glob pattern.
 * Supports: ** (any depth), * (single segment), ? (single char).
 */
export function matchGlob(file: string, pattern: string): boolean {
  let regex = '^';
  let i = 0;

  while (i < pattern.length) {
    const char = pattern[i];
    const next = pattern[i + 1];

    if (char === '*' && next === '*') {
      if (pattern[i + 2] === '/') {
        regex += '(.+/)?';
        i += 3;
      } else {
        regex += '.*';
        i += 2;
      }
    } else if (char === '*') {
      regex += '[^/]*';
      i++;
    } else if (char === '?') {
      regex += '[^/]';
      i++;
    } else if ('.+()[]{}^$|\\'.includes(char)) {
      regex += '\\' + char;
      i++;
    } else {
      regex += char;
      i++;
    }
  }

  regex += '$';
  return new RegExp(regex).test(file);
}

/**
 * Classifies a file into a risk tier (1, 2, or 3) based on the given patterns.
 * Checks highest tier first. Returns 2 as default for unmatched files.
 */
export function classifyFile(file: string, tiers: TierPatterns[]): 1 | 2 | 3 {
  // Check in descending order so highest tier wins
  const sorted = [...tiers].sort((a, b) => b.tier - a.tier);

  for (const tier of sorted) {
    if (tier.patterns.some((p) => matchGlob(file, p))) {
      return tier.tier;
    }
  }

  return 2;
}
