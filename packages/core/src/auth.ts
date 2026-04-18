import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { getAgentDir } from './config.js';

export interface AuthData {
  [provider: string]: { key: string };
}

function getAuthPath(): string {
  return join(getAgentDir(), 'auth.json');
}

export function loadAuth(): AuthData {
  const path = getAuthPath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as AuthData;
  } catch {
    return {};
  }
}

export function saveProviderKey(provider: string, key: string): void {
  const path = getAuthPath();
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const data = loadAuth();
  data[provider] = { key };
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
}

export function getStoredKey(provider: string): string | undefined {
  return loadAuth()[provider]?.key;
}

export function listStoredProviders(): string[] {
  return Object.keys(loadAuth());
}
