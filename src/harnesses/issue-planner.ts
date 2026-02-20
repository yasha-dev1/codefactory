import type { HarnessModule, HarnessContext, HarnessOutput } from './types.js';
import { buildIssuePlannerPrompt } from '../prompts/issue-planner.js';
import { buildSystemPrompt } from '../prompts/system.js';

export const issuePlannerHarness: HarnessModule = {
  name: 'issue-planner',
  displayName: 'Issue Planner Agent',
  description:
    'Generates a workflow that spawns an AI agent to produce implementation plans for triaged issues',
  order: 15,

  isApplicable(): boolean {
    return true;
  },

  async execute(ctx: HarnessContext): Promise<HarnessOutput> {
    const prompt = buildIssuePlannerPrompt(ctx.detection, ctx.userPreferences);
    const systemPrompt = buildSystemPrompt();

    try {
      const result = await ctx.runner.generate(prompt, systemPrompt);

      const output: HarnessOutput = {
        harnessName: 'issue-planner',
        filesCreated: result.filesCreated,
        filesModified: result.filesModified,
        metadata: {
          targetFiles: ['.github/workflows/issue-planner.yml', 'scripts/issue-planner-guard.ts'],
          promptFile: '.codefactory/prompts/issue-planner.md',
        },
      };

      ctx.previousOutputs.set('issue-planner', output);

      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Issue planner generation failed: ${message}`);
    }
  },
};
