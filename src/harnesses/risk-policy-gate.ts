import type { HarnessModule, HarnessContext, HarnessOutput } from './types.js';
import { buildRiskPolicyGatePrompt } from '../prompts/risk-policy-gate.js';
import { buildSystemPrompt } from '../prompts/system.js';

export const riskPolicyGateHarness: HarnessModule = {
  name: 'risk-policy-gate',
  displayName: 'Risk Policy Gate',
  description:
    'Generates preflight gate workflow and script with SHA discipline',
  order: 5,

  isApplicable(): boolean {
    return true;
  },

  async execute(ctx: HarnessContext): Promise<HarnessOutput> {
    const prompt = buildRiskPolicyGatePrompt(ctx.detection, ctx.userPreferences);
    const systemPrompt = buildSystemPrompt();

    try {
      const result = await ctx.runner.generate(prompt, systemPrompt);

      const output: HarnessOutput = {
        harnessName: 'risk-policy-gate',
        filesCreated: result.filesCreated,
        filesModified: result.filesModified,
        metadata: {
          workflowPath: '.github/workflows/risk-policy-gate.yml',
          scriptPath: 'scripts/risk-policy-gate.ts',
        },
      };

      ctx.previousOutputs.set('risk-policy-gate', output);

      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Risk policy gate generation failed: ${message}`);
    }
  },
};
