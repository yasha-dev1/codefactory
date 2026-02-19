import type { HarnessModule, HarnessContext, HarnessOutput } from './types.js';
import { buildDocsStructurePrompt } from '../prompts/docs-structure.js';
import { buildSystemPrompt } from '../prompts/system.js';

export const docsStructureHarness: HarnessModule = {
  name: 'docs-structure',
  displayName: 'Documentation Structure',
  description: 'Generates architecture, conventions, and layers documentation',
  order: 3,

  isApplicable(): boolean {
    return true;
  },

  async execute(ctx: HarnessContext): Promise<HarnessOutput> {
    const prompt = buildDocsStructurePrompt(ctx.detection, ctx.userPreferences);
    const systemPrompt = buildSystemPrompt();

    try {
      const result = await ctx.runner.generate(prompt, systemPrompt);

      const output: HarnessOutput = {
        harnessName: 'docs-structure',
        filesCreated: result.filesCreated,
        filesModified: result.filesModified,
        metadata: {
          targetFiles: [
            'docs/architecture.md',
            'docs/conventions.md',
            'docs/layers.md',
          ],
        },
      };

      ctx.previousOutputs.set('docs-structure', output);

      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Documentation structure generation failed: ${message}`);
    }
  },
};
