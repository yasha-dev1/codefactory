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

export interface UserPreferences {
  ciProvider: 'github-actions' | 'gitlab-ci' | 'bitbucket';
  aiPlatform: 'claude' | 'kiro' | 'codex';
  strictnessLevel: 'relaxed' | 'standard' | 'strict';
  selectedHarnesses: string[];
  customCriticalPaths?: string[];
}
