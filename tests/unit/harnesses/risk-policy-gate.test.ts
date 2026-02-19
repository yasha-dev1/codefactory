import { riskPolicyGateHarness } from '../../../src/harnesses/risk-policy-gate.js';
import type { HarnessContext } from '../../../src/harnesses/types.js';
import type { ClaudeRunner } from '../../../src/core/claude-runner.js';
import type { DetectionResult } from '../../../src/core/detector.js';

vi.mock('../../../src/prompts/risk-policy-gate.js', () => ({
  buildRiskPolicyGatePrompt: vi.fn().mockReturnValue('mocked risk-policy-gate prompt'),
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
          '/tmp/test-repo/.github/workflows/risk-policy-gate.yml',
          '/tmp/test-repo/scripts/risk-policy-gate.ts',
        ],
        filesModified: [],
      }),
      analyze: vi.fn(),
    } as unknown as ClaudeRunner,
    fileWriter: {} as HarnessContext['fileWriter'],
    userPreferences: {
      ciProvider: 'github-actions',
      strictnessLevel: 'standard',
      selectedHarnesses: ['risk-policy-gate'],
    },
    previousOutputs: new Map(),
    ...overrides,
  };
}

describe('riskPolicyGateHarness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct metadata', () => {
    expect(riskPolicyGateHarness.name).toBe('risk-policy-gate');
    expect(riskPolicyGateHarness.displayName).toBe('Risk Policy Gate');
    expect(riskPolicyGateHarness.order).toBe(5);
  });

  it('isApplicable should return true', () => {
    const ctx = createMockContext();
    expect(riskPolicyGateHarness.isApplicable(ctx)).toBe(true);
  });

  it('should call runner.generate with the prompt', async () => {
    const ctx = createMockContext();
    await riskPolicyGateHarness.execute(ctx);

    expect(ctx.runner.generate).toHaveBeenCalledOnce();
    expect(ctx.runner.generate).toHaveBeenCalledWith(
      'mocked risk-policy-gate prompt',
      'mocked system prompt',
    );
  });

  it('should include workflow file in filesCreated', async () => {
    const ctx = createMockContext();
    const output = await riskPolicyGateHarness.execute(ctx);

    expect(output.filesCreated).toContain(
      '/tmp/test-repo/.github/workflows/risk-policy-gate.yml',
    );
  });

  it('should include script file in filesCreated', async () => {
    const ctx = createMockContext();
    const output = await riskPolicyGateHarness.execute(ctx);

    expect(output.filesCreated).toContain('/tmp/test-repo/scripts/risk-policy-gate.ts');
  });

  it('should include metadata with workflowPath and scriptPath', async () => {
    const ctx = createMockContext();
    const output = await riskPolicyGateHarness.execute(ctx);

    expect(output.metadata).toBeDefined();
    expect(output.metadata?.workflowPath).toBe('.github/workflows/risk-policy-gate.yml');
    expect(output.metadata?.scriptPath).toBe('scripts/risk-policy-gate.ts');
  });

  it('should store output in previousOutputs map', async () => {
    const ctx = createMockContext();
    await riskPolicyGateHarness.execute(ctx);

    expect(ctx.previousOutputs.has('risk-policy-gate')).toBe(true);
    const stored = ctx.previousOutputs.get('risk-policy-gate');
    expect(stored?.harnessName).toBe('risk-policy-gate');
  });

  it('should wrap errors with descriptive message', async () => {
    const ctx = createMockContext({
      runner: {
        generate: vi.fn().mockRejectedValue(new Error('Network error')),
        analyze: vi.fn(),
      } as unknown as ClaudeRunner,
    });

    await expect(riskPolicyGateHarness.execute(ctx)).rejects.toThrow(
      'Risk policy gate generation failed: Network error',
    );
  });
});
