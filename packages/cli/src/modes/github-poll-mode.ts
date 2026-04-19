import type { AgentEvent } from '@mariozechner/pi-agent-core';

import {
  acquireLock,
  appendGithubPollTick,
  fetchUpdatedIssues,
  persistPointer,
  pruneAgentRunLogs,
  refetchItem,
  releaseLock,
  runPollTick,
  transitionLabels,
  writeAgentRunLog,
  type AgentRunLogEvent,
  type AgentRunResult,
  type AgentSession,
  type GithubConnectionConfig,
} from '@harnext/core';

/** Keep tool output from ballooning the transcript — 8 KB per call is enough for triage. */
const TOOL_OUTPUT_MAX_CHARS = 8192;

function truncate(s: string, max = TOOL_OUTPUT_MAX_CHARS): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n…[truncated ${s.length - max} chars]`;
}

function stringifyToolResult(result: unknown): string {
  if (result == null) return '';
  if (typeof result === 'string') return truncate(result);
  try {
    return truncate(JSON.stringify(result, null, 2));
  } catch {
    return truncate(String(result));
  }
}

/**
 * Flatten the message content into a plain text string. Upstream content can
 * be a raw string (user/toolResult) or an array of parts (assistant); we just
 * pull out any `.text` we can see.
 */
function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((c) => {
      if (c && typeof c === 'object' && 'text' in c && typeof (c as { text: unknown }).text === 'string') {
        return (c as { text: string }).text;
      }
      return '';
    })
    .filter(Boolean)
    .join('');
}

export interface GithubPollModeOptions {
  cwd: string;
  config: GithubConnectionConfig;
}

/**
 * Cron-driven GitHub poller. Acquires a per-project lock, runs one tick that
 * may process multiple issues and chain YOLO stages, writes the updated
 * pointer back to github.json, and exits. Any output from the agent session
 * is captured per-stage into the tick log rather than printed — cron would
 * swallow stdout anyway, and structured logs are what the wizard's viewer
 * will read.
 */
export async function runGithubPollMode(
  session: AgentSession,
  options: GithubPollModeOptions,
): Promise<number> {
  const { cwd, config } = options;
  const lock = acquireLock(cwd);
  if (!lock) {
    // Another tick is already running — skip without emitting an error.
    appendGithubPollTick(cwd, {
      ts: new Date().toISOString(),
      itemNumber: -1,
      itemKind: 'issue',
      stageId: '(skipped)',
      stageLabel: '',
      mode: 'yolo',
      exit: 0,
      durationMs: 0,
      output: 'another poller is holding the lock; skipping tick',
    });
    return 0;
  }

  try {
    // Per-run capture buffers. Reset inside runAgent() before each invocation
    // so each stage run gets a clean slate.
    let lastAssistantText = '';
    let toolErrored = false;
    let events: AgentRunLogEvent[] = [];

    session.subscribe(async (event: AgentEvent) => {
      const ts = new Date().toISOString();
      switch (event.type) {
        case 'message_start':
          events.push({ ts, type: 'message_start', role: event.message.role });
          break;
        case 'message_end': {
          const text = extractMessageText(event.message.content);
          if (event.message.role === 'assistant') lastAssistantText = text;
          events.push({ ts, type: 'message_end', role: event.message.role, text });
          break;
        }
        case 'tool_execution_start':
          events.push({
            ts,
            type: 'tool_execution_start',
            toolName: event.toolName,
            toolCallId: event.toolCallId,
            toolInput: event.args,
          });
          break;
        case 'tool_execution_end':
          if (event.isError) toolErrored = true;
          events.push({
            ts,
            type: 'tool_execution_end',
            toolName: event.toolName,
            toolCallId: event.toolCallId,
            toolOutput: stringifyToolResult(event.result),
            isError: event.isError,
          });
          break;
      }
    });

    const runAgent = async (prompt: string): Promise<AgentRunResult> => {
      lastAssistantText = '';
      toolErrored = false;
      events = [];
      const started = Date.now();
      try {
        await session.prompt(prompt);
        return {
          exit: toolErrored ? 2 : 0,
          durationMs: Date.now() - started,
          output: lastAssistantText,
          events: [...events],
        };
      } catch (err) {
        return {
          exit: 1,
          durationMs: Date.now() - started,
          output: lastAssistantText,
          error: err instanceof Error ? err.message : String(err),
          events: [...events],
        };
      }
    };

    const result = await runPollTick(config, {
      fetch: fetchUpdatedIssues,
      refetch: refetchItem,
      transition: transitionLabels,
      runAgent,
      appendTick: (rec) => appendGithubPollTick(cwd, rec),
      writeRunLog: (rec) => {
        try {
          writeAgentRunLog(cwd, rec);
        } catch (err) {
          appendGithubPollTick(cwd, {
            ts: new Date().toISOString(),
            itemNumber: rec.itemNumber,
            itemKind: rec.itemKind,
            stageId: '(run-log-error)',
            stageLabel: rec.stageLabel,
            mode: rec.mode,
            exit: 0,
            durationMs: 0,
            output: err instanceof Error ? err.message : String(err),
          });
        }
      },
      warn: (msg) => {
        appendGithubPollTick(cwd, {
          ts: new Date().toISOString(),
          itemNumber: -1,
          itemKind: 'issue',
          stageId: '(warn)',
          stageLabel: '',
          mode: 'yolo',
          exit: 0,
          durationMs: 0,
          output: msg,
        });
      },
    });

    persistPointer(cwd, config, result.newPointer);
    try {
      pruneAgentRunLogs(cwd);
    } catch {
      // best-effort cleanup; never fail the tick because of it.
    }
    return 0;
  } catch (err) {
    appendGithubPollTick(cwd, {
      ts: new Date().toISOString(),
      itemNumber: -1,
      itemKind: 'issue',
      stageId: '(tick-error)',
      stageLabel: '',
      mode: 'yolo',
      exit: 1,
      durationMs: 0,
      output: '',
      error: err instanceof Error ? err.message : String(err),
    });
    return 1;
  } finally {
    releaseLock(lock);
  }
}
