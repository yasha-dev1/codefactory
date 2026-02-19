import type { HarnessModule, HarnessContext, HarnessOutput } from './types.js';
import { buildPrTemplatesPrompt } from '../prompts/pr-templates.js';
import { buildSystemPrompt } from '../prompts/system.js';

export const prTemplatesHarness: HarnessModule = {
  name: 'pr-templates',
  displayName: 'PR Templates',
  description:
    'Generates pull request templates with risk tier and evidence sections',
  order: 10,

  isApplicable(): boolean {
    return true;
  },

  async execute(ctx: HarnessContext): Promise<HarnessOutput> {
    const prompt = buildPrTemplatesPrompt(ctx.detection, ctx.userPreferences);
    const systemPrompt = buildSystemPrompt();

    try {
      const result = await ctx.runner.generate(prompt, systemPrompt);

      const output: HarnessOutput = {
        harnessName: 'pr-templates',
        filesCreated: result.filesCreated,
        filesModified: result.filesModified,
        metadata: {
          targetFiles: [
            '.github/PULL_REQUEST_TEMPLATE.md',
            '.github/PULL_REQUEST_TEMPLATE/agent-pr.md',
          ],
        },
      };

      ctx.previousOutputs.set('pr-templates', output);

      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`PR templates generation failed: ${message}`);
    }
  },
};
