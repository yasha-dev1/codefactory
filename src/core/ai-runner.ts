import type { z } from 'zod';

export type AIPlatform = 'claude' | 'kiro' | 'codex';

export interface AIRunnerOptions {
  maxTurns?: number;
  systemPrompt?: string;
  cwd?: string;
}

export interface GenerateResult {
  filesCreated: string[];
  filesModified: string[];
}

export interface AIRunner {
  readonly platform: AIPlatform;
  analyze<T>(prompt: string, schema: z.ZodType<T>): Promise<T>;
  generate(prompt: string, systemPromptAppend?: string): Promise<GenerateResult>;
}

export const INSTRUCTION_FILES: Record<AIPlatform, string> = {
  claude: 'CLAUDE.md',
  kiro: 'KIRO.md',
  codex: 'CODEX.md',
};

export const AI_PLATFORMS: { name: string; value: AIPlatform; description: string }[] = [
  {
    name: 'Claude Code',
    value: 'claude',
    description: 'Anthropic Claude Code CLI — claude',
  },
  {
    name: 'AWS Kiro',
    value: 'kiro',
    description: 'AWS Kiro CLI — kiro-cli',
  },
  {
    name: 'OpenAI Codex',
    value: 'codex',
    description: 'OpenAI Codex CLI — codex',
  },
];

export function extractJson(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  const jsonMatch = text.match(/(\{[\s\S]*?\}|\[[\s\S]*?\])/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }

  return text.trim();
}
