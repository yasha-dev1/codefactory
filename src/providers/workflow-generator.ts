import { stringify } from 'yaml';
import type { AIPlatform } from '../core/ai-runner.js';
import { CI_AGENT_ACTIONS } from '../core/ai-runner.js';
import type { StageDefinition } from '../core/stage-types.js';

export interface WorkflowGeneratorOptions {
  stage: StageDefinition;
  platform: AIPlatform;
  allStages: StageDefinition[];
}

export function generateStageWorkflow(options: WorkflowGeneratorOptions): string {
  const { stage, platform, allStages } = options;
  const workflowName = `Stage: ${stage.label}`;

  const workflow: Record<string, unknown> = {
    name: workflowName,
    on: buildTriggers(stage),
    permissions: buildPermissions(platform),
    jobs: {
      'run-stage': buildJob(stage, platform, allStages),
    },
  };

  return stringify(workflow, { lineWidth: 0 });
}

export function generateWorkflowFileName(stage: StageDefinition): string {
  const slug = stage.id.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  return `harnext-stage-${slug}.yml`;
}

function buildTriggers(_stage: StageDefinition): Record<string, unknown> {
  return {
    issues: {
      types: ['labeled'],
    },
    workflow_dispatch: {
      inputs: {
        issue: {
          description: 'Issue number to process',
          required: true,
          type: 'number',
        },
      },
    },
  };
}

function buildPermissions(platform: AIPlatform): Record<string, string> {
  const perms: Record<string, string> = {
    contents: 'read',
    issues: 'write',
  };

  if (platform === 'codex') {
    perms['contents'] = 'write';
    perms['pull-requests'] = 'write';
  }

  if (platform === 'claude' || platform === 'kiro') {
    perms['id-token'] = 'write';
  }

  return perms;
}

function buildJob(
  stage: StageDefinition,
  platform: AIPlatform,
  allStages: StageDefinition[],
): Record<string, unknown> {
  const steps = buildSteps(stage, platform, allStages);

  return {
    name: `Run stage: ${stage.label}`,
    'runs-on': 'ubuntu-latest',
    if: `github.event_name == 'workflow_dispatch' || (github.event.label.name == '${escapeGhaExpression(stage.label)}')`,
    steps,
  };
}

function buildSteps(
  stage: StageDefinition,
  platform: AIPlatform,
  allStages: StageDefinition[],
): Record<string, unknown>[] {
  const steps: Record<string, unknown>[] = [];

  steps.push({
    name: 'Checkout repository',
    uses: 'actions/checkout@v4',
  });

  steps.push(...buildAgentSteps(stage, platform));

  steps.push(buildLabelTransitionStep(stage, allStages));

  return steps;
}

function buildAgentSteps(stage: StageDefinition, platform: AIPlatform): Record<string, unknown>[] {
  if (platform === 'claude') {
    return buildClaudeSteps(stage);
  }
  if (platform === 'codex') {
    return buildCodexSteps(stage);
  }
  return buildKiroSteps(stage);
}

function buildClaudeSteps(stage: StageDefinition): Record<string, unknown>[] {
  const action = CI_AGENT_ACTIONS.claude;
  return [
    {
      name: 'Run Claude Code',
      id: 'agent',
      uses: action.action,
      with: {
        [action.secretInputKey]: `\${{ secrets.${action.secretName} }}`,
        [action.promptInputKey]: buildPromptExpression(stage),
      },
    },
  ];
}

function buildCodexSteps(stage: StageDefinition): Record<string, unknown>[] {
  const action = CI_AGENT_ACTIONS.codex;
  return [
    {
      name: 'Run Codex',
      id: 'agent',
      uses: action.action,
      with: {
        [action.secretInputKey]: `\${{ secrets.${action.secretName} }}`,
        [action.promptInputKey]: buildPromptExpression(stage),
      },
    },
  ];
}

function buildKiroSteps(stage: StageDefinition): Record<string, unknown>[] {
  return [
    {
      name: 'Configure AWS credentials',
      'continue-on-error': true,
      uses: 'aws-actions/configure-aws-credentials@v4',
      with: {
        'role-to-assume': '${{ secrets.AWS_ROLE_ARN }}',
        'aws-access-key-id': '${{ secrets.AWS_ACCESS_KEY_ID }}',
        'aws-secret-access-key': '${{ secrets.AWS_SECRET_ACCESS_KEY }}',
        'aws-region': "${{ vars.AWS_REGION || 'us-east-1' }}",
      },
    },
    {
      name: 'Setup Kiro CLI',
      uses: 'clouatre-labs/setup-kiro-action@v1',
      with: {
        'enable-sigv4': 'true',
        'aws-region': "${{ vars.AWS_REGION || 'us-east-1' }}",
      },
    },
    {
      name: 'Run Kiro agent',
      id: 'agent',
      env: {
        KIRO_PROMPT: buildPromptExpression(stage),
      },
      run: 'kiro-cli-chat chat --no-interactive --trust-all-tools "$KIRO_PROMPT"',
    },
  ];
}

function buildPromptExpression(stage: StageDefinition): string {
  return `${stage.prompt}\n\nIssue context: \${{ github.event.issue.title }} — \${{ github.event.issue.body }}`;
}

function escapeGhaExpression(s: string): string {
  return s.replace(/'/g, "''");
}

function escapeShellArg(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function buildLabelTransitionStep(
  stage: StageDefinition,
  allStages: StageDefinition[],
): Record<string, unknown> {
  const nextLabel = resolveNextLabel(stage, allStages);
  const issueRef = '${{ github.event.issue.number || github.event.inputs.issue }}';

  let script = `gh issue edit "${issueRef}" --remove-label ${escapeShellArg(stage.label)}`;
  if (nextLabel) {
    script += `\ngh issue edit "${issueRef}" --add-label ${escapeShellArg(nextLabel)}`;
  }

  return {
    name: 'Transition labels',
    env: {
      GH_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
    },
    run: script,
  };
}

function resolveNextLabel(stage: StageDefinition, allStages: StageDefinition[]): string | null {
  if (stage.mode === 'human-approval') {
    return 'harnext:awaiting-approval';
  }

  const currentIndex = allStages.findIndex((s) => s.id === stage.id);
  if (currentIndex >= 0 && currentIndex < allStages.length - 1) {
    return allStages[currentIndex + 1].label;
  }

  return null;
}
