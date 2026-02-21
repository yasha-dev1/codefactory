import { spawn } from 'child_process';
import type { z } from 'zod';
import chalk from 'chalk';

import type { AIRunner, AIPlatform, GenerateResult } from './ai-runner.js';

export interface CodexRunnerOptions {
  maxTurns?: number;
  systemPrompt?: string;
  cwd?: string;
}

interface StreamMessage {
  type: string;
  subtype?: string;
  result?: string;
  message?: {
    content: Array<{
      type: string;
      text?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
  };
}

interface RunResult {
  resultText: string;
  filesCreated: string[];
  filesModified: string[];
}

export class CodexRunner implements AIRunner {
  readonly platform: AIPlatform = 'codex';
  private readonly options: CodexRunnerOptions;

  constructor(options: CodexRunnerOptions = {}) {
    this.options = options;
  }

  async analyze<T>(prompt: string, schema: z.ZodType<T>): Promise<T> {
    const systemPrompt = [
      'You are a repository analysis assistant.',
      'Analyze the repository and return your findings as structured JSON.',
      'Your final response MUST be valid JSON matching the requested schema.',
      'Do not wrap the JSON in markdown code fences.',
      this.options.systemPrompt,
    ]
      .filter(Boolean)
      .join('\n');

    const result = await this.run(prompt, {
      systemPrompt,
      maxTurns: this.options.maxTurns ?? 20,
      allowedTools: ['Read', 'Glob', 'Grep', 'Bash'],
    });

    const jsonStr = extractJson(result.resultText);
    const parsed = JSON.parse(jsonStr) as unknown;
    return schema.parse(parsed);
  }

  async generate(prompt: string, systemPromptAppend?: string): Promise<GenerateResult> {
    const systemPrompt = [this.options.systemPrompt, systemPromptAppend].filter(Boolean).join('\n');

    const result = await this.run(prompt, {
      systemPrompt: systemPrompt || undefined,
      maxTurns: this.options.maxTurns ?? 30,
      allowedTools: ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash'],
    });

    return {
      filesCreated: result.filesCreated,
      filesModified: result.filesModified,
    };
  }

  private run(
    prompt: string,
    config: {
      systemPrompt?: string;
      maxTurns: number;
      allowedTools: string[];
    },
  ): Promise<RunResult> {
    const cwd = this.options.cwd ?? process.cwd();

    const args = [
      '--approval-mode',
      'full-auto',
      '--quiet',
      '--output-format',
      'stream-json',
      '--max-turns',
      String(config.maxTurns),
    ];

    for (const tool of config.allowedTools) {
      args.push('--allowedTools', tool);
    }

    if (config.systemPrompt) {
      args.push('--system-prompt', config.systemPrompt);
    }

    args.push(prompt);

    return new Promise((resolve, reject) => {
      const child = spawn('codex', args, {
        cwd,
        stdio: ['inherit', 'pipe', 'inherit'],
        env: { ...process.env },
      });

      const created = new Set<string>();
      const modified = new Set<string>();
      let resultText = '';
      let buffer = '';

      child.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          this.processStreamLine(line, created, modified, (text) => {
            resultText = text;
          });
        }
      });

      child.on('close', (code) => {
        if (buffer.trim()) {
          this.processStreamLine(buffer, created, modified, (text) => {
            resultText = text;
          });
        }

        if (code !== 0 && code !== null) {
          reject(new Error(`Codex exited with code ${code}`));
          return;
        }

        for (const f of created) {
          modified.delete(f);
        }

        resolve({
          resultText,
          filesCreated: [...created],
          filesModified: [...modified],
        });
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to spawn Codex CLI: ${err.message}`));
      });
    });
  }

  private processStreamLine(
    line: string,
    created: Set<string>,
    modified: Set<string>,
    onResult: (text: string) => void,
  ): void {
    let msg: StreamMessage;
    try {
      msg = JSON.parse(line) as StreamMessage;
    } catch {
      return;
    }

    if (msg.type === 'result') {
      if (msg.result) {
        onResult(msg.result);
      }
      const cost = (msg as unknown as Record<string, unknown>).cost_usd;
      if (cost !== undefined) {
        console.log(chalk.dim(`  Cost: $${Number(cost).toFixed(4)}`));
      }
      return;
    }

    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text' && block.text) {
          console.log(block.text);
        }

        if (block.type === 'tool_use' && block.input) {
          const filePath = block.input.file_path as string | undefined;

          if (block.name === 'Read' || block.name === 'Glob' || block.name === 'Grep') {
            const target =
              filePath ?? (block.input.pattern as string) ?? (block.input.path as string) ?? '';
            console.log(chalk.dim(`  ${block.name}: ${target}`));
          }

          if (block.name === 'Write' || block.name === 'FileWrite') {
            if (filePath) {
              created.add(filePath);
              console.log(chalk.green(`  ✓ Write: ${filePath}`));
            }
          }

          if (
            block.name === 'Edit' ||
            block.name === 'FileEdit' ||
            block.name === 'FileMultiEdit'
          ) {
            if (filePath) {
              modified.add(filePath);
              console.log(chalk.yellow(`  ✎ Edit: ${filePath}`));
            }
          }

          if (block.name === 'Bash') {
            const cmd = block.input.command as string | undefined;
            if (cmd) {
              console.log(chalk.dim(`  $ ${cmd.length > 80 ? cmd.slice(0, 77) + '...' : cmd}`));
            }
          }
        }
      }
    }
  }
}

function extractJson(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }

  return text.trim();
}
