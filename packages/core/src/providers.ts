export interface ProviderInfo {
  id: string;
  name: string;
  envVar: string;
  defaultModel: string;
}

/**
 * Providers that support simple API key auth.
 * Ordered by general popularity / relevance for coding agents.
 */
export const PROVIDERS: ProviderInfo[] = [
  { id: 'anthropic', name: 'Anthropic', envVar: 'ANTHROPIC_API_KEY', defaultModel: 'claude-sonnet-4-6' },
  { id: 'openai', name: 'OpenAI', envVar: 'OPENAI_API_KEY', defaultModel: 'gpt-5.3-codex' },
  { id: 'google', name: 'Google Gemini', envVar: 'GEMINI_API_KEY', defaultModel: 'gemini-3-flash-preview' },
  { id: 'xai', name: 'xAI (Grok)', envVar: 'XAI_API_KEY', defaultModel: 'grok-3' },
  { id: 'openrouter', name: 'OpenRouter', envVar: 'OPENROUTER_API_KEY', defaultModel: 'anthropic/claude-sonnet-4' },
  { id: 'groq', name: 'Groq', envVar: 'GROQ_API_KEY', defaultModel: 'llama-3.3-70b-versatile' },
  { id: 'mistral', name: 'Mistral', envVar: 'MISTRAL_API_KEY', defaultModel: 'mistral-large-latest' },
  { id: 'cerebras', name: 'Cerebras', envVar: 'CEREBRAS_API_KEY', defaultModel: 'qwen-3-235b-a22b-instruct-2507' },
];

export function getProviderById(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/**
 * Set the env var for a provider so pi-ai's getEnvApiKey() picks it up.
 */
export function setProviderEnv(provider: ProviderInfo, key: string): void {
  process.env[provider.envVar] = key;
}
