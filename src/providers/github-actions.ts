import { stringify } from 'yaml';
import type { CIProvider, WorkflowConfig, WorkflowStep, MatrixConfig } from './types.js';

export class GitHubActionsProvider implements CIProvider {
  name = 'github-actions';
  workflowDir = '.github/workflows';

  generateWorkflow(config: WorkflowConfig): string {
    const workflow: Record<string, unknown> = {
      name: config.name,
      on: this.buildTriggers(config.triggers),
    };

    if (config.env && Object.keys(config.env).length > 0) {
      workflow['env'] = config.env;
    }

    workflow['jobs'] = this.buildJobs(config.jobs);

    return stringify(workflow, { lineWidth: 0 });
  }

  generateMatrix(config: MatrixConfig): string {
    const strategy = {
      strategy: {
        matrix: config.dimensions,
      },
    };

    return stringify(strategy, { lineWidth: 0 });
  }

  checkoutStep(): WorkflowStep {
    return {
      name: 'Checkout repository',
      uses: 'actions/checkout@v4',
    };
  }

  nodeSetupStep(version: string): WorkflowStep {
    return {
      name: 'Set up Node.js',
      uses: 'actions/setup-node@v4',
      with: { 'node-version': version },
    };
  }

  pythonSetupStep(version: string): WorkflowStep {
    return {
      name: 'Set up Python',
      uses: 'actions/setup-python@v5',
      with: { 'python-version': version },
    };
  }

  cacheStep(type: 'npm' | 'pip'): WorkflowStep {
    if (type === 'npm') {
      return {
        name: 'Cache npm dependencies',
        uses: 'actions/cache@v4',
        with: {
          path: '~/.npm',
          key: "${{ runner.os }}-npm-${{ hashFiles('**/package-lock.json') }}",
          'restore-keys': '${{ runner.os }}-npm-',
        },
      };
    }

    return {
      name: 'Cache pip dependencies',
      uses: 'actions/cache@v4',
      with: {
        path: '~/.cache/pip',
        key: "${{ runner.os }}-pip-${{ hashFiles('**/requirements*.txt') }}",
        'restore-keys': '${{ runner.os }}-pip-',
      },
    };
  }

  private buildTriggers(
    triggers: WorkflowConfig['triggers'],
  ): Record<string, unknown> {
    const on: Record<string, unknown> = {};
    for (const trigger of triggers) {
      on[trigger.event] = trigger.config ?? null;
    }
    return on;
  }

  private buildJobs(
    jobs: WorkflowConfig['jobs'],
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const job of jobs) {
      const jobDef: Record<string, unknown> = {
        name: job.name,
        'runs-on': job.runsOn ?? 'ubuntu-latest',
      };

      if (job.needs && job.needs.length > 0) {
        jobDef['needs'] = job.needs;
      }

      if (job.if) {
        jobDef['if'] = job.if;
      }

      if (job.env && Object.keys(job.env).length > 0) {
        jobDef['env'] = job.env;
      }

      jobDef['steps'] = job.steps.map((step) => this.buildStep(step));

      result[job.id] = jobDef;
    }

    return result;
  }

  private buildStep(step: WorkflowStep): Record<string, unknown> {
    const result: Record<string, unknown> = { name: step.name };

    if (step.if) {
      result['if'] = step.if;
    }
    if (step.uses) {
      result['uses'] = step.uses;
    }
    if (step.run) {
      result['run'] = step.run;
    }
    if (step.with && Object.keys(step.with).length > 0) {
      result['with'] = step.with;
    }
    if (step.env && Object.keys(step.env).length > 0) {
      result['env'] = step.env;
    }

    return result;
  }
}

export const githubActionsProvider = new GitHubActionsProvider();
