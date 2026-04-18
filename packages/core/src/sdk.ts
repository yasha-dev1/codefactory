import { Agent } from '@mariozechner/pi-agent-core';
import type { AgentMessage, ThinkingLevel } from '@mariozechner/pi-agent-core';
import { getModel, streamSimple } from '@mariozechner/pi-ai';
import type { KnownProvider, Message, Model } from '@mariozechner/pi-ai';

import { AgentSession } from './agent-session.js';
import { buildSystemPrompt } from './system-prompt.js';
import { createCodingTools, type Tool } from './tools/index.js';

export { createCodingTools, createAllTools, createBashTool, createReadTool, createEditTool, createWriteTool } from './tools/index.js';

export interface CreateAgentSessionOptions {
  /** LLM provider name */
  provider?: string;
  /** Model ID within the provider */
  modelId?: string;
  /** Working directory for tools */
  cwd?: string;
  /** Override the system prompt */
  systemPrompt?: string;
  /** Thinking/reasoning level */
  thinkingLevel?: ThinkingLevel;
  /** Custom tools (overrides default coding tools) */
  tools?: Tool[];
}

export interface CreateAgentSessionResult {
  session: AgentSession;
}

function convertToLlm(messages: AgentMessage[]): Message[] {
  return messages.filter(
    (m) => m.role === 'user' || m.role === 'assistant' || m.role === 'toolResult',
  ) as Message[];
}

export async function createAgentSession(
  options: CreateAgentSessionOptions = {},
): Promise<CreateAgentSessionResult> {
  const provider = options.provider ?? 'anthropic';
  const modelId = options.modelId ?? 'claude-sonnet-4-6';
  const cwd = options.cwd ?? process.cwd();
  const thinkingLevel: ThinkingLevel = options.thinkingLevel ?? 'off';

  // Resolve model from registry
  const model = getModel(provider as KnownProvider, modelId as never) as Model<string>;
  if (!model) {
    throw new Error(`Unknown model "${modelId}" for provider "${provider}".`);
  }

  // Build tools
  const tools = options.tools ?? createCodingTools(cwd);

  // Build system prompt
  const systemPrompt = buildSystemPrompt({
    cwd,
    customPrompt: options.systemPrompt,
  });

  // Create the agent
  const agent = new Agent({
    initialState: {
      systemPrompt,
      model,
      thinkingLevel,
      tools,
    },
    convertToLlm,
    streamFn: async (m, ctx, opts) => {
      return streamSimple(m, ctx, opts);
    },
    toolExecution: 'parallel',
  });

  const session = new AgentSession(agent, {
    model,
    systemPrompt,
    tools,
    thinkingLevel,
  });

  return { session };
}
