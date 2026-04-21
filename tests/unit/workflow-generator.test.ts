import { parse } from 'yaml';
import {
  generateStageWorkflow,
  generateWorkflowFileName,
} from '../../src/providers/workflow-generator.js';
import type { StageDefinition } from '../../src/core/stage-types.js';

const triageStage: StageDefinition = {
  id: 'triage',
  label: 'harnext:triage',
  prompt: 'Triage this issue and assign priority',
  mode: 'yolo',
  runner: { location: 'github-actions', workflowFile: '', generated: true },
};

const implementStage: StageDefinition = {
  id: 'implement',
  label: 'harnext:implement',
  prompt: 'Implement the feature described',
  mode: 'human-approval',
  runner: { location: 'github-actions', workflowFile: '', generated: true },
};

const allStages: StageDefinition[] = [triageStage, implementStage];

describe('generateWorkflowFileName', () => {
  it('should produce a kebab-case filename from stage id', () => {
    expect(generateWorkflowFileName(triageStage)).toBe('harnext-stage-triage.yml');
  });

  it('should sanitize special characters in stage id', () => {
    const stage = { ...triageStage, id: 'My Stage #1!' };
    expect(generateWorkflowFileName(stage)).toBe('harnext-stage-my-stage--1-.yml');
  });
});

