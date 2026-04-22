import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  buildProfilerPrompt,
  runCodebaseProfiler,
} from '../src/analysis/profiler.js';

describe('buildProfilerPrompt', () => {
  it('embeds the output path verbatim', () => {
    const text = buildProfilerPrompt('/tmp/out/profile.json');
    expect(text).toContain('/tmp/out/profile.json');
  });

  it('instructs the agent to emit a JSON file with the full schema', () => {
    const text = buildProfilerPrompt('/tmp/p.json');
    expect(text).toContain('"primaryLanguage"');
    expect(text).toContain('"criticalPaths"');
    expect(text).toContain('"hasUI"');
    expect(text).toContain('"testCommand"');
  });

  it('warns against guessing commands', () => {
    const text = buildProfilerPrompt('/tmp/p.json');
    expect(text).toMatch(/Never guess a command/i);
  });
});

describe('runCodebaseProfiler', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'harnext-profiler-test-'));
  });

  it('parses the JSON the stub agent writes and returns a ProjectProfile', async () => {
    const result = await runCodebaseProfiler({
      cwd,
      codingAgent: 'harnext',
      tmpDir: cwd,
      runHarnextAgent: async (prompt) => {
        const match = prompt.match(/([^\s]+profile\.json)/);
        writeFileSync(
          match![1],
          JSON.stringify({
            generatedAt: '2026-04-22T10:00:00.000Z',
            primaryLanguage: 'Go',
            framework: null,
            packageManager: null,
            testCommand: 'go test ./...',
            buildCommand: 'go build ./...',
            lintCommand: null,
            typecheckCommand: null,
            monorepo: false,
            hasUI: false,
            criticalPaths: ['cmd/server'],
            conventions: [],
            ciProvider: 'github-actions',
            notes: 'small cli',
          }),
          'utf-8',
        );
        return 'wrote profile.json';
      },
    });

    expect(result.error).toBeUndefined();
    expect(result.profile).not.toBeNull();
    expect(result.profile!.primaryLanguage).toBe('Go');
    expect(result.profile!.testCommand).toBe('go test ./...');
    expect(result.profile!.criticalPaths).toEqual(['cmd/server']);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('returns null profile + error when the agent does not write the file', async () => {
    const result = await runCodebaseProfiler({
      cwd,
      codingAgent: 'harnext',
      tmpDir: cwd,
      runHarnextAgent: async () => 'I did nothing',
    });

    expect(result.profile).toBeNull();
    expect(result.error).toMatch(/did not write/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('returns null + error when the JSON is malformed', async () => {
    const result = await runCodebaseProfiler({
      cwd,
      codingAgent: 'harnext',
      tmpDir: cwd,
      runHarnextAgent: async (prompt) => {
        const match = prompt.match(/([^\s]+profile\.json)/);
        writeFileSync(match![1], '{ not: json', 'utf-8');
        return '';
      },
    });

    expect(result.profile).toBeNull();
    expect(result.error).toMatch(/failed to parse/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('returns null + error when required fields are missing', async () => {
    const result = await runCodebaseProfiler({
      cwd,
      codingAgent: 'harnext',
      tmpDir: cwd,
      runHarnextAgent: async (prompt) => {
        const match = prompt.match(/([^\s]+profile\.json)/);
        writeFileSync(match![1], JSON.stringify({ notes: 'no language' }), 'utf-8');
        return '';
      },
    });

    expect(result.profile).toBeNull();
    expect(result.error).toMatch(/missing required fields/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('propagates agent errors into result.error', async () => {
    const result = await runCodebaseProfiler({
      cwd,
      codingAgent: 'harnext',
      tmpDir: cwd,
      runHarnextAgent: async () => {
        throw new Error('agent blew up');
      },
    });

    expect(result.profile).toBeNull();
    expect(result.error).toBe('agent blew up');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('cleans up its tmp dir on success', async () => {
    let capturedPath = '';
    await runCodebaseProfiler({
      cwd,
      codingAgent: 'harnext',
      tmpDir: cwd,
      runHarnextAgent: async (prompt) => {
        const match = prompt.match(/([^\s]+profile\.json)/);
        capturedPath = match![1];
        writeFileSync(
          capturedPath,
          JSON.stringify({
            generatedAt: '2026-04-22T10:00:00.000Z',
            primaryLanguage: 'TypeScript',
          }),
          'utf-8',
        );
        return '';
      },
    });

    expect(() => readFileSync(capturedPath, 'utf-8')).toThrow();
    rmSync(cwd, { recursive: true, force: true });
  });
});
