import type { z } from 'zod';

import type { AIRunner, AIRunnerOptions, AIPlatform, GenerateResult } from './ai-runner.js';

/**
 * Stub implementation for the AWS Kiro CLI.
 *
 * Kiro's CLI protocol has not been publicly documented yet, so this runner
 * validates that the binary exists but throws a clear error if anyone tries
 * to call `analyze()` or `generate()`.  Once Kiro publishes a stable
 * streaming output format we can implement the full integration.
 */
const NOT_AVAILABLE =
  'Kiro CLI integration is not yet available. ' +
  'The Kiro streaming protocol has not been publicly documented. ' +
  'Please use Claude Code (claude) as the AI platform for now.';

export class KiroRunner implements AIRunner {
  readonly platform: AIPlatform = 'kiro';
  private readonly options: AIRunnerOptions;

  constructor(options: AIRunnerOptions = {}) {
    this.options = options;
  }

  async analyze<T>(_prompt: string, _schema: z.ZodType<T>): Promise<T> {
    throw new Error(NOT_AVAILABLE);
  }

  async generate(_prompt: string, _systemPromptAppend?: string): Promise<GenerateResult> {
    throw new Error(NOT_AVAILABLE);
  }
}
