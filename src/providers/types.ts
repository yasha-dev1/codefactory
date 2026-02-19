export interface CIProvider {
  name: string;
  workflowDir: string;
  generateWorkflow(config: WorkflowConfig): string;
  generateMatrix(config: MatrixConfig): string;
}

export interface WorkflowConfig {
  name: string;
  triggers: WorkflowTrigger[];
  jobs: WorkflowJob[];
  env?: Record<string, string>;
}

export interface WorkflowTrigger {
  event: string;
  config?: Record<string, unknown>;
}

export interface WorkflowJob {
  name: string;
  id: string;
  runsOn?: string;
  needs?: string[];
  steps: WorkflowStep[];
  env?: Record<string, string>;
  if?: string;
}

export interface WorkflowStep {
  name: string;
  uses?: string;
  run?: string;
  with?: Record<string, string>;
  env?: Record<string, string>;
  if?: string;
}

export interface MatrixConfig {
  dimensions: Record<string, string[]>;
}
