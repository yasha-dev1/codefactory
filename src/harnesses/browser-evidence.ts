import type { HarnessModule, HarnessContext, HarnessOutput } from './types.js';
import { buildBrowserEvidencePrompt } from '../prompts/browser-evidence.js';
import { buildSystemPrompt } from '../prompts/system.js';

export const browserEvidenceHarness: HarnessModule = {
  name: 'browser-evidence',
  displayName: 'Browser Evidence Capture',
  description:
    'Generates browser evidence capture and verification scripts for UI changes',
  order: 9,

  isApplicable(ctx: HarnessContext): boolean {
    return ctx.detection.hasUIComponents === true;
  },

  async execute(ctx: HarnessContext): Promise<HarnessOutput> {
    const prompt = buildBrowserEvidencePrompt(ctx.detection, ctx.userPreferences);
    const systemPrompt = buildSystemPrompt();

    try {
      const result = await ctx.runner.generate(prompt, systemPrompt);

      const output: HarnessOutput = {
        harnessName: 'browser-evidence',
        filesCreated: result.filesCreated,
        filesModified: result.filesModified,
        metadata: {
          targetFiles: [
            'scripts/harness-ui-capture-browser-evidence.ts',
            'scripts/harness-ui-verify-browser-evidence.ts',
            '.github/workflows/browser-evidence.yml',
          ],
        },
      };

      ctx.previousOutputs.set('browser-evidence', output);

      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Browser evidence generation failed: ${message}`);
    }
  },
};
