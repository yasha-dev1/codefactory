import { spawn } from 'node:child_process';
import type { z } from 'zod';
import chalk from 'chalk';

import type { AIRunner, AIRunnerOptions, AIPlatform, GenerateResult } from './ai-runner.js';
import { extractJson } from './ai-runner.js';
import { snapshotUntrackedFiles, diffWorkingTree } from '../utils/git.js';

interface RunResult {
  resultText: string;
}

export class CodexRunner implements AIRunner {
  readonly platform: AIPlatform = 'codex';
  private readonly options: AIRunnerOptions;

  constructor(options: AIRunnerOptions = {}) {
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
      approvalMode: 'full-auto',
    });

    const jsonStr = extractJson(result.resultText);
    const parsed = JSON.parse(jsonStr) as unknown;
    return schema.parse(parsed);
  }

  async generate(prompt: string, systemPromptAppend?: string): Promise<GenerateResult> {
    const cwd = this.options.cwd ?? process.cwd();
    const beforeUntracked = snapshotUntrackedFiles(cwd);

    const systemPrompt = [this.options.systemPrompt, systemPromptAppend].filter(Boolean).join('\n');

    await this.run(prompt, {
      systemPrompt: systemPrompt || undefined,
      approvalMode: 'full-auto',
    });

    const { created, modified } = diffWorkingTree(beforeUntracked, cwd);
    return { filesCreated: created, filesModified: modified };
  }

  private run(
    prompt: string,
    config: {
      systemPrompt?: string;
      approvalMode: string;
    },
  ): Promise<RunResult> {
    const cwd = this.options.cwd ?? process.cwd();

    const args = ['exec', prompt, '--approval-mode', config.approvalMode, '--quiet'];

    if (this.options.maxTurns) {
      args.push('--max-turns', String(this.options.maxTurns));
    }

    if (config.systemPrompt) {
      args.push('--system-prompt', config.systemPrompt);
    }

    return new Promise((resolve, reject) => {
      const child = spawn('codex', args, {
        cwd,
        stdio: ['inherit', 'pipe', 'inherit'],
        env: { ...process.env },
      });

      let resultText = '';
      let buffer = '';

      child.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          resultText += line + '\n';
          console.log(
            chalk.dim(`  codex: ${line.length > 100 ? line.slice(0, 97) + '...' : line}`),
          );
        }
      });

      child.on('close', (code) => {
        if (buffer.trim()) {
          resultText += buffer;
        }

        if (code !== 0 && code !== null) {
          reject(new Error(`codex exited with code ${code}`));
          return;
        }

        resolve({ resultText: resultText.trim() });
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to spawn codex CLI: ${err.message}`));
      });
    });
  }
}
