/**
 * Dispatch a prompt to the user's chosen coding agent (harnext in-process,
 * or an external CLI like claude-code / codex) and return its trailing
 * assistant text.
 *
 * Shared between the setup wizard's analysis steps (profiler, stage-prompt
 * generator, skill generator). The existing `workflow-generator.ts` has a
 * near-identical block inline — kept unchanged for now to limit blast
 * radius; new callers should use this helper.
 */

import { getCodingAgentSpec, type CodingAgentId } from '../coding-agents.js';
import {
  runExternalCodingAgent,
  type ExternalAgentSpawner,
} from '../coding-agent-runner.js';
import { createAgentSession } from '../sdk.js';

export interface RunCodingAgentOptions {
  cwd: string;
  codingAgent: CodingAgentId;
  /** Required for external agents; ignored (but accepted) for harnext. */
  codingAgentModel?: string;
  prompt: string;
  /** Test hook for external-agent spawning. */
  spawner?: ExternalAgentSpawner;
  /**
   * Test hook for the harnext in-process path. When supplied, the helper
   * calls this instead of `createAgentSession` so unit tests don't need a
   * real provider key.
   */
  runHarnextAgent?: (prompt: string, cwd: string) => Promise<string>;
}

export interface RunCodingAgentResult {
  /** Trailing assistant text from the run. Empty string if nothing captured. */
  output: string;
  /** Populated on spawn failure, timeout, or non-zero exit. */
  error?: string;
}

export async function runCodingAgent(
  opts: RunCodingAgentOptions,
): Promise<RunCodingAgentResult> {
  if (opts.codingAgent === 'harnext') {
    if (opts.runHarnextAgent) {
      try {
        return { output: await opts.runHarnextAgent(opts.prompt, opts.cwd) };
      } catch (err) {
        return { output: '', error: err instanceof Error ? err.message : String(err) };
      }
    }
    return runHarnextSession(opts.prompt, opts.cwd);
  }

  const spec = getCodingAgentSpec(opts.codingAgent);
  if (!opts.codingAgentModel) {
    return {
      output: '',
      error: `coding agent "${spec.id}" requires a model id`,
    };
  }
  const result = await runExternalCodingAgent(spec, opts.prompt, {
    cwd: opts.cwd,
    modelId: opts.codingAgentModel,
    spawner: opts.spawner,
  });
  return {
    output: result.output,
    error: result.exit !== 0 ? result.error ?? `agent exited ${result.exit}` : undefined,
  };
}

async function runHarnextSession(prompt: string, cwd: string): Promise<RunCodingAgentResult> {
  try {
    const { session } = await createAgentSession({ cwd, quiet: true });
    let lastText = '';
    const unsubscribe = session.subscribe((event) => {
      if (event.type === 'message_end' && event.message.role === 'assistant') {
        const content = event.message.content;
        if (typeof content === 'string') {
          lastText = content;
          return;
        }
        if (Array.isArray(content)) {
          lastText = content
            .map((c) =>
              c &&
              typeof c === 'object' &&
              'text' in c &&
              typeof (c as { text: unknown }).text === 'string'
                ? (c as { text: string }).text
                : '',
            )
            .filter(Boolean)
            .join('');
        }
      }
    });
    try {
      await session.prompt(prompt);
    } finally {
      unsubscribe();
      await session.dispose();
    }
    return { output: lastText };
  } catch (err) {
    return { output: '', error: err instanceof Error ? err.message : String(err) };
  }
}
