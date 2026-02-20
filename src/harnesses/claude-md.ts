import type { HarnessModule, HarnessContext, HarnessOutput } from './types.js';
import { buildClaudeMdPrompt } from '../prompts/claude-md.js';
import { buildSystemPrompt } from '../prompts/system.js';

export const claudeMdHarness: HarnessModule = {
  name: 'claude-md',
  displayName: 'CLAUDE.md',
  description: 'Generates CLAUDE.md agent instruction file',
  order: 2,

  isApplicable(): boolean {
    return true;
  },

  async execute(ctx: HarnessContext): Promise<HarnessOutput> {
    const prompt = buildClaudeMdPrompt(ctx.detection, ctx.userPreferences);
    const systemPrompt = buildSystemPrompt();

    try {
      const result = await ctx.runner.generate(prompt, systemPrompt);

      const output: HarnessOutput = {
        harnessName: 'claude-md',
        filesCreated: result.filesCreated,
        filesModified: result.filesModified,
        metadata: {
          targetFiles: ['CLAUDE.md', '.mcp.json'],
        },
      };

      ctx.previousOutputs.set('claude-md', output);

      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`CLAUDE.md generation failed: ${message}`);
    }
  },
};
