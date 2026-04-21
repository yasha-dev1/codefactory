export type StageMode = 'yolo' | 'human-approval';

export type StageRunner =
  | { location: 'local' }
  | { location: 'github-actions'; workflowFile: string; generated: boolean };

export interface StageDefinition {
  id: string;
  label: string;
  prompt: string;
  mode: StageMode;
  runner: StageRunner;
}

export interface StageConfig {
  stages: StageDefinition[];
  codingAgent?: string;
  updatedAt?: string;
}

export function migrateStageDefinition(raw: Record<string, unknown>): StageDefinition {
  const id = typeof raw['id'] === 'string' ? raw['id'] : '';
  const label = typeof raw['label'] === 'string' ? raw['label'] : '';
  const prompt = typeof raw['prompt'] === 'string' ? raw['prompt'] : '';
  const mode: StageMode =
    raw['mode'] === 'yolo' || raw['mode'] === 'human-approval'
      ? (raw['mode'] as StageMode)
      : 'human-approval';

  let runner: StageRunner;
  if (raw['runner'] && typeof raw['runner'] === 'object') {
    const r = raw['runner'] as Record<string, unknown>;
    if (r['location'] === 'github-actions') {
      runner = {
        location: 'github-actions',
        workflowFile: typeof r['workflowFile'] === 'string' ? r['workflowFile'] : '',
        generated: typeof r['generated'] === 'boolean' ? r['generated'] : false,
      };
    } else {
      runner = { location: 'local' };
    }
  } else {
    runner = { location: 'local' };
  }

  return { id, label, prompt, mode, runner };
}
