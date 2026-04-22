import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { renderFlowHuntBranding, supportsHyperlinks } from '../../src/ui/banner.js';

const FLOWHUNT_URL = 'https://www.flowhunt.io';
const OSC8_PREFIX = `\x1b]8;;${FLOWHUNT_URL}\x1b\\`;
const OSC8_TERMINATOR = '\x1b]8;;\x1b\\';

// Strip ANSI styling so we can assert on the plain content regardless of chalk state.
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('renderFlowHuntBranding', () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('contains the FlowHunt name, tagline, and URL in plain-text mode', () => {
    const out = stripAnsi(renderFlowHuntBranding({ hyperlinks: false }));
    expect(out).toContain('FlowHunt');
    expect(out).toContain('powered by flowhunt');
    expect(out).toContain(FLOWHUNT_URL);
    expect(out).not.toContain('\x1b]8;;');
  });

  it('wraps the URL in an OSC 8 hyperlink sequence when hyperlinks are enabled', () => {
    const out = renderFlowHuntBranding({ hyperlinks: true });
    expect(out).toContain(OSC8_PREFIX);
    expect(out).toContain(OSC8_TERMINATOR);
    expect(stripAnsi(out)).toContain(FLOWHUNT_URL);
  });

  it('respects NO_COLOR by emitting no chalk escape codes while keeping the URL text', () => {
    process.env.NO_COLOR = '1';
    const out = renderFlowHuntBranding({ hyperlinks: false });
    expect(out).toContain('FlowHunt');
    expect(out).toContain(FLOWHUNT_URL);
    // chalk disables styling under NO_COLOR, so no SGR escape codes should appear
    // eslint-disable-next-line no-control-regex
    expect(out).not.toMatch(/\x1b\[[0-9;]*m/);
  });
});

describe('supportsHyperlinks', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.FORCE_HYPERLINK;
    delete process.env.NO_COLOR;
    delete process.env.TERM;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('returns true when FORCE_HYPERLINK=1 regardless of TTY', () => {
    process.env.FORCE_HYPERLINK = '1';
    expect(supportsHyperlinks({ isTTY: false } as NodeJS.WriteStream)).toBe(true);
  });

  it('returns false when NO_COLOR is set', () => {
    process.env.NO_COLOR = '1';
    expect(supportsHyperlinks({ isTTY: true } as NodeJS.WriteStream)).toBe(false);
  });

  it('returns false when TERM=dumb', () => {
    process.env.TERM = 'dumb';
    expect(supportsHyperlinks({ isTTY: true } as NodeJS.WriteStream)).toBe(false);
  });

  it('returns false when stream is not a TTY', () => {
    expect(supportsHyperlinks({ isTTY: false } as NodeJS.WriteStream)).toBe(false);
  });

  it('returns true for a TTY stream with no inhibiting env vars', () => {
    expect(supportsHyperlinks({ isTTY: true } as NodeJS.WriteStream)).toBe(true);
  });
});
