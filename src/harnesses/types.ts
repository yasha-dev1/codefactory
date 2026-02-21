import type { DetectionResult } from '../core/detector.js';
import type { AIRunner, AIPlatform } from '../core/ai-runner.js';
import type { FileWriter } from '../core/file-writer.js';

export interface HarnessContext {
  repoRoot: string;
  detection: DetectionResult;
  runner: AIRunner;
  fileWriter: FileWriter;
  userPreferences: UserPreferences;
  previousOutputs: Map<string, HarnessOutput>;
}

export interface UserPreferences {
  ciProvider: 'github-actions' | 'gitlab-ci' | 'bitbucket';
  aiPlatform: AIPlatform;
  strictnessLevel: 'relaxed' | 'standard' | 'strict';
  selectedHarnesses: string[];
  customCriticalPaths?: string[];
}

export interface HarnessOutput {
  harnessName: string;
  filesCreated: string[];
  filesModified: string[];
  metadata?: Record<string, unknown>;
}

export interface HarnessModule {
  name: string;
  displayName: string;
  description: string;
  order: number;
  isApplicable(ctx: HarnessContext): boolean;
  execute(ctx: HarnessContext): Promise<HarnessOutput>;
}
