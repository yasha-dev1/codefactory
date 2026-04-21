import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import chalk from 'chalk';

import {
  FLOWHUNT_URL,
  renderFlowHuntBranding,
  printBrandingOnce,
  __resetBrandingForTests,
} from '../../src/ui/brand.js';
import { terminalLink } from '../../src/utils/terminal-link.js';

const ANSI_RE = /\x1b\[[0-9;]*m/;

describe('terminalLink', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.FORCE_HYPERLINK;
    delete process.env.NO_COLOR;
    delete process.env.CI;
    delete process.env.TERM;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('emits an OSC 8 escape sequence when forceHyperlink=true', () => {
    const result = terminalLink('FlowHunt', 'https://www.flowhunt.io', { forceHyperlink: true });
    expect(result).toContain('\x1b]8;;https://www.flowhunt.io');
    expect(result).toContain('FlowHunt');
    expect(result).toContain('\x1b]8;;\x1b\\');
  });

  it('returns plain "label (url)" when hyperlinks are disabled', () => {
    const result = terminalLink('FlowHunt', 'https://www.flowhunt.io', { forceHyperlink: false });
    expect(result).toBe('FlowHunt (https://www.flowhunt.io)');
    expect(result).not.toContain('\x1b');
  });

  it('returns bare URL when label equals url and hyperlinks are disabled', () => {
    const result = terminalLink('https://www.flowhunt.io', 'https://www.flowhunt.io', {
      forceHyperlink: false,
    });
    expect(result).toBe('https://www.flowhunt.io');
  });

  it('disables hyperlinks when NO_COLOR is set', () => {
    process.env.NO_COLOR = '1';
    const result = terminalLink('FlowHunt', 'https://www.flowhunt.io');
    expect(result).not.toContain('\x1b]8');
  });

  it('enables hyperlinks when FORCE_HYPERLINK is set to a truthy value', () => {
    process.env.FORCE_HYPERLINK = '1';
    const result = terminalLink('FlowHunt', 'https://www.flowhunt.io');
    expect(result).toContain('\x1b]8;;https://www.flowhunt.io');
  });

  it('disables hyperlinks when FORCE_HYPERLINK=0', () => {
    process.env.FORCE_HYPERLINK = '0';
    const result = terminalLink('FlowHunt', 'https://www.flowhunt.io');
    expect(result).not.toContain('\x1b]8');
  });
});

describe('renderFlowHuntBranding', () => {
  it('contains the FlowHunt name and tagline', () => {
    const output = renderFlowHuntBranding({ forceHyperlink: false });
    expect(output).toContain('FlowHunt');
    expect(output).toContain('powered by flowhunt');
  });

  it('contains the FlowHunt URL in plain-text fallback mode', () => {
    const output = renderFlowHuntBranding({ forceHyperlink: false });
    expect(output).toContain(FLOWHUNT_URL);
  });

  it('applies chalk styling (ANSI color codes) when color is available', () => {
    const originalLevel = chalk.level;
    chalk.level = 3;
    try {
      const output = renderFlowHuntBranding({ forceHyperlink: false });
      expect(ANSI_RE.test(output)).toBe(true);
    } finally {
      chalk.level = originalLevel;
    }
  });

  it('renders an OSC 8 hyperlink when forceHyperlink=true', () => {
    const output = renderFlowHuntBranding({ forceHyperlink: true });
    expect(output).toContain(`\x1b]8;;${FLOWHUNT_URL}`);
  });
});

describe('printBrandingOnce', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetBrandingForTests();
    spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    spy.mockRestore();
    __resetBrandingForTests();
  });

  it('prints branding on first call', () => {
    printBrandingOnce();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain('FlowHunt');
  });

  it('does not print a second time within the same process', () => {
    printBrandingOnce();
    printBrandingOnce();
    printBrandingOnce();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
