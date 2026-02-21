import { spawn } from 'node:child_process';
import type { z } from 'zod';
import chalk from 'chalk';

import type { AIRunner, AIRunnerOptions, AIPlatform, GenerateResult } from './ai-runner.js';
import { extractJson } from './ai-runner.js';
import { snapshotUntrackedFiles, snapshotModifiedFiles, diffWorkingTree } from '../utils/git.js';

interface RunResult {
  resultText: string;
}

export class KiroRunner implements AIRunner {
  readonly platform: AIPlatform = 'kiro';
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
      trustTools: 'read,glob,grep,shell',
    });

    const jsonStr = extractJson(result.resultText);
    const parsed = JSON.parse(jsonStr) as unknown;
    return schema.parse(parsed);
  }

  async generate(prompt: string, systemPromptAppend?: string): Promise<GenerateResult> {
    const cwd = this.options.cwd ?? process.cwd();
    const beforeUntracked = snapshotUntrackedFiles(cwd);
    const beforeModified = snapshotModifiedFiles(cwd);

    const systemPrompt = [this.options.systemPrompt, systemPromptAppend].filter(Boolean).join('\n');

    await this.run(prompt, {
      systemPrompt: systemPrompt || undefined,
      trustTools: 'all',
    });

    const { created, modified } = diffWorkingTree(beforeUntracked, cwd, beforeModified);
    return { filesCreated: created, filesModified: modified };
  }

  private run(
    prompt: string,
    config: {
      systemPrompt?: string;
      trustTools: string;
    },
  ): Promise<RunResult> {
    const cwd = this.options.cwd ?? process.cwd();

    const args = ['chat', '--no-interactive'];

    if (this.options.maxTurns != null) {
      args.push('--max-turns', String(this.options.maxTurns));
    }

    if (config.trustTools === 'all') {
      args.push('--trust-all-tools');
    } else {
      args.push('--trust-tools', config.trustTools);
    }

    if (config.systemPrompt) {
      args.push('--system-prompt', config.systemPrompt);
    }

    args.push(prompt);

    return new Promise((resolve, reject) => {
      const child = spawn('kiro-cli', args, {
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
          console.log(chalk.dim(`  kiro: ${line.length > 100 ? line.slice(0, 97) + '...' : line}`));
        }
      });

      child.on('close', (code) => {
        if (buffer.trim()) {
          resultText += buffer;
        }

        if (code !== 0 && code !== null) {
          reject(new Error(`kiro-cli exited with code ${code}`));
          return;
        }

        resolve({ resultText: resultText.trim() });
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to spawn kiro-cli: ${err.message}`));
      });
    });
  }
}
