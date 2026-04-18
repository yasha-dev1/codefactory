import { Agent } from '@mariozechner/pi-agent-core';
import type { AgentMessage, ThinkingLevel } from '@mariozechner/pi-agent-core';
import { getModel, streamSimple } from '@mariozechner/pi-ai';
import type { KnownProvider, Message, Model } from '@mariozechner/pi-ai';

import { AgentSession } from './agent-session.js';
import { getProviderConfig } from './auth.js';
import { createCompaction } from './compaction.js';
import type { CompactionOptions } from './compaction.js';
import { buildOllamaModel, DEFAULT_OLLAMA_BASE_URL } from './ollama.js';
import { seedBuiltinSkills } from './seed.js';
import { loadSkills, type Skill } from './skills.js';
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
  /** Compaction options (set to false to disable) */
  compaction?: CompactionOptions | false;
  /** Pre-loaded skills (SDK escape hatch; skips project-dir discovery when provided) */
  skills?: Skill[];
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

  // Resolve model: ollama uses a custom Model built from stored baseUrl;
  // all other providers come from the pi-ai registry.
  let model: Model<string>;
  if (provider === 'ollama') {
    const baseUrl = getProviderConfig('ollama')?.baseUrl ?? DEFAULT_OLLAMA_BASE_URL;
    model = buildOllamaModel(modelId, baseUrl) as Model<string>;
  } else {
    const registryModel = getModel(provider as KnownProvider, modelId as never) as Model<string>;
    if (!registryModel) {
      throw new Error(`Unknown model "${modelId}" for provider "${provider}".`);
    }
    model = registryModel;
  }

  // Build tools
  const tools = options.tools ?? createCodingTools(cwd);

  // Load skills from project-local + user-wide dirs. SDK callers can pre-load and pass in.
  // On first run, seed bundled starter skills into `~/.harnext/skills/` before loading.
  let skills: Skill[];
  if (options.skills) {
    skills = options.skills;
  } else {
    const seed = seedBuiltinSkills();
    for (const d of seed.diagnostics) {
      console.warn(`[harnext] seed ${d.type}: ${d.message} (${d.path})`);
    }
    const { skills: loaded, diagnostics } = loadSkills({ cwd });
    for (const d of diagnostics) {
      console.warn(`[harnext] skill ${d.type}: ${d.message} (${d.path})`);
    }
    skills = loaded;
  }

  // Build system prompt
  const systemPrompt = buildSystemPrompt({
    cwd,
    customPrompt: options.systemPrompt,
    skills,
  });

  // Set up compaction (enabled by default)
  const transformContext =
    options.compaction !== false ? createCompaction(model, options.compaction ?? {}) : undefined;

  // Create the agent
  const agent = new Agent({
    initialState: {
      systemPrompt,
      model,
      thinkingLevel,
      tools,
    },
    convertToLlm,
    transformContext,
    streamFn: async (m, ctx, opts) => {
      // Ollama needs a non-empty API key placeholder for the OpenAI-compatible client.
      const finalOpts = m.provider === 'ollama' ? { ...opts, apiKey: opts?.apiKey ?? 'ollama' } : opts;
      return streamSimple(m, ctx, finalOpts);
    },
    toolExecution: 'parallel',
  });

  const session = new AgentSession(agent, {
    model,
    systemPrompt,
    tools,
    thinkingLevel,
    skills,
  });

  return { session };
}
