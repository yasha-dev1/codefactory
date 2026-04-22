import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSessionDir } from '../src/code-analysis/session-dir.js';

describe('createSessionDir', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'harnext-session-test-'));
    // Tests must never be at the mercy of an ambient env var.
    delete process.env.HARNEXT_KEEP_ANALYSIS_DIR;
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('creates a per-run dir under .harnext/analysis-runs/ with a manifest', () => {
    const session = createSessionDir(cwd);
    expect(session.root.startsWith(join(cwd, '.harnext', 'analysis-runs'))).toBe(true);
    expect(existsSync(session.root)).toBe(true);
    expect(existsSync(session.manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(session.manifestPath, 'utf-8'));
    expect(manifest.entries).toEqual([]);
  });

  it('pathFor allocates <root>/<stage>/<file> lazily', () => {
    const session = createSessionDir(cwd);
    const p = session.pathFor('tech-stack', 'out.json');
    expect(p).toBe(join(session.root, 'tech-stack', 'out.json'));
    // Writing to the returned path should succeed — parent is ensured.
    writeFileSync(p, 'x', 'utf-8');
    expect(readFileSync(p, 'utf-8')).toBe('x');
  });

  it('appendManifest accumulates entries in order', () => {
    const session = createSessionDir(cwd);
    session.appendManifest({ stage: 'tech-stack', outputs: ['/a'] });
    session.appendManifest({ stage: 'risk-contract', outputs: ['/b', '/c'] });
    const manifest = JSON.parse(readFileSync(session.manifestPath, 'utf-8'));
    expect(manifest.entries).toEqual([
      { stage: 'tech-stack', outputs: ['/a'] },
      { stage: 'risk-contract', outputs: ['/b', '/c'] },
    ]);
  });

  it('cleanup removes the session root', () => {
    const session = createSessionDir(cwd);
    const p = session.pathFor('x', 'y.json');
    writeFileSync(p, '{}', 'utf-8');
    session.cleanup();
    expect(existsSync(session.root)).toBe(false);
  });

  it('retain suppresses cleanup and stamps the manifest', () => {
    const session = createSessionDir(cwd);
    session.retain('pipeline soft-failed');
    session.cleanup();
    expect(existsSync(session.root)).toBe(true);
    const manifest = JSON.parse(readFileSync(session.manifestPath, 'utf-8'));
    expect(manifest.retain).toBe('pipeline soft-failed');
  });

  it('HARNEXT_KEEP_ANALYSIS_DIR=1 forces retain at construction', () => {
    process.env.HARNEXT_KEEP_ANALYSIS_DIR = '1';
    try {
      const session = createSessionDir(cwd);
      session.cleanup();
      expect(existsSync(session.root)).toBe(true);
    } finally {
      delete process.env.HARNEXT_KEEP_ANALYSIS_DIR;
    }
  });

  it('ensures .harnext/.gitignore contains analysis-runs/ (append-if-missing)', () => {
    createSessionDir(cwd);
    const gitignorePath = join(cwd, '.harnext', '.gitignore');
    expect(readFileSync(gitignorePath, 'utf-8')).toContain('analysis-runs/');
  });

  it('does not duplicate the gitignore entry on re-run', () => {
    createSessionDir(cwd);
    createSessionDir(cwd);
    const contents = readFileSync(join(cwd, '.harnext', '.gitignore'), 'utf-8');
    const matches = contents.match(/analysis-runs\//g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('preserves pre-existing gitignore lines when adding analysis-runs/', () => {
    // Seed .harnext/.gitignore with an existing line, then run the session
    // and verify the session dir appended without touching the first line.
    createSessionDir(cwd); // seeds the .harnext dir + gitignore
    const gitignorePath = join(cwd, '.harnext', '.gitignore');
    writeFileSync(gitignorePath, 'custom-line\n', 'utf-8');
    createSessionDir(cwd);
    const contents = readFileSync(gitignorePath, 'utf-8');
    expect(contents).toContain('custom-line');
    expect(contents).toContain('analysis-runs/');
  });
});
