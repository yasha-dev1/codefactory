import { migrateStageDefinition } from '../../src/core/stage-types.js';
import type { StageDefinition } from '../../src/core/stage-types.js';

describe('migrateStageDefinition', () => {
  it('should backfill runner as local when runner field is missing', () => {
    const raw = {
      id: 'triage',
      label: 'harnext:triage',
      prompt: 'Triage this issue',
      mode: 'yolo',
    };
    const result = migrateStageDefinition(raw);
    expect(result.runner).toEqual({ location: 'local' });
  });

  it('should preserve existing local runner', () => {
    const raw = {
      id: 'triage',
      label: 'harnext:triage',
      prompt: 'Triage this issue',
      mode: 'yolo',
      runner: { location: 'local' },
    };
    const result = migrateStageDefinition(raw);
    expect(result.runner).toEqual({ location: 'local' });
  });

  it('should preserve existing github-actions runner', () => {
    const raw = {
      id: 'implement',
      label: 'harnext:implement',
      prompt: 'Implement the feature',
      mode: 'human-approval',
      runner: {
        location: 'github-actions',
        workflowFile: '.github/workflows/harnext-implement.yml',
        generated: true,
      },
    };
    const result = migrateStageDefinition(raw);
    expect(result.runner).toEqual({
      location: 'github-actions',
      workflowFile: '.github/workflows/harnext-implement.yml',
      generated: true,
    });
  });

  it('should default mode to human-approval when invalid', () => {
    const raw = {
      id: 'test',
      label: 'test-label',
      prompt: 'test prompt',
      mode: 'invalid-mode',
    };
    const result = migrateStageDefinition(raw);
    expect(result.mode).toBe('human-approval');
  });

  it('should default string fields to empty when missing', () => {
    const raw = {};
    const result = migrateStageDefinition(raw);
    expect(result.id).toBe('');
    expect(result.label).toBe('');
    expect(result.prompt).toBe('');
    expect(result.mode).toBe('human-approval');
    expect(result.runner).toEqual({ location: 'local' });
  });

  it('should default workflowFile to empty string when missing from github-actions runner', () => {
    const raw = {
      id: 'stage',
      label: 'label',
      prompt: 'prompt',
      mode: 'yolo',
      runner: { location: 'github-actions' },
    };
    const result = migrateStageDefinition(raw);
    expect(result.runner).toEqual({
      location: 'github-actions',
      workflowFile: '',
      generated: false,
    });
  });

  it('should treat non-object runner as local', () => {
    const raw = {
      id: 'stage',
      label: 'label',
      prompt: 'prompt',
      mode: 'yolo',
      runner: 'invalid',
    };
    const result = migrateStageDefinition(raw);
    expect(result.runner).toEqual({ location: 'local' });
  });

  it('should treat unknown runner location as local', () => {
    const raw = {
      id: 'stage',
      label: 'label',
      prompt: 'prompt',
      mode: 'yolo',
      runner: { location: 'unknown' },
    };
    const result = migrateStageDefinition(raw);
    expect(result.runner).toEqual({ location: 'local' });
  });

  it('should preserve yolo mode', () => {
    const raw = {
      id: 'stage',
      label: 'label',
      prompt: 'prompt',
      mode: 'yolo',
    };
    const result = migrateStageDefinition(raw);
    expect(result.mode).toBe('yolo');
  });

  it('should return a complete StageDefinition shape', () => {
    const raw = {
      id: 'plan',
      label: 'harnext:plan',
      prompt: 'Plan the approach',
      mode: 'human-approval',
      runner: { location: 'local' },
    };
    const result: StageDefinition = migrateStageDefinition(raw);
    expect(result).toEqual({
      id: 'plan',
      label: 'harnext:plan',
      prompt: 'Plan the approach',
      mode: 'human-approval',
      runner: { location: 'local' },
    });
  });
});
