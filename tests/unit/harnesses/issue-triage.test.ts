import { issueTriageHarness } from '../../../src/harnesses/issue-triage.js';
import type { HarnessContext } from '../../../src/harnesses/types.js';
import type { ClaudeRunner } from '../../../src/core/claude-runner.js';
import type { DetectionResult } from '../../../src/core/detector.js';

vi.mock('../../../src/prompts/issue-triage.js', () => ({
  buildIssueTriagePrompt: vi.fn().mockReturnValue('mocked issue triage prompt'),
}));

vi.mock('../../../src/prompts/system.js', () => ({
  buildSystemPrompt: vi.fn().mockReturnValue('mocked system prompt'),
}));

function createMockContext(overrides?: Partial<HarnessContext>): HarnessContext {
  const detection: DetectionResult = {
    primaryLanguage: 'typescript',
    framework: 'next',
    packageManager: 'npm',
    testFramework: 'vitest',
    linter: 'eslint',
    formatter: 'prettier',
    typeChecker: 'tsc',
    buildTool: 'tsup',
    ciProvider: 'github-actions',
    existingDocs: ['README.md'],
    existingClaude: false,
    architecturalLayers: ['api', 'components'],
    monorepo: false,
    testCommand: 'npm test',
    buildCommand: 'npm run build',
    lintCommand: 'npm run lint',
    hasUIComponents: true,
    criticalPaths: ['src/api/'],
  };

  return {
    repoRoot: '/tmp/test-repo',
    detection,
    runner: {
      generate: vi.fn<ClaudeRunner['generate']>().mockResolvedValue({
        filesCreated: [
          '/tmp/test-repo/.github/workflows/issue-triage.yml',
          '/tmp/test-repo/scripts/issue-triage-prompt.md',
          '/tmp/test-repo/scripts/issue-triage-guard.ts',
        ],
        filesModified: [],
      }),
      analyze: vi.fn(),
    } as unknown as ClaudeRunner,
    fileWriter: {} as HarnessContext['fileWriter'],
    userPreferences: {
      ciProvider: 'github-actions',
      strictnessLevel: 'standard',
      selectedHarnesses: ['issue-triage'],
    },
    previousOutputs: new Map(),
    ...overrides,
  };
}

describe('issueTriageHarness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct metadata', () => {
    expect(issueTriageHarness.name).toBe('issue-triage');
    expect(issueTriageHarness.displayName).toBe('Issue Triage Agent');
    expect(issueTriageHarness.order).toBe(14);
  });

  it('isApplicable should return true', () => {
    const ctx = createMockContext();
    expect(issueTriageHarness.isApplicable(ctx)).toBe(true);
  });

  it('should call runner.generate with the prompt', async () => {
    const ctx = createMockContext();
    await issueTriageHarness.execute(ctx);

    expect(ctx.runner.generate).toHaveBeenCalledOnce();
    expect(ctx.runner.generate).toHaveBeenCalledWith(
      'mocked issue triage prompt',
      'mocked system prompt',
    );
  });

  it('should return correct output with filesCreated', async () => {
    const ctx = createMockContext();
    const output = await issueTriageHarness.execute(ctx);

    expect(output.harnessName).toBe('issue-triage');
    expect(output.filesCreated).toContain('/tmp/test-repo/.github/workflows/issue-triage.yml');
    expect(output.filesCreated).toContain('/tmp/test-repo/scripts/issue-triage-prompt.md');
    expect(output.filesCreated).toContain('/tmp/test-repo/scripts/issue-triage-guard.ts');
  });

  it('should store output in previousOutputs map', async () => {
    const ctx = createMockContext();
    await issueTriageHarness.execute(ctx);

    expect(ctx.previousOutputs.has('issue-triage')).toBe(true);
    const stored = ctx.previousOutputs.get('issue-triage');
    expect(stored?.harnessName).toBe('issue-triage');
  });

  it('should include metadata with targetFiles', async () => {
    const ctx = createMockContext();
    const output = await issueTriageHarness.execute(ctx);

    expect(output.metadata).toBeDefined();
    expect(output.metadata?.targetFiles).toEqual([
      '.github/workflows/issue-triage.yml',
      'scripts/issue-triage-guard.ts',
    ]);
    expect(output.metadata?.promptFile).toBe('.codefactory/prompts/issue-triage.md');
  });

  it('should wrap errors with descriptive message', async () => {
    const ctx = createMockContext({
      runner: {
        generate: vi.fn().mockRejectedValue(new Error('Claude API timeout')),
        analyze: vi.fn(),
      } as unknown as ClaudeRunner,
    });

    await expect(issueTriageHarness.execute(ctx)).rejects.toThrow(
      'Issue triage generation failed: Claude API timeout',
    );
  });

  it('should wrap non-Error exceptions with descriptive message', async () => {
    const ctx = createMockContext({
      runner: {
        generate: vi.fn().mockRejectedValue('network failure'),
        analyze: vi.fn(),
      } as unknown as ClaudeRunner,
    });

    await expect(issueTriageHarness.execute(ctx)).rejects.toThrow(
      'Issue triage generation failed: network failure',
    );
  });
});
