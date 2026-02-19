import type { HarnessModule, HarnessContext, HarnessOutput } from './types.js';
import { buildArchitecturalLintersPrompt } from '../prompts/architectural-linters.js';
import { buildSystemPrompt } from '../prompts/system.js';

export const architecturalLintersHarness: HarnessModule = {
  name: 'architectural-linters',
  displayName: 'Architectural Linters',
  description:
    'Generates custom linter scripts enforcing dependency direction and module boundaries',
  order: 11,

  isApplicable(ctx: HarnessContext): boolean {
    return ctx.detection.architecturalLayers.length > 0;
  },

  async execute(ctx: HarnessContext): Promise<HarnessOutput> {
    const prompt = buildArchitecturalLintersPrompt(ctx.detection, ctx.userPreferences);
    const systemPrompt = buildSystemPrompt();

    try {
      const result = await ctx.runner.generate(prompt, systemPrompt);

      const output: HarnessOutput = {
        harnessName: 'architectural-linters',
        filesCreated: result.filesCreated,
        filesModified: result.filesModified,
        metadata: {
          layers: ctx.detection.architecturalLayers,
          targetFiles: [
            'scripts/lint-architecture.ts',
          ],
        },
      };

      ctx.previousOutputs.set('architectural-linters', output);

      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Architectural linters generation failed: ${message}`);
    }
  },
};
