import type { HarnessModule, HarnessContext, HarnessOutput } from './types.js';
import { buildRiskContractPrompt } from '../prompts/risk-contract.js';
import { buildSystemPrompt } from '../prompts/system.js';

export const riskContractHarness: HarnessModule = {
  name: 'risk-contract',
  displayName: 'Risk Contract',
  description:
    'Generates harness.config.json with risk tier rules, merge policies, and evidence requirements',
  order: 1,

  isApplicable(): boolean {
    return true;
  },

  async execute(ctx: HarnessContext): Promise<HarnessOutput> {
    const prompt = buildRiskContractPrompt(ctx.detection, ctx.userPreferences);
    const systemPrompt = buildSystemPrompt();

    try {
      const result = await ctx.runner.generate(prompt, systemPrompt);

      const output: HarnessOutput = {
        harnessName: 'risk-contract',
        filesCreated: result.filesCreated,
        filesModified: result.filesModified,
        metadata: {
          configPath: 'harness.config.json',
        },
      };

      ctx.previousOutputs.set('risk-contract', output);

      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Risk contract generation failed: ${message}`);
    }
  },
};
