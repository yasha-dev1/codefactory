import { execSync } from 'node:child_process';

import type { AIPlatform, AIRunner } from './ai-runner.js';
import { ClaudeRunner } from './claude-runner.js';
import { KiroRunner } from './kiro-runner.js';
import { CodexRunner } from './codex-runner.js';
import { PlatformCLINotFoundError } from '../utils/errors.js';

export interface AIRunnerOptions {
  maxTurns?: number;
  systemPrompt?: string;
  cwd?: string;
}

const PLATFORM_BINARIES: Record<AIPlatform, string> = {
  claude: 'claude',
  kiro: 'kiro',
  codex: 'codex',
};

export function createRunner(platform: AIPlatform, options?: AIRunnerOptions): AIRunner {
  switch (platform) {
    case 'claude':
      return new ClaudeRunner(options);
    case 'kiro':
      return new KiroRunner(options);
    case 'codex':
      return new CodexRunner(options);
    default: {
      const _exhaustive: never = platform;
      throw new Error(`Unknown AI platform: ${_exhaustive}`);
    }
  }
}

export function validatePlatformCLI(platform: AIPlatform): void {
  const binary = PLATFORM_BINARIES[platform];
  try {
    execSync(`which ${binary}`, { stdio: 'ignore' });
  } catch {
    throw new PlatformCLINotFoundError(platform, binary);
  }
}
