import type { HarnessModule, HarnessContext, HarnessOutput } from './types.js';
import { buildIncidentHarnessLoopPrompt } from '../prompts/incident-harness-loop.js';
import { buildSystemPrompt } from '../prompts/system.js';

export const incidentHarnessLoopHarness: HarnessModule = {
  name: 'incident-harness-loop',
  displayName: 'Incident-to-Harness Loop',
  description:
    'Generates incident tracking templates and harness gap SLO workflows',
  order: 13,

  isApplicable(): boolean {
    return true;
  },

  async execute(ctx: HarnessContext): Promise<HarnessOutput> {
    const prompt = buildIncidentHarnessLoopPrompt(ctx.detection, ctx.userPreferences);
    const systemPrompt = buildSystemPrompt();

    try {
      const result = await ctx.runner.generate(prompt, systemPrompt);

      const output: HarnessOutput = {
        harnessName: 'incident-harness-loop',
        filesCreated: result.filesCreated,
        filesModified: result.filesModified,
        metadata: {
          targetFiles: [
            '.github/ISSUE_TEMPLATE/harness-gap.md',
            'docs/harness-gaps.md',
            '.github/workflows/weekly-metrics.yml',
          ],
        },
      };

      ctx.previousOutputs.set('incident-harness-loop', output);

      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Incident harness loop generation failed: ${message}`);
    }
  },
};
