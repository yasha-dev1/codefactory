import { VERSION } from '@harnext/core';

export type Mode = 'interactive' | 'print' | 'heartbeat' | 'github-poll' | 'mcp';
export type McpVerb = 'add' | 'remove' | 'list' | 'reconnect';
export type McpScopeArg = 'user' | 'project';

export interface Args {
  mode: Mode;
  /** Undefined if not passed on the command line — resolved later from saved preferences. */
  provider?: string;
  /** Undefined if not passed on the command line — resolved later from saved preferences. */
  model?: string;
  thinkingLevel: string;
  systemPrompt?: string;
  cwd: string;
  messages: string[];
  /** Heartbeat name — only set when mode === 'heartbeat'. */
  heartbeatName?: string;
  /** MCP subcommand — only set when mode === 'mcp'. */
  mcpVerb?: McpVerb;
  mcpName?: string;
  mcpScope?: McpScopeArg;
  mcpUrl?: string;
  mcpHeaders?: string[];
  mcpLifecycle?: 'lazy' | 'eager' | 'keep-alive';
  mcpDirect?: boolean;
  /** Positional args after `--` for mcp add stdio: command + args. */
  mcpCommandArgs?: string[];
}

export function parseArgs(argv: string[]): Args {
  const args: Args = {
    mode: 'interactive',
    thinkingLevel: 'off',
    cwd: process.cwd(),
    messages: [],
  };

  if (argv[0] === 'mcp') {
    return parseMcpArgs(argv.slice(1), args);
  }

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    switch (arg) {
      case '-p':
      case '--print':
        args.mode = 'print';
        break;
      case '--heartbeat':
        args.mode = 'heartbeat';
        args.heartbeatName = argv[++i];
        break;
      case '--github-poll':
        args.mode = 'github-poll';
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

function parseMcpArgs(rest: string[], args: Args): Args {
  args.mode = 'mcp';
  if (rest[0] === '-h' || rest[0] === '--help') {
    printMcpHelp();
    process.exit(0);
  }
  const verbRaw = rest[0];
  if (!verbRaw || verbRaw.startsWith('-')) {
    return args; // treated as missing verb; handled by runner
  }
  args.mcpVerb = verbRaw as McpVerb;
  args.mcpHeaders = [];

  let i = 1;
  const positional: string[] = [];
  while (i < rest.length) {
    const arg = rest[i];
    if (arg === '--') {
      args.mcpCommandArgs = rest.slice(i + 1);
      break;
    }
    switch (arg) {
      case '--scope':
        args.mcpScope = rest[++i] as McpScopeArg;
        break;
      case '--url':
        args.mcpUrl = rest[++i];
        break;
      case '--header':
      case '-H':
        if (rest[++i]) args.mcpHeaders!.push(rest[i]);
        break;
      case '--lifecycle':
        args.mcpLifecycle = rest[++i] as 'lazy' | 'eager' | 'keep-alive';
        break;
      case '--direct':
        args.mcpDirect = true;
        break;
      case '--cwd':
        args.cwd = rest[++i] ?? args.cwd;
        break;
      case '-h':
      case '--help':
        printMcpHelp();
        process.exit(0);
        break;
      default:
        if (!arg.startsWith('-')) positional.push(arg);
        break;
    }
    i++;
  }

  if (positional.length > 0) args.mcpName = positional[0];
  return args;
}

export function printMcpHelp(): void {
  console.log(`
harnext mcp - Manage MCP (Model Context Protocol) servers

Usage:
  harnext mcp add <name> [--scope user|project] [--lifecycle lazy|eager|keep-alive] [--direct] -- <command> [args...]
  harnext mcp add <name> --url <url> [--header "K: V"] [--scope user|project]
  harnext mcp list [--scope user|project]
  harnext mcp remove <name> [--scope user|project]
  harnext mcp reconnect <name>

Options:
  --scope <user|project>   Where to write the config (default: user)
  --lifecycle <mode>       lazy (default) | eager | keep-alive
  --direct                 Register tools directly (bypass proxy) for this server
  --url <url>              HTTP transport URL (instead of stdio command)
  --header, -H "K: V"      HTTP header (repeatable)
`);
}

export function printHelp(): void {
  console.log(`
harnext - AI coding agent

Usage:
  harnext [options] [message...]

Options:
  -p, --print              Run in non-interactive (single-shot) mode
  --heartbeat <name>       Run the named heartbeat prompt once (for cron)
  --github-poll            Run the GitHub issue poller once (for cron)
  --provider <provider>    LLM provider (anthropic, openai, google) [default: anthropic]
  -m, --model <model>      Model ID [default: claude-sonnet-4-6]
  --thinking <level>       Thinking level (off, low, medium, high) [default: off]
  --system-prompt <text>   Override system prompt
  --cwd <directory>        Working directory [default: .]
  -h, --help               Show this help
  -v, --version            Show version
`);
}
