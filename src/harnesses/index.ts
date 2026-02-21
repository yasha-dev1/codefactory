import type { HarnessModule } from './types.js';

import { riskContractHarness } from './risk-contract.js';
import { claudeMdHarness } from './claude-md.js';
import { docsStructureHarness } from './docs-structure.js';
import { preCommitHooksHarness } from './pre-commit-hooks.js';
import { riskPolicyGateHarness } from './risk-policy-gate.js';
import { ciPipelineHarness } from './ci-pipeline.js';
import { reviewAgentHarness } from './review-agent.js';
import { remediationLoopHarness } from './remediation-loop.js';
import { browserEvidenceHarness } from './browser-evidence.js';
import { prTemplatesHarness } from './pr-templates.js';
import { architecturalLintersHarness } from './architectural-linters.js';
import { garbageCollectionHarness } from './garbage-collection.js';
import { incidentHarnessLoopHarness } from './incident-harness-loop.js';
import { issueTriageHarness } from './issue-triage.js';
import { issuePlannerHarness } from './issue-planner.js';
import { issueImplementerHarness } from './issue-implementer.js';
import { skillsInstallerHarness } from './skills-installer.js';

const allHarnesses: HarnessModule[] = [
  riskContractHarness,
  claudeMdHarness,
  docsStructureHarness,
  preCommitHooksHarness,
  riskPolicyGateHarness,
  ciPipelineHarness,
  reviewAgentHarness,
  remediationLoopHarness,
  browserEvidenceHarness,
  prTemplatesHarness,
  architecturalLintersHarness,
  garbageCollectionHarness,
  incidentHarnessLoopHarness,
  issueTriageHarness,
  issuePlannerHarness,
  issueImplementerHarness,
  skillsInstallerHarness,
];

export function getHarnessModules(): HarnessModule[] {
  return [...allHarnesses].sort((a, b) => a.order - b.order);
}

export function getHarnessById(name: string): HarnessModule | undefined {
  return allHarnesses.find((h) => h.name === name);
}

export {
  type HarnessModule,
  type HarnessContext,
  type HarnessOutput,
  type UserPreferences,
} from './types.js';
