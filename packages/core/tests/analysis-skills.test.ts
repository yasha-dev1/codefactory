import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_GENERATED_SKILL_SLUGS,
  buildSkillsPrompt,
  generateProjectSkills,
  hasValidFrontmatter,
  installBundledSkills,
  resolveAgentSkillsDir,
} from '../src/analysis/skills.js';
import type { ProjectProfile } from '../src/analysis/profile.js';

const profile: ProjectProfile = {
  generatedAt: '2026-04-22T10:00:00.000Z',
  primaryLanguage: 'TypeScript',
  framework: null,
  packageManager: 'pnpm',
  testCommand: 'pnpm -w test',
  buildCommand: 'pnpm -w build',
  lintCommand: 'pnpm -w lint',
  typecheckCommand: 'pnpm -w typecheck',
  monorepo: true,
  hasUI: false,
  criticalPaths: ['packages/core/src'],
  conventions: ['kebab-case files'],
  ciProvider: 'github-actions',
  notes: '',
};

describe('resolveAgentSkillsDir', () => {
  it('maps harnext → .harnext/skills', () => {
    expect(resolveAgentSkillsDir('/repo', 'harnext')).toBe('/repo/.harnext/skills');
  });

  it('maps claude-code → .claude/skills', () => {
    expect(resolveAgentSkillsDir('/repo', 'claude-code')).toBe('/repo/.claude/skills');
  });

  it('maps codex → .codex/skills', () => {
    expect(resolveAgentSkillsDir('/repo', 'codex')).toBe('/repo/.codex/skills');
  });
});

describe('hasValidFrontmatter', () => {
  it('accepts well-formed YAML frontmatter', () => {
    const body = '---\nname: foo\ndescription: does foo\n---\n\nbody';
    expect(hasValidFrontmatter(body)).toBe(true);
  });

  it('rejects content without leading ---', () => {
    expect(hasValidFrontmatter('name: foo\ndescription: bar')).toBe(false);
  });

  it('rejects frontmatter that never closes', () => {
    expect(hasValidFrontmatter('---\nname: foo\ndescription: bar')).toBe(false);
  });

  it('rejects frontmatter missing name', () => {
    const body = '---\ndescription: does foo\n---\n';
    expect(hasValidFrontmatter(body)).toBe(false);
  });

  it('rejects frontmatter missing description', () => {
    const body = '---\nname: foo\n---\n';
    expect(hasValidFrontmatter(body)).toBe(false);
  });
});

describe('installBundledSkills', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'harnext-install-skills-'));
  });

  it('copies every bundled skill into the agent-specific dir', () => {
    const result = installBundledSkills(cwd, 'harnext');
    expect(result.error).toBeUndefined();
    expect(result.target).toBe(join(cwd, '.harnext', 'skills'));
    expect(result.installed.length).toBeGreaterThan(0);
    for (const slug of result.installed) {
      expect(existsSync(join(result.target, slug, 'SKILL.md'))).toBe(true);
    }
    rmSync(cwd, { recursive: true, force: true });
  });

  it('routes claude-code installs to .claude/skills', () => {
    const result = installBundledSkills(cwd, 'claude-code');
    expect(result.target).toBe(join(cwd, '.claude', 'skills'));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('routes codex installs to .codex/skills', () => {
    const result = installBundledSkills(cwd, 'codex');
    expect(result.target).toBe(join(cwd, '.codex', 'skills'));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('skips existing skill dirs instead of clobbering', () => {
    const target = join(cwd, '.harnext', 'skills', 'init');
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'SKILL.md'), 'user-edited content', 'utf-8');

    const result = installBundledSkills(cwd, 'harnext');
    expect(result.skipped).toContain('init');
    expect(readFileSync(join(target, 'SKILL.md'), 'utf-8')).toBe('user-edited content');
    rmSync(cwd, { recursive: true, force: true });
  });
});

describe('buildSkillsPrompt', () => {
  it('includes the relative target dir, slugs, and profile JSON', () => {
    const cwd = '/repo';
    const targetDir = '/repo/.harnext/skills';
    const slugs = ['codebase-conventions', 'run-checks'];
    const text = buildSkillsPrompt({ cwd, targetDir, slugs, profile });
    expect(text).toContain('.harnext/skills/**');
    expect(text).toContain('codebase-conventions');
    expect(text).toContain('run-checks');
    expect(text).toContain('"testCommand": "pnpm -w test"');
  });

  it('exposes DEFAULT_GENERATED_SKILL_SLUGS', () => {
    expect(DEFAULT_GENERATED_SKILL_SLUGS).toEqual([
      'codebase-conventions',
      'run-checks',
      'verify-implementation',
    ]);
  });
});

describe('generateProjectSkills (integration via runHarnextAgent stub)', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'harnext-gen-skills-'));
  });

  it('detects skills the stub agent writes as SKILL.md', async () => {
    const slugs = ['codebase-conventions', 'run-checks'];
    const result = await generateProjectSkills({
      cwd,
      codingAgent: 'harnext',
      profile,
      skillSlugs: slugs,
      tmpDir: cwd,
      runHarnextAgent: async () => {
        const target = join(cwd, '.harnext', 'skills');
        for (const slug of slugs) {
          mkdirSync(join(target, slug), { recursive: true });
          writeFileSync(
            join(target, slug, 'SKILL.md'),
            `---\nname: ${slug}\ndescription: generated desc\n---\n\nbody\n`,
            'utf-8',
          );
        }
        return 'wrote skills';
      },
    });

    expect(result.generated.sort()).toEqual(slugs.slice().sort());
    expect(result.missing).toEqual([]);
  });

  it('reports slugs as missing when SKILL.md is not written', async () => {
    const result = await generateProjectSkills({
      cwd,
      codingAgent: 'harnext',
      profile,
      skillSlugs: ['codebase-conventions'],
      tmpDir: cwd,
      runHarnextAgent: async () => 'did nothing',
    });

    expect(result.generated).toEqual([]);
    expect(result.missing).toEqual(['codebase-conventions']);
  });

  it('flags a written SKILL.md with invalid frontmatter as missing', async () => {
    const slug = 'run-checks';
    const result = await generateProjectSkills({
      cwd,
      codingAgent: 'harnext',
      profile,
      skillSlugs: [slug],
      tmpDir: cwd,
      runHarnextAgent: async () => {
        const target = join(cwd, '.harnext', 'skills');
        mkdirSync(join(target, slug), { recursive: true });
        writeFileSync(join(target, slug, 'SKILL.md'), 'no frontmatter here', 'utf-8');
        return '';
      },
    });

    expect(result.generated).toEqual([]);
    expect(result.missing).toEqual([slug]);
  });

  it('propagates agent errors', async () => {
    const result = await generateProjectSkills({
      cwd,
      codingAgent: 'harnext',
      profile,
      skillSlugs: ['codebase-conventions'],
      tmpDir: cwd,
      runHarnextAgent: async () => {
        throw new Error('nope');
      },
    });

    expect(result.error).toBe('nope');
    expect(result.generated).toEqual([]);
    expect(result.missing).toEqual(['codebase-conventions']);
  });
});
