export type { DetectionResult } from '../core/detector.js';

export interface UserPreferences {
  ciProvider: 'github-actions' | 'gitlab-ci' | 'bitbucket';
  aiPlatform: 'claude' | 'kiro' | 'codex';
  strictnessLevel: 'relaxed' | 'standard' | 'strict';
  selectedHarnesses: string[];
  customCriticalPaths?: string[];
}
