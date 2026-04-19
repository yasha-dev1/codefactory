import { describe, expect, it } from 'vitest';

import {
  AWAITING_APPROVAL_LABEL,
  DEFAULT_STAGES,
  NEEDS_JUDGMENT_LABEL,
  buildHarnextLabelSpecs,
} from '../src/github-connection.js';

describe('buildHarnextLabelSpecs', () => {
  it('emits one label per stage plus the two control labels', () => {
    const specs = buildHarnextLabelSpecs(DEFAULT_STAGES);
    const names = specs.map((s) => s.name);

    for (const stage of DEFAULT_STAGES) {
      expect(names).toContain(stage.label);
    }
    expect(names).toContain(AWAITING_APPROVAL_LABEL);
    expect(names).toContain(NEEDS_JUDGMENT_LABEL);
    expect(specs).toHaveLength(DEFAULT_STAGES.length + 2);
  });

  it('assigns every label a six-char hex color (no leading #)', () => {
    const specs = buildHarnextLabelSpecs(DEFAULT_STAGES);
    for (const spec of specs) {
      expect(spec.color).toMatch(/^[0-9a-f]{6}$/);
    }
  });

  it('uses a harnext-branded description on every label', () => {
    const specs = buildHarnextLabelSpecs(DEFAULT_STAGES);
    for (const spec of specs) {
      expect(spec.description).toMatch(/harnext/i);
    }
  });

  it('keeps stage order first, control labels last', () => {
    const specs = buildHarnextLabelSpecs(DEFAULT_STAGES);
    const stageCount = DEFAULT_STAGES.length;
    expect(specs.slice(0, stageCount).map((s) => s.name)).toEqual(
      DEFAULT_STAGES.map((s) => s.label),
    );
    expect(specs[stageCount].name).toBe(AWAITING_APPROVAL_LABEL);
    expect(specs[stageCount + 1].name).toBe(NEEDS_JUDGMENT_LABEL);
  });
});
