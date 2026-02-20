import type { HarnessModule, HarnessContext, HarnessOutput } from './types.js';
import { buildIssueTriagePrompt } from '../prompts/issue-triage.js';
import { buildSystemPrompt } from '../prompts/system.js';

export const issueTriageHarness: HarnessModule = {
  name: 'issue-triage',
  displayName: 'Issue Triage Agent',
  description: 'Evaluates new issues for quality and routes actionable ones to implementation',
  order: 14,

  isApplicable(): boolean {
    return true;
  },

  async execute(ctx: HarnessContext): Promise<HarnessOutput> {
    const prompt = buildIssueTriagePrompt(ctx.detection, ctx.userPreferences);
    const systemPrompt = buildSystemPrompt();

    try {
      const result = await ctx.runner.generate(prompt, systemPrompt);

      const output: HarnessOutput = {
        harnessName: 'issue-triage',
        filesCreated: result.filesCreated,
        filesModified: result.filesModified,
        metadata: {
          targetFiles: ['.github/workflows/issue-triage.yml', 'scripts/issue-triage-guard.ts'],
          promptFile: '.codefactory/prompts/issue-triage.md',
        },
      };

      ctx.previousOutputs.set('issue-triage', output);

      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Issue triage generation failed: ${message}`);
    }
  },
};
