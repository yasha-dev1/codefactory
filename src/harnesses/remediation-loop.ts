import type { HarnessModule, HarnessContext, HarnessOutput } from './types.js';
import { buildRemediationLoopPrompt } from '../prompts/remediation-loop.js';
import { buildSystemPrompt } from '../prompts/system.js';

export const remediationLoopHarness: HarnessModule = {
  name: 'remediation-loop',
  displayName: 'Remediation Loop',
  description:
    'Generates automated remediation agent workflow for fixing review findings',
  order: 8,

  isApplicable(): boolean {
    return true;
  },

  async execute(ctx: HarnessContext): Promise<HarnessOutput> {
    const prompt = buildRemediationLoopPrompt(ctx.detection, ctx.userPreferences);
    const systemPrompt = buildSystemPrompt();

    try {
      const result = await ctx.runner.generate(prompt, systemPrompt);

      const output: HarnessOutput = {
        harnessName: 'remediation-loop',
        filesCreated: result.filesCreated,
        filesModified: result.filesModified,
        metadata: {
          targetFiles: [
            '.github/workflows/remediation-agent.yml',
            'scripts/remediation-agent-prompt.md',
          ],
        },
      };

      ctx.previousOutputs.set('remediation-loop', output);

      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Remediation loop generation failed: ${message}`);
    }
  },
};
