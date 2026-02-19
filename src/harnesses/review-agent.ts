import type { HarnessModule, HarnessContext, HarnessOutput } from './types.js';
import { buildReviewAgentPrompt } from '../prompts/review-agent.js';
import { buildSystemPrompt } from '../prompts/system.js';

export const reviewAgentHarness: HarnessModule = {
  name: 'review-agent',
  displayName: 'Review Agent Integration',
  description:
    'Generates code review agent workflows with SHA-deduped reruns and auto-resolve',
  order: 7,

  isApplicable(): boolean {
    return true;
  },

  async execute(ctx: HarnessContext): Promise<HarnessOutput> {
    const prompt = buildReviewAgentPrompt(ctx.detection, ctx.userPreferences);
    const systemPrompt = buildSystemPrompt();

    try {
      const result = await ctx.runner.generate(prompt, systemPrompt);

      const output: HarnessOutput = {
        harnessName: 'review-agent',
        filesCreated: result.filesCreated,
        filesModified: result.filesModified,
        metadata: {
          codeReviewWorkflowPath: '.github/workflows/code-review-agent.yml',
          rerunWorkflowPath: '.github/workflows/review-agent-rerun.yml',
          autoResolveWorkflowPath: '.github/workflows/auto-resolve-threads.yml',
          utilsPath: 'scripts/review-agent-utils.ts',
        },
      };

      ctx.previousOutputs.set('review-agent', output);

      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Review agent generation failed: ${message}`);
    }
  },
};
