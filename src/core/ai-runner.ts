import type { z } from 'zod';

export type AIPlatform = 'claude' | 'kiro' | 'codex';

export interface GenerateResult {
  filesCreated: string[];
  filesModified: string[];
}

export interface AIRunner {
  readonly platform: AIPlatform;
  analyze<T>(prompt: string, schema: z.ZodType<T>): Promise<T>;
  generate(prompt: string, systemPromptAppend?: string): Promise<GenerateResult>;
}

export const AI_PLATFORMS: { name: string; value: AIPlatform; description: string }[] = [
  {
    name: 'Claude Code',
    value: 'claude',
    description: 'Anthropic Claude Code CLI — claude',
  },
  {
    name: 'AWS Kiro',
    value: 'kiro',
    description: 'AWS Kiro CLI — kiro',
  },
  {
    name: 'OpenAI Codex',
    value: 'codex',
    description: 'OpenAI Codex CLI — codex',
  },
];
