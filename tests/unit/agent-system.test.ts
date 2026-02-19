import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildAgentSystemPrompt } from '../../src/prompts/agent-system.js';

describe('buildAgentSystemPrompt', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'codefactory-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should replace {{branchName}} placeholder', async () => {
    const result = await buildAgentSystemPrompt({
      branchName: 'cf/my-feature-abc123',
      repoRoot: tempDir,
      harnessCommands: null,
    });

    expect(result).toContain('cf/my-feature-abc123');
    expect(result).not.toContain('{{branchName}}');
  });

  it('should replace {{qualityGates}} with commands when provided', async () => {
    const result = await buildAgentSystemPrompt({
      branchName: 'cf/test',
      repoRoot: tempDir,
      harnessCommands: {
        test: 'npm test',
        build: 'npm run build',
        lint: 'npm run lint',
        typeCheck: 'npm run typecheck',
      },
    });

    expect(result).toContain('`npm run lint`');
    expect(result).toContain('`npm run typecheck`');
    expect(result).toContain('`npm test`');
    expect(result).toContain('`npm run build`');
    expect(result).not.toContain('{{qualityGates}}');
  });

  it('should use fallback when harnessCommands is null', async () => {
    const result = await buildAgentSystemPrompt({
      branchName: 'cf/test',
      repoRoot: tempDir,
      harnessCommands: null,
    });

    expect(result).toContain('Check package.json');
  });

  it('should read custom template from .claude/leader_prompt.md', async () => {
    await mkdir(join(tempDir, '.claude'), { recursive: true });
    await writeFile(
      join(tempDir, '.claude', 'leader_prompt.md'),
      'Custom template for branch {{branchName}} with gates:\n{{qualityGates}}',
    );

    const result = await buildAgentSystemPrompt({
      branchName: 'cf/custom-abc123',
      repoRoot: tempDir,
      harnessCommands: {
        test: 'npm test',
        build: '',
        lint: 'npm run lint',
        typeCheck: '',
      },
    });

    expect(result).toBe(
      'Custom template for branch cf/custom-abc123 with gates:\n1. `npm run lint`\n2. `npm test`',
    );
  });

  it('should fall back to default template when file is missing', async () => {
    const result = await buildAgentSystemPrompt({
      branchName: 'cf/test',
      repoRoot: tempDir,
      harnessCommands: null,
    });

    expect(result).toContain('CodeFactory Agent Session');
    expect(result).toContain('Execution Strategy');
  });

  it('should replace all occurrences of branchName', async () => {
    const result = await buildAgentSystemPrompt({
      branchName: 'cf/multi-replace',
      repoRoot: tempDir,
      harnessCommands: null,
    });

    // The default template uses branchName multiple times
    const occurrences = result.split('cf/multi-replace').length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(3);
  });
});
