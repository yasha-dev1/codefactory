export { APP_NAME, VERSION, CONFIG_DIR_NAME, getAgentDir, getSessionsDir } from './config.js';

export {
  AgentSession,
  type AgentSessionConfig,
  type AgentSessionEventListener,
} from './agent-session.js';

export {
  createAgentSession,
  type CreateAgentSessionOptions,
  type CreateAgentSessionResult,
} from './sdk.js';

export { buildSystemPrompt, type BuildSystemPromptOptions } from './system-prompt.js';

export {
  createCompaction,
  compactNow,
  estimateTotalTokens,
  type CompactionOptions,
  type CompactNowResult,
} from './compaction.js';

export {
  loadAuth,
  saveProviderKey,
  saveProviderConfig,
  getProviderConfig,
  getStoredKey,
  listStoredProviders,
  type AuthData,
  type AuthEntry,
} from './auth.js';

export {
  buildOllamaModel,
  listOllamaModels,
  normalizeOllamaBaseUrl,
  DEFAULT_OLLAMA_BASE_URL,
  type OllamaModelSummary,
} from './ollama.js';

export {
  PROVIDERS,
  getProviderById,
  setProviderEnv,
  type ProviderInfo,
} from './providers.js';

export {
  codingTools,
  allTools,
  createCodingTools,
  createAllTools,
  createBashTool,
  createReadTool,
  createEditTool,
  createWriteTool,
  type Tool,
  type ToolName,
  type BashToolDetails,
  type BashToolInput,
  bashTool,
  type EditToolDetails,
  type EditToolInput,
  editTool,
  type ReadToolDetails,
  type ReadToolInput,
  readTool,
  type WriteToolDetails,
  type WriteToolInput,
  writeTool,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateTail,
  type TruncationResult,
} from './tools/index.js';
