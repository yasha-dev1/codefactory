import { createInterface } from 'node:readline';

import chalk from 'chalk';

import { getProviderById, getStoredKey, PROVIDERS, saveProviderKey, setProviderEnv } from '@harnext/core';
import type { ProviderInfo } from '@harnext/core';
import { select } from './select.js';
import type { SelectItem } from './select.js';

/**
 * Resolve an API key for the given provider.
 * Returns the key if found (env var or stored), or undefined.
 */
export function resolveApiKey(provider: ProviderInfo): string | undefined {
  const envKey = process.env[provider.envVar];
  if (envKey) return envKey;
  return getStoredKey(provider.id);
}

/**
 * Ensure the target provider has an API key.
 * If not, run the onboarding flow.
 * Returns { provider, model } to use.
 */
export async function ensureAuth(
  requestedProvider: string,
  requestedModel: string,
): Promise<{ provider: string; model: string }> {
  const info = getProviderById(requestedProvider);

  if (info) {
    const key = resolveApiKey(info);
    if (key) {
      setProviderEnv(info, key);
      return { provider: requestedProvider, model: requestedModel };
    }
  }

  for (const p of PROVIDERS) {
    const key = resolveApiKey(p);
    if (key) {
      setProviderEnv(p, key);
      return { provider: p.id, model: p.defaultModel };
    }
  }

  return runOnboarding();
}

async function runOnboarding(): Promise<{ provider: string; model: string }> {
  console.log();
  console.log(chalk.bold.cyan('Welcome to harnext!'));
  console.log(chalk.dim('No API keys found. Let\'s set up a provider.'));

  const provider = await selectOnboardingProvider();
  if (!provider) {
    console.log(chalk.dim('\n  No provider selected. Exiting.'));
    process.exit(0);
  }

  const key = await promptApiKey(provider);

  saveProviderKey(provider.id, key);
  setProviderEnv(provider, key);

  console.log(chalk.green(`\n  Saved! Using ${provider.name} / ${provider.defaultModel}\n`));

  return { provider: provider.id, model: provider.defaultModel };
}

async function selectOnboardingProvider(): Promise<ProviderInfo | undefined> {
  const items: SelectItem<ProviderInfo>[] = PROVIDERS.map((p) => ({
    label: p.name,
    value: p,
    hint: p.defaultModel,
  }));

  return select(items, { title: 'Select a provider' });
}

async function promptApiKey(provider: ProviderInfo): Promise<string> {
  console.log();
  console.log(chalk.dim(`  Set ${provider.envVar} in your environment, or enter it now.`));

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  return new Promise<string>((resolve) => {
    const ask = () => {
      rl.question(chalk.cyan('  API key: '), (answer) => {
        const key = answer.trim();
        if (key.length > 0) {
          rl.close();
          resolve(key);
        } else {
          console.log(chalk.red('  Key cannot be empty'));
          ask();
        }
      });
    };
    ask();
  });
}
