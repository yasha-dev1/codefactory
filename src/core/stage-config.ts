import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileExists } from '../utils/fs.js';
import type { StageConfig } from './stage-types.js';
import { migrateStageDefinition } from './stage-types.js';

const CONFIG_DIR = '.harnext';
const CONFIG_FILENAME = 'github.json';

export async function loadStageConfig(repoRoot: string): Promise<StageConfig | null> {
  const configPath = join(repoRoot, CONFIG_DIR, CONFIG_FILENAME);
  if (!(await fileExists(configPath))) {
    return null;
  }

  try {
    const raw = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const rawStages = Array.isArray(parsed['stages']) ? parsed['stages'] : [];
    const stages = rawStages.map((s: unknown) =>
      migrateStageDefinition(
        typeof s === 'object' && s !== null ? (s as Record<string, unknown>) : {},
      ),
    );

    return {
      stages,
      codingAgent: typeof parsed['codingAgent'] === 'string' ? parsed['codingAgent'] : undefined,
      updatedAt: typeof parsed['updatedAt'] === 'string' ? parsed['updatedAt'] : undefined,
    };
  } catch {
    return null;
  }
}

export async function saveStageConfig(repoRoot: string, config: StageConfig): Promise<void> {
  const configPath = join(repoRoot, CONFIG_DIR, CONFIG_FILENAME);
  await mkdir(dirname(configPath), { recursive: true });
  config.updatedAt = new Date().toISOString();
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}
