import type { z } from 'zod';

import type { AIRunner, AIPlatform, GenerateResult } from './ai-runner.js';

export interface KiroRunnerOptions {
  maxTurns?: number;
  systemPrompt?: string;
  cwd?: string;
}

/**
 * Stub implementation for the AWS Kiro CLI.
 *
 * Kiro's CLI protocol has not been publicly documented yet, so this runner
 * validates that the binary exists but throws a clear error if anyone tries
 * to call `analyze()` or `generate()`.  Once Kiro publishes a stable
 * streaming output format we can implement the full integration.
 */
export class KiroRunner implements AIRunner {
  readonly platform: AIPlatform = 'kiro';
  private readonly options: KiroRunnerOptions;

  constructor(options: KiroRunnerOptions = {}) {
    this.options = options;
  }

  async analyze<T>(_prompt: string, _schema: z.ZodType<T>): Promise<T> {
    throw new Error(
      'Kiro CLI integration is not yet available. ' +
        'The Kiro streaming protocol has not been publicly documented. ' +
        'Please use Claude Code (claude) as the AI platform for now.',
    );
  }

  async generate(_prompt: string, _systemPromptAppend?: string): Promise<GenerateResult> {
    throw new Error(
      'Kiro CLI integration is not yet available. ' +
        'The Kiro streaming protocol has not been publicly documented. ' +
        'Please use Claude Code (claude) as the AI platform for now.',
    );
  }
}
