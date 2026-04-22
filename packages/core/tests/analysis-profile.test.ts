import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  coerceProjectProfile,
  getProjectProfilePath,
  isProjectProfile,
  loadProjectProfile,
  saveProjectProfile,
  type ProjectProfile,
} from '../src/analysis/profile.js';

const sample: ProjectProfile = {
  generatedAt: '2026-04-22T10:00:00.000Z',
  primaryLanguage: 'TypeScript',
  framework: 'Next.js',
  packageManager: 'pnpm',
  testCommand: 'pnpm test',
  buildCommand: 'pnpm build',
  lintCommand: 'pnpm lint',
  typecheckCommand: 'pnpm typecheck',
  monorepo: true,
  hasUI: true,
  criticalPaths: ['apps/web/src/app', 'apps/api/src/handlers'],
  conventions: ['camelCase variables', 'named exports only'],
  ciProvider: 'github-actions',
  notes: 'Monorepo with turbo.',
};

describe('ProjectProfile persistence', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'harnext-profile-test-'));
  });

  it('round-trips through save → load', () => {
    saveProjectProfile(cwd, sample);
    const loaded = loadProjectProfile(cwd);
    expect(loaded).toEqual(sample);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('returns null when the file is absent', () => {
    expect(loadProjectProfile(cwd)).toBeNull();
    rmSync(cwd, { recursive: true, force: true });
  });

  it('returns null when the file is malformed JSON', () => {
    saveProjectProfile(cwd, sample);
    const path = getProjectProfilePath(cwd);
    writeFileSync(path, '{ not: valid json', 'utf-8');
    expect(loadProjectProfile(cwd)).toBeNull();
    rmSync(cwd, { recursive: true, force: true });
  });

  it('returns null when the JSON is structurally invalid', () => {
    saveProjectProfile(cwd, sample);
    const path = getProjectProfilePath(cwd);
    writeFileSync(path, JSON.stringify({ primaryLanguage: 'JS' }), 'utf-8');
    expect(loadProjectProfile(cwd)).toBeNull();
    rmSync(cwd, { recursive: true, force: true });
  });
});

describe('isProjectProfile', () => {
  it('accepts a well-formed profile', () => {
    expect(isProjectProfile(sample)).toBe(true);
  });

  it('rejects missing primaryLanguage', () => {
    const { primaryLanguage: _, ...bad } = sample;
    expect(isProjectProfile(bad)).toBe(false);
  });

  it('rejects wrong array item type', () => {
    expect(isProjectProfile({ ...sample, criticalPaths: [1, 2] })).toBe(false);
  });

  it('rejects non-null framework that is not a string', () => {
    expect(isProjectProfile({ ...sample, framework: 42 })).toBe(false);
  });
});

describe('coerceProjectProfile', () => {
  it('fills in sensible defaults for missing optional fields', () => {
    const input = { primaryLanguage: 'Go' };
    const result = coerceProjectProfile(input);
    expect(result).not.toBeNull();
    expect(result!.primaryLanguage).toBe('Go');
    expect(result!.framework).toBeNull();
    expect(result!.monorepo).toBe(false);
    expect(result!.hasUI).toBe(false);
    expect(result!.criticalPaths).toEqual([]);
    expect(result!.conventions).toEqual([]);
    expect(result!.notes).toBe('');
    expect(typeof result!.generatedAt).toBe('string');
  });

  it('drops empty strings from optional string fields', () => {
    const result = coerceProjectProfile({
      primaryLanguage: 'Go',
      framework: '',
      testCommand: 'go test ./...',
    });
    expect(result!.framework).toBeNull();
    expect(result!.testCommand).toBe('go test ./...');
  });

  it('filters non-string array items silently', () => {
    const result = coerceProjectProfile({
      primaryLanguage: 'Go',
      criticalPaths: ['cmd/server', 42, '', 'internal/auth'],
    });
    expect(result!.criticalPaths).toEqual(['cmd/server', 'internal/auth']);
  });

  it('returns null when primaryLanguage is missing or empty', () => {
    expect(coerceProjectProfile({})).toBeNull();
    expect(coerceProjectProfile({ primaryLanguage: '' })).toBeNull();
    expect(coerceProjectProfile(null)).toBeNull();
    expect(coerceProjectProfile('not-an-object')).toBeNull();
  });
});
