import type { HarnessModule, HarnessContext, HarnessOutput } from './types.js';
import { buildCiPipelinePrompt } from '../prompts/ci-pipeline.js';
import { buildSystemPrompt } from '../prompts/system.js';

export const ciPipelineHarness: HarnessModule = {
  name: 'ci-pipeline',
  displayName: 'CI Pipeline',
  description: 'Generates risk-tiered CI/CD pipeline workflows',
  order: 6,

  isApplicable(): boolean {
    return true;
  },

  async execute(ctx: HarnessContext): Promise<HarnessOutput> {
    const prompt = buildCiPipelinePrompt(ctx.detection, ctx.userPreferences);
    const systemPrompt = buildSystemPrompt();

    try {
      const result = await ctx.runner.generate(prompt, systemPrompt);

      const output: HarnessOutput = {
        harnessName: 'ci-pipeline',
        filesCreated: result.filesCreated,
        filesModified: result.filesModified,
        metadata: {
          ciWorkflowPath: '.github/workflows/ci.yml',
          structuralTestsPath: '.github/workflows/structural-tests.yml',
          harnessSmokePath: '.github/workflows/harness-smoke.yml',
        },
      };

      ctx.previousOutputs.set('ci-pipeline', output);

      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`CI pipeline generation failed: ${message}`);
    }
  },
};
