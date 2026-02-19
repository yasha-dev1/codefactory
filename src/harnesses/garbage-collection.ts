import type { HarnessModule, HarnessContext, HarnessOutput } from './types.js';
import { buildGarbageCollectionPrompt } from '../prompts/garbage-collection.js';
import { buildSystemPrompt } from '../prompts/system.js';

export const garbageCollectionHarness: HarnessModule = {
  name: 'garbage-collection',
  displayName: 'Documentation Garbage Collection',
  description:
    'Generates scheduled doc-gardening workflow for keeping documentation fresh',
  order: 12,

  isApplicable(): boolean {
    return true;
  },

  async execute(ctx: HarnessContext): Promise<HarnessOutput> {
    const prompt = buildGarbageCollectionPrompt(ctx.detection, ctx.userPreferences);
    const systemPrompt = buildSystemPrompt();

    try {
      const result = await ctx.runner.generate(prompt, systemPrompt);

      const output: HarnessOutput = {
        harnessName: 'garbage-collection',
        filesCreated: result.filesCreated,
        filesModified: result.filesModified,
        metadata: {
          targetFiles: [
            '.github/workflows/doc-gardening.yml',
            'scripts/doc-gardening-prompt.md',
          ],
        },
      };

      ctx.previousOutputs.set('garbage-collection', output);

      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Documentation garbage collection generation failed: ${message}`);
    }
  },
};
