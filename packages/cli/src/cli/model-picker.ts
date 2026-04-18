import { createInterface } from 'node:readline';

import { getModels } from '@mariozechner/pi-ai';
import type { KnownProvider, Model } from '@mariozechner/pi-ai';
import chalk from 'chalk';

import { getStoredKey, PROVIDERS, saveProviderKey, setProviderEnv } from '@harnext/core';
import type { ProviderInfo } from '@harnext/core';
import { select } from './select.js';
import type { SelectItem } from './select.js';

export interface ModelPickerResult {
  provider: string;
  model: Model<string>;
}

/**
 * Interactive model picker triggered by the /model slash command.
 * Uses arrow-key select boxes for provider and model selection.
 */
export async function pickModel(): Promise<ModelPickerResult | undefined> {
  const provider = await selectProvider();
  if (!provider) return undefined;

  const hasKey = await ensureProviderKey(provider);
  if (!hasKey) return undefined;

  const model = await selectModel(provider);
  if (!model) return undefined;

  return { provider: provider.id, model };
}

// ── Provider selection ───────────────────────────────────────────────

async function selectProvider(): Promise<ProviderInfo | undefined> {
  const items: SelectItem<ProviderInfo>[] = PROVIDERS.map((p) => {
    const hasKey = !!(process.env[p.envVar] || getStoredKey(p.id));
    const keyTag = hasKey ? chalk.green(' ✓') : '';
    return {
      label: p.name + keyTag,
      value: p,
      hint: p.defaultModel,
    };
  });

  return select(items, { title: 'Select a provider' });
}

// ── Model selection ──────────────────────────────────────────────────

async function selectModel(provider: ProviderInfo): Promise<Model<string> | undefined> {
  let models: Model<string>[];
  try {
    models = getModels(provider.id as KnownProvider) as Model<string>[];
  } catch {
    console.log(chalk.red(`  No models found for ${provider.name}`));
    return undefined;
  }

  if (models.length === 0) {
    console.log(chalk.red(`  No models found for ${provider.name}`));
    return undefined;
  }

  const items: SelectItem<Model<string>>[] = models.map((m) => {
    const parts: string[] = [];
    const ctx = formatTokenCount(m.contextWindow);
    parts.push(ctx);
    if (m.reasoning) parts.push('reasoning');
    if (m.cost.input > 0) parts.push(`$${m.cost.input}/${m.cost.output}`);
    return {
      label: m.id,
      value: m,
      hint: parts.join('  '),
    };
  });

  return select(items, { title: `Select a model (${provider.name})`, pageSize: 15 });
}

// ── Key prompt ───────────────────────────────────────────────────────

async function ensureProviderKey(provider: ProviderInfo): Promise<boolean> {
  if (process.env[provider.envVar]) return true;

  const stored = getStoredKey(provider.id);
  if (stored) {
    setProviderEnv(provider, stored);
    return true;
  }

  console.log();
  console.log(chalk.yellow(`  No API key found for ${provider.name}.`));
  console.log(chalk.dim(`  Set ${provider.envVar} or enter it now.`));

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  return new Promise<boolean>((resolve) => {
    rl.question(chalk.cyan('  API key (empty to cancel): '), (answer) => {
      rl.close();
      const key = answer.trim();
      if (!key) {
        resolve(false);
        return;
      }
      saveProviderKey(provider.id, key);
      setProviderEnv(provider, key);
      console.log(chalk.green('  Key saved.'));
      resolve(true);
    });
  });
}

// ── Utilities ────────────────────────────────────────────────────────

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M ctx`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}k ctx`;
  return `${tokens} ctx`;
}
