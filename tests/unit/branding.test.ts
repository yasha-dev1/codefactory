import chalk from 'chalk';

import { hyperlink, renderFlowHuntBranding } from '../../src/ui/branding.js';

const URL = 'https://www.flowhunt.io';
const OSC8 = '\x1b]8;;';

describe('hyperlink', () => {
  const originalIsTTY = process.stdout.isTTY;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.TERM_PROGRAM;
    delete process.env.VTE_VERSION;
    delete process.env.KITTY_WINDOW_ID;
    delete process.env.WT_SESSION;
  });

  afterEach(() => {
    process.stdout.isTTY = originalIsTTY;
    process.env = originalEnv;
  });

  it('falls back to plain text when not a TTY', () => {
    process.stdout.isTTY = false;
    const out = hyperlink(URL, URL);
    expect(out).toBe(URL);
    expect(out).not.toContain(OSC8);
  });

  it('falls back to plain text when TERM is dumb', () => {
    process.stdout.isTTY = true;
    process.env.TERM = 'dumb';
    const out = hyperlink(URL, URL);
    expect(out).toBe(URL);
    expect(out).not.toContain(OSC8);
  });

  it('includes URL in parentheses when label differs and no hyperlink support', () => {
    process.stdout.isTTY = false;
    const out = hyperlink(URL, 'FlowHunt');
    expect(out).toBe(`FlowHunt (${URL})`);
  });

  it('emits OSC 8 hyperlink when TERM_PROGRAM is iTerm.app', () => {
    process.stdout.isTTY = true;
    process.env.TERM_PROGRAM = 'iTerm.app';
    const out = hyperlink(URL, URL);
    expect(out).toContain(OSC8);
    expect(out).toContain(URL);
    expect(out).toBe(`\x1b]8;;${URL}\x07${URL}\x1b]8;;\x07`);
  });

  it('emits OSC 8 hyperlink when VTE_VERSION is set', () => {
    process.stdout.isTTY = true;
    process.env.VTE_VERSION = '6200';
    const out = hyperlink(URL, URL);
    expect(out).toContain(OSC8);
  });
});

describe('renderFlowHuntBranding', () => {
  const originalLevel = chalk.level;
  const originalIsTTY = process.stdout.isTTY;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    chalk.level = 1;
    process.env = { ...originalEnv };
    delete process.env.TERM_PROGRAM;
    delete process.env.VTE_VERSION;
    delete process.env.KITTY_WINDOW_ID;
    delete process.env.WT_SESSION;
  });

  afterEach(() => {
    chalk.level = originalLevel;
    process.stdout.isTTY = originalIsTTY;
    process.env = originalEnv;
  });

  it('includes the FlowHunt name', () => {
    process.stdout.isTTY = false;
    const out = renderFlowHuntBranding();
    expect(out).toContain('FlowHunt');
  });

  it('includes the tagline', () => {
    process.stdout.isTTY = false;
    const out = renderFlowHuntBranding();
    expect(out).toContain('powered by flowhunt');
  });

  it('renders FlowHunt name with bold chalk styling', () => {
    process.stdout.isTTY = false;
    const out = renderFlowHuntBranding();
    expect(out).toContain(chalk.bold('FlowHunt'));
  });

  it('renders the URL exactly once', () => {
    process.stdout.isTTY = false;
    const out = renderFlowHuntBranding();
    const matches = out.match(/https:\/\/www\.flowhunt\.io/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('omits OSC 8 escape when not hyperlink-capable', () => {
    process.stdout.isTTY = false;
    const out = renderFlowHuntBranding();
    expect(out).not.toContain(OSC8);
  });

  it('emits OSC 8 escape when hyperlink-capable', () => {
    process.stdout.isTTY = true;
    process.env.TERM_PROGRAM = 'iTerm.app';
    const out = renderFlowHuntBranding();
    expect(out).toContain(OSC8);
  });
});
