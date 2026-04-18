import { VERSION } from '@harnext/core';

export type Mode = 'interactive' | 'print';

export interface Args {
  mode: Mode;
  provider: string;
  model: string;
  thinkingLevel: string;
  systemPrompt?: string;
  cwd: string;
  messages: string[];
}

export function parseArgs(argv: string[]): Args {
  const args: Args = {
    mode: 'interactive',
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    thinkingLevel: 'off',
    cwd: process.cwd(),
    messages: [],
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    switch (arg) {
      case '-p':
      case '--print':
        args.mode = 'print';
        break;
      case '--provider':
        args.provider = argv[++i] ?? args.provider;
        break;
      case '-m':
      case '--model':
        args.model = argv[++i] ?? args.model;
        break;
      case '--thinking':
        args.thinkingLevel = argv[++i] ?? args.thinkingLevel;
        break;
      case '--system-prompt':
        args.systemPrompt = argv[++i];
        break;
      case '--cwd':
        args.cwd = argv[++i] ?? args.cwd;
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
        break;
      case '-v':
      case '--version':
        console.log(VERSION);
        process.exit(0);
        break;
      default:
        if (!arg.startsWith('-')) {
          args.messages.push(arg);
        }
        break;
    }
    i++;
  }

  return args;
}

export function printHelp(): void {
  console.log(`
harnext - AI coding agent

Usage:
  harnext [options] [message...]

Options:
  -p, --print              Run in non-interactive (single-shot) mode
  --provider <provider>    LLM provider (anthropic, openai, google) [default: anthropic]
  -m, --model <model>      Model ID [default: claude-sonnet-4-6]
  --thinking <level>       Thinking level (off, low, medium, high) [default: off]
  --system-prompt <text>   Override system prompt
  --cwd <directory>        Working directory [default: .]
  -h, --help               Show this help
  -v, --version            Show version
`);
}