describe('generateStageWorkflow', () => {
  describe('common structure', () => {
    it('should produce valid YAML with name, on, permissions, and jobs', () => {
      const yaml = generateStageWorkflow({
        stage: triageStage,
        platform: 'claude',
        allStages,
      });
      const parsed = parse(yaml);
      expect(parsed.name).toBe('Stage: harnext:triage');
      expect(parsed.on).toBeDefined();
      expect(parsed.permissions).toBeDefined();
      expect(parsed.jobs).toBeDefined();
    });

    it('should include issues labeled trigger', () => {
      const yaml = generateStageWorkflow({
        stage: triageStage,
        platform: 'claude',
        allStages,
      });
      const parsed = parse(yaml);
      expect(parsed.on.issues.types).toContain('labeled');
    });

    it('should include workflow_dispatch trigger with issue input', () => {
      const yaml = generateStageWorkflow({
        stage: triageStage,
        platform: 'claude',
        allStages,
      });
      const parsed = parse(yaml);
      expect(parsed.on.workflow_dispatch.inputs.issue).toBeDefined();
      expect(parsed.on.workflow_dispatch.inputs.issue.required).toBe(true);
    });

    it('should include checkout step', () => {
      const yaml = generateStageWorkflow({
        stage: triageStage,
        platform: 'claude',
        allStages,
      });
      const parsed = parse(yaml);
      const steps = parsed.jobs['run-stage'].steps;
      expect(steps[0].uses).toBe('actions/checkout@v4');
    });

    it('should include label transition step as last step', () => {
      const yaml = generateStageWorkflow({
        stage: triageStage,
        platform: 'claude',
        allStages,
      });
      const parsed = parse(yaml);
      const steps = parsed.jobs['run-stage'].steps;
      const lastStep = steps[steps.length - 1];
      expect(lastStep.name).toBe('Transition labels');
      expect(lastStep.run).toContain(triageStage.label);
    });

    it('should filter job by stage label', () => {
      const yaml = generateStageWorkflow({
        stage: triageStage,
        platform: 'claude',
        allStages,
      });
      const parsed = parse(yaml);
      expect(parsed.jobs['run-stage'].if).toContain(triageStage.label);
    });
  });

  describe('label transitions', () => {
    it('should transition to next stage label for yolo mode', () => {
      const yaml = generateStageWorkflow({
        stage: triageStage,
        platform: 'claude',
        allStages,
      });
      const parsed = parse(yaml);
      const steps = parsed.jobs['run-stage'].steps;
      const labelStep = steps[steps.length - 1];
      expect(labelStep.run).toContain("--remove-label 'harnext:triage'");
      expect(labelStep.run).toContain("--add-label 'harnext:implement'");
    });

    it('should transition to awaiting-approval for human-approval mode', () => {
      const yaml = generateStageWorkflow({
        stage: implementStage,
        platform: 'claude',
        allStages,
      });
      const parsed = parse(yaml);
      const steps = parsed.jobs['run-stage'].steps;
      const labelStep = steps[steps.length - 1];
      expect(labelStep.run).toContain("--remove-label 'harnext:implement'");
      expect(labelStep.run).toContain("--add-label 'harnext:awaiting-approval'");
    });

    it('should only remove label for last yolo stage with no next stage', () => {
      const singleStage: StageDefinition = {
        id: 'only',
        label: 'harnext:only',
        prompt: 'Do everything',
        mode: 'yolo',
        runner: { location: 'local' },
      };
      const yaml = generateStageWorkflow({
        stage: singleStage,
        platform: 'claude',
        allStages: [singleStage],
      });
      const parsed = parse(yaml);
      const steps = parsed.jobs['run-stage'].steps;
      const labelStep = steps[steps.length - 1];
      expect(labelStep.run).toContain("--remove-label 'harnext:only'");
      expect(labelStep.run).not.toContain('--add-label');
    });

    it('should escape shell metacharacters in labels to prevent injection', () => {
      const maliciousStage: StageDefinition = {
        id: 'evil',
        label: 'harnext:triage"; rm -rf /',
        prompt: 'Triage this',
        mode: 'yolo',
        runner: { location: 'github-actions', workflowFile: '', generated: true },
      };
      const yaml = generateStageWorkflow({
        stage: maliciousStage,
        platform: 'claude',
        allStages: [maliciousStage],
      });
      const parsed = parse(yaml);
      const steps = parsed.jobs['run-stage'].steps;
      const labelStep = steps[steps.length - 1];
      expect(labelStep.run).not.toContain('--remove-label "');
      expect(labelStep.run).toContain("--remove-label 'harnext:triage\"; rm -rf /'");
    });

    it('should escape single quotes in GHA if-expression to prevent syntax errors', () => {
      const stageWithQuote: StageDefinition = {
        id: 'quoted',
        label: "it's-a-label",
        prompt: 'Do work',
        mode: 'yolo',
        runner: { location: 'local' },
      };
      const yaml = generateStageWorkflow({
        stage: stageWithQuote,
        platform: 'claude',
        allStages: [stageWithQuote],
      });
      const parsed = parse(yaml);
      const ifExpr = parsed.jobs['run-stage'].if;
      expect(ifExpr).toContain("it''s-a-label");
      expect(ifExpr).not.toContain("it's-a-label");
    });

    it('should POSIX-escape labels containing single quotes', () => {
      const stageWithQuote: StageDefinition = {
        id: 'quoted',
        label: "it's-a-label",
        prompt: 'Do work',
        mode: 'yolo',
        runner: { location: 'local' },
      };
      const yaml = generateStageWorkflow({
        stage: stageWithQuote,
        platform: 'claude',
        allStages: [stageWithQuote],
      });
      const parsed = parse(yaml);
      const steps = parsed.jobs['run-stage'].steps;
      const labelStep = steps[steps.length - 1];
      expect(labelStep.run).toContain("--remove-label 'it'\\''s-a-label'");
    });
  });

  describe('claude platform', () => {
    it('should use claude-code-action', () => {
      const yaml = generateStageWorkflow({
        stage: triageStage,
        platform: 'claude',
        allStages,
      });
      const parsed = parse(yaml);
      const steps = parsed.jobs['run-stage'].steps;
      const agentStep = steps.find((s: Record<string, unknown>) => s.id === 'agent');
      expect(agentStep).toBeDefined();
      expect(agentStep.uses).toBe('anthropics/claude-code-action@v1');
    });

    it('should reference CLAUDE_CODE_OAUTH_TOKEN secret', () => {
      const yaml = generateStageWorkflow({
        stage: triageStage,
        platform: 'claude',
        allStages,
      });
      expect(yaml).toContain('CLAUDE_CODE_OAUTH_TOKEN');
    });

    it('should include id-token write permission', () => {
      const yaml = generateStageWorkflow({
        stage: triageStage,
        platform: 'claude',
        allStages,
      });
      const parsed = parse(yaml);
      expect(parsed.permissions['id-token']).toBe('write');
    });

    it('should include the stage prompt in the agent step', () => {
      const yaml = generateStageWorkflow({
        stage: triageStage,
        platform: 'claude',
        allStages,
      });
      expect(yaml).toContain('Triage this issue and assign priority');
    });
  });

  describe('codex platform', () => {
    it('should use codex-action', () => {
      const yaml = generateStageWorkflow({
        stage: triageStage,
        platform: 'codex',
        allStages,
      });
      const parsed = parse(yaml);
      const steps = parsed.jobs['run-stage'].steps;
      const agentStep = steps.find((s: Record<string, unknown>) => s.id === 'agent');
      expect(agentStep).toBeDefined();
      expect(agentStep.uses).toBe('openai/codex-action@v1');
    });

    it('should reference OPENAI_API_KEY secret', () => {
      const yaml = generateStageWorkflow({
        stage: triageStage,
        platform: 'codex',
        allStages,
      });
      expect(yaml).toContain('OPENAI_API_KEY');
    });

    it('should NOT include id-token write permission', () => {
      const yaml = generateStageWorkflow({
        stage: triageStage,
        platform: 'codex',
        allStages,
      });
      const parsed = parse(yaml);
      expect(parsed.permissions['id-token']).toBeUndefined();
    });
  });

  describe('kiro platform', () => {
    it('should include AWS credentials step', () => {
      const yaml = generateStageWorkflow({
        stage: triageStage,
        platform: 'kiro',
        allStages,
      });
      const parsed = parse(yaml);
      const steps = parsed.jobs['run-stage'].steps;
      const awsStep = steps.find(
        (s: Record<string, unknown>) => s.name === 'Configure AWS credentials',
      );
      expect(awsStep).toBeDefined();
      expect(awsStep.uses).toBe('aws-actions/configure-aws-credentials@v4');
      expect(awsStep['continue-on-error']).toBe(true);
    });

    it('should include Kiro CLI setup step', () => {
      const yaml = generateStageWorkflow({
        stage: triageStage,
        platform: 'kiro',
        allStages,
      });
      const parsed = parse(yaml);
      const steps = parsed.jobs['run-stage'].steps;
      const setupStep = steps.find((s: Record<string, unknown>) => s.name === 'Setup Kiro CLI');
      expect(setupStep).toBeDefined();
      expect(setupStep.uses).toBe('clouatre-labs/setup-kiro-action@v1');
    });

    it('should include kiro-cli-chat run step', () => {
      const yaml = generateStageWorkflow({
        stage: triageStage,
        platform: 'kiro',
        allStages,
      });
      const parsed = parse(yaml);
      const steps = parsed.jobs['run-stage'].steps;
      const runStep = steps.find((s: Record<string, unknown>) => s.id === 'agent');
      expect(runStep).toBeDefined();
      expect(runStep.run).toContain('kiro-cli-chat');
    });

    it('should pass prompt via env block (shell expansion safety)', () => {
      const yaml = generateStageWorkflow({
        stage: triageStage,
        platform: 'kiro',
        allStages,
      });
      const parsed = parse(yaml);
      const steps = parsed.jobs['run-stage'].steps;
      const runStep = steps.find((s: Record<string, unknown>) => s.id === 'agent');
      expect(runStep.env.KIRO_PROMPT).toBeDefined();
      expect(runStep.run).toContain('$KIRO_PROMPT');
    });

    it('should include id-token write permission', () => {
      const yaml = generateStageWorkflow({
        stage: triageStage,
        platform: 'kiro',
        allStages,
      });
      const parsed = parse(yaml);
      expect(parsed.permissions['id-token']).toBe('write');
    });
  });
});
