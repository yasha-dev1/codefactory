import type { z } from 'zod';

import type { AIRunner, AIPlatform, GenerateResult } from './ai-runner.js';

export interface CodexRunnerOptions {
  maxTurns?: number;
  systemPrompt?: string;
  cwd?: string;
}

/**
 * Stub implementation for the OpenAI Codex CLI.
 *
 * Codex's CLI supports `--approval-mode full-auto` and `--quiet`, but its
 * streaming output format and tool-use protocol differ from Claude Code's
 * `stream-json` format.  Until we have a verified integration with Codex's
 * output parsing, this runner throws a clear error to avoid silently
 * dropping the tool-use whitelist (a security regression).
 */
export class CodexRunner implements AIRunner {
  readonly platform: AIPlatform = 'codex';
  private readonly options: CodexRunnerOptions;

  constructor(options: CodexRunnerOptions = {}) {
    this.options = options;
  }

  async analyze<T>(_prompt: string, _schema: z.ZodType<T>): Promise<T> {
    throw new Error(
      'Codex CLI integration is not yet available. ' +
        "Codex's streaming output format differs from Claude Code and has not been integrated yet. " +
        'Please use Claude Code (claude) as the AI platform for now.',
    );
  }

  async generate(_prompt: string, _systemPromptAppend?: string): Promise<GenerateResult> {
    throw new Error(
      'Codex CLI integration is not yet available. ' +
        "Codex's streaming output format differs from Claude Code and has not been integrated yet. " +
        'Please use Claude Code (claude) as the AI platform for now.',
    );
  }
}
