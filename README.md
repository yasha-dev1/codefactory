# CodeFactory

**Automated harness engineering for AI coding agents.**

## The Problem

Setting up harness engineering for AI coding agents -- as described by [OpenAI's blog on agent-first harness engineering](https://openai.com) and [Ryan Carson's patterns](https://ryancarson.com) -- is complex and manual. A production-ready setup requires:

- Agent instruction files (CLAUDE.md)
- Risk-tiered CI pipelines
- SHA discipline and deduplication
- Documentation structures and garbage collection
- Preflight gates and pre-commit hooks
- Review-agent integration with auto-resolve
- Remediation loops for automated fixes
- Browser evidence capture for UI verification
- Incident-to-harness tracking

Doing this by hand for every repo is slow, error-prone, and inconsistent.

## The Solution

CodeFactory is a CLI tool that automates this entire setup. Run `codefactory init` in any repo and it uses Claude Code (via the Agent SDK) to analyze the repo, detect the stack, and generate all harnesses automatically.

## Quick Start

```bash
npm install -g codefactory
cd your-project
codefactory init
```

CodeFactory will:

1. Detect your language, framework, CI provider, and toolchain
2. Ask you a few configuration questions (strictness level, which harnesses to enable)
3. Generate all selected harness files tailored to your stack

## What Gets Generated

CodeFactory produces **15 harnesses**, each targeting a specific aspect of agent-safe development:

| #   | Harness                              | Description                                                                                 |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------- |
| 1   | **Risk Contract**                    | `harness.config.json` defining risk tiers (safe/audited/forbidden) for files and operations |
| 2   | **CLAUDE.md**                        | Agent instruction file -- the control plane for AI coding agents                            |
| 3   | **Documentation Structure**          | Standardized docs layout: architecture, API references, runbooks                            |
| 4   | **Pre-commit Hooks**                 | Git hooks that enforce risk policy before code leaves the developer's machine               |
| 5   | **Risk Policy Gate**                 | Preflight checks + SHA discipline to catch policy violations early                          |
| 6   | **CI Pipeline**                      | Risk-tiered CI workflows -- fast checks for safe changes, full suite for audited ones       |
| 7   | **Review Agent Integration**         | SHA-deduped reruns and auto-resolve for agent-generated review comments                     |
| 8   | **Remediation Loop**                 | Automated fix cycle: detect failure, generate patch, re-run checks                          |
| 9   | **Browser Evidence Capture**         | Screenshot and trace capture for UI verification during CI                                  |
| 10  | **PR Templates**                     | Pull request templates with risk-tier checklists                                            |
| 11  | **Architectural Linters**            | Custom lint rules enforcing layer boundaries and import restrictions                        |
| 12  | **Documentation Garbage Collection** | Detects and flags stale docs that have drifted from the codebase                            |
| 13  | **Incident-to-Harness Loop**         | Converts production incidents into new harness rules to prevent recurrence                  |
| 14  | **Issue Triage**                     | Evaluates new issues for quality and routes actionable ones to implementation               |
| 15  | **Issue Implementer**                | Spawns an AI agent to implement issues and open PRs automatically                           |

## Workflow Map

Once a repo is set up with CodeFactory, here's what happens at every stage of the development lifecycle:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DEVELOPER MACHINE                            │
│                                                                     │
│  ┌───────────────────────────────────┐                              │
│  │         codefactory REPL          │                              │
│  │                                   │                              │
│  │  Type a task ──► worktree branch  │                              │
│  │                   + Claude agent   │                              │
│  │                                   │                              │
│  │  Type / ──► view/edit prompts     │                              │
│  │  in .codefactory/prompts/         │                              │
│  └───────────────────────────────────┘                              │
│                    │                                                │
│                    ▼                                                │
│  ┌───────────────────────────────────┐                              │
│  │         PRE-COMMIT HOOKS          │                              │
│  │                                   │                              │
│  │  1. Lint staged files             │  ◄── Blocks commit if        │
│  │  2. Type-check                    │      quality gates fail      │
│  │  3. Risk tier classification      │                              │
│  │  4. Reject forbidden file edits   │  ◄── e.g. lock files,       │
│  │     (per harness.config.json)     │      CI workflows            │
│  └───────────────────────────────────┘                              │
│                    │                                                │
│                    ▼                                                │
│               git push                                              │
└────────────────────┬────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         CI PIPELINE                                 │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                  ON PUSH / PULL REQUEST                      │    │
│  │                                                              │    │
│  │  ┌──────────────────┐    ┌─────────────────────────────┐    │    │
│  │  │ RISK POLICY GATE │    │      QUALITY GATES          │    │    │
│  │  │                  │    │                             │    │    │
│  │  │ Classify changes │    │  Lint ──► Typecheck ──►    │    │    │
│  │  │ into Tier 1/2/3  │    │  Test ──► Build            │    │    │
│  │  │ by file path     │    │                             │    │    │
│  │  └────────┬─────────┘    └──────────────┬──────────────┘    │    │
│  │           │                             │                   │    │
│  │           ▼                             ▼                   │    │
│  │  ┌──────────────────────────────────────────────────────┐   │    │
│  │  │                 REVIEW AGENT                          │   │    │
│  │  │                                                       │   │    │
│  │  │  Reads .codefactory/prompts/review-agent.md           │   │    │
│  │  │  Reviews diff for bugs, security, architecture        │   │    │
│  │  │  Posts structured comment with verdict                 │   │    │
│  │  │  SHA-deduped (skips if same commit already reviewed)   │   │    │
│  │  │                                                       │   │    │
│  │  │  Tier 1 (docs) ──► skipped                            │   │    │
│  │  │  Tier 2 (features) ──► agent review only              │   │    │
│  │  │  Tier 3 (critical) ──► agent review + human required  │   │    │
│  │  └────────┬──────────────────────────────────────────────┘   │    │
│  │           │                                                  │    │
│  │           ▼                                                  │    │
│  │  ┌──────────────────────────────────────────────────────┐   │    │
│  │  │              REMEDIATION LOOP                         │   │    │
│  │  │                                                       │   │    │
│  │  │  If review or gates fail:                              │   │    │
│  │  │    1. Agent reads failure details                      │   │    │
│  │  │    2. Generates a fix patch                            │   │    │
│  │  │    3. Pushes fix commit                                │   │    │
│  │  │    4. Re-triggers pipeline (up to N retries)           │   │    │
│  │  │                                                       │   │    │
│  │  │  Auto-resolves bot-only review threads after fix       │   │    │
│  │  └──────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   ON ISSUE OPENED                            │    │
│  │                                                              │    │
│  │  ┌──────────────────────────────────────────────────────┐   │    │
│  │  │               ISSUE TRIAGE                            │   │    │
│  │  │                                                       │   │    │
│  │  │  Reads .codefactory/prompts/issue-triage.md           │   │    │
│  │  │  Evaluates: clear description? repro steps?            │   │    │
│  │  │             acceptance criteria? reasonable scope?      │   │    │
│  │  │                                                       │   │    │
│  │  │  Actionable ──► adds `agent:implement` label           │   │    │
│  │  │  Incomplete ──► adds `needs-more-info` + comments      │   │    │
│  │  │  Complex    ──► adds `needs-human-review`              │   │    │
│  │  └────────┬──────────────────────────────────────────────┘   │    │
│  │           │ (if labeled agent:implement)                     │    │
│  │           ▼                                                  │    │
│  │  ┌──────────────────────────────────────────────────────┐   │    │
│  │  │            ISSUE IMPLEMENTER                          │   │    │
│  │  │                                                       │   │    │
│  │  │  Reads .codefactory/prompts/issue-implementer.md      │   │    │
│  │  │  Creates branch ──► implements changes ──► runs gates  │   │    │
│  │  │  Opens PR (triggers the push/PR pipeline above)        │   │    │
│  │  │                                                       │   │    │
│  │  │  Success ──► PR created, linked to issue               │   │    │
│  │  │  Failure ──► comments on issue, adds `agent:failed`    │   │    │
│  │  └──────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                  BACKGROUND / SCHEDULED                      │    │
│  │                                                              │    │
│  │  Browser Evidence ── captures screenshots for UI PRs         │    │
│  │  Doc Garbage Collection ── flags stale docs weekly           │    │
│  │  Architectural Linters ── enforces layer import boundaries   │    │
│  │  Incident Loop ── converts prod incidents into harness rules │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      CONTROL PLANE                                  │
│                                                                     │
│  .codefactory/prompts/          All agent behavior lives here.      │
│    ├── agent-system.md          Edit via `codefactory` REPL (/).    │
│    ├── issue-triage.md          Changes take effect on next CI run. │
│    ├── issue-implementer.md     Committed to repo = shared with     │
│    └── review-agent.md          the whole team.                     │
│                                                                     │
│  harness.config.json            Risk tiers, architectural           │
│                                 boundaries, critical paths.         │
│                                                                     │
│  CLAUDE.md                      Project conventions for all agents. │
└─────────────────────────────────────────────────────────────────────┘
```

## Harness Engineering Patterns

CodeFactory implements patterns from two key sources:

**From OpenAI's harness engineering approach:**

- CLAUDE.md as the agent control plane
- CI gates that validate agent output
- Architectural linters to enforce boundaries
- Documentation garbage collection

**From Ryan Carson's patterns:**

- Risk-tiered contracts (safe / audited / forbidden)
- SHA discipline -- deduplicating CI runs and review passes by commit SHA
- Preflight gates that block risky changes before they enter the pipeline
- Remediation loops for automatic fix-and-retry cycles
- Browser evidence capture for visual proof of UI correctness
- Incident memory -- feeding production failures back into harness rules

## Architecture

```
CLI (Commander)
  ├── Default ──► REPL (interactive input with / commands)
  │                ├── Task input ──► Worktree + Claude agent
  │                └── /prompts ──► View/edit .codefactory/prompts/
  └── init ──► Harness setup wizard
                 ├── Detector (heuristic + Claude-powered analysis)
                 └── Harness Modules (15 modules, each implementing HarnessModule)
                      └── Claude Runner (Agent SDK) ──► Generated Files
```

**Core modules:**

- `src/core/claude-runner.ts` -- Wraps the Claude Code Agent SDK. Provides `analyze()` for structured JSON extraction and `generate()` for file creation.
- `src/core/detector.ts` -- Two-phase stack detection: fast heuristics (file existence checks) followed by Claude-powered deep analysis.
- `src/core/prompt-store.ts` -- Manages `.codefactory/prompts/` with default agent prompts and CRUD operations.
- `src/commands/repl.ts` -- Interactive REPL with search-based input, prompt management, and task spawning.
- `src/commands/init.ts` -- Orchestrates the init flow: detect, prompt, generate.

**Harness modules** (`src/harnesses/`): 15 modules each exporting a `HarnessModule` with `name`, `order`, `isApplicable()`, and `execute()`. They run in dependency order and can reference outputs from earlier harnesses.

**Prompts** (`src/prompts/`): Specialized prompt templates that each harness module sends to the Claude Runner for file generation. Agent-facing prompts live in `.codefactory/prompts/` and are read by CI workflows at runtime.

## Development

```bash
git clone https://github.com/user/codefactory.git
cd codefactory
npm install
npm run build
npm run test
npm run dev    # watch mode
npm run lint
npm run typecheck
```

## Requirements

- **Node.js** >= 18
- **Claude Code CLI** installed and authenticated (`npm install -g @anthropic-ai/claude-code`)

## License

MIT
