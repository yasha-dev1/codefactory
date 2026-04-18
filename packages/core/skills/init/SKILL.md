---
name: init
description: Walk the repository and produce a CLAUDE.md documenting build/test commands, architecture, and conventions. Use when a repo has no CLAUDE.md or the user asks to bootstrap agent context.
---

# init

Produce or refresh `CLAUDE.md` at the repo root so future agent sessions start with accurate context.

## Steps

1. Survey layout with `bash` (`ls`, `git status`).
2. Read top-level manifest (`package.json` / `pyproject.toml` / `go.mod` / `Cargo.toml`), any `README.md`, and 2-3 representative source files per major directory.
3. Identify: primary language, package manager, build/test/lint commands, module layout, conventions (inspect real files — don't guess).
4. Write `CLAUDE.md` with sections **Commands**, **Architecture**, **Conventions**, **Gotchas**. Keep under ~150 lines; omit anything you can't verify.

## Guardrails

- If `CLAUDE.md` already exists, diff your draft against it and only update sections that have changed.
- Never invent commands. If one isn't discoverable, omit it.
