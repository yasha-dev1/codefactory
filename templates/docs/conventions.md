# Conventions: {{projectName}}

## Naming Conventions

### Files and Directories

<!-- Define how files and directories should be named. -->

{{fileNaming}}

<!-- Example:
- Source files: `kebab-case.ts` (e.g., `risk-engine.ts`)
- Test files: `<module>.test.ts` (e.g., `risk-engine.test.ts`)
- Type definition files: `<module>.types.ts`
- Directories: `kebab-case/`
-->

### Code Identifiers

<!-- Define naming rules for variables, functions, classes, etc. -->

{{codeNaming}}

<!-- Example:
- Variables and functions: `camelCase`
- Classes and types: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
- Private members: prefix with `_` or use `#` private fields
- Boolean variables: prefix with `is`, `has`, `should`, `can`
-->

## File Organization

<!-- Define the project structure and where different types of files belong. -->

{{fileOrganization}}

<!-- Example:
```
src/
  commands/        # One file per CLI command
  services/        # Business logic, one service per domain concept
  utils/           # Pure utility functions, stateless helpers
  types/           # Shared TypeScript type definitions
  index.ts         # Entry point, wires everything together
```
-->

## Error Handling Patterns

<!-- Define how errors should be handled and reported. -->

{{errorHandling}}

<!-- Example:
- Use custom error classes extending `Error` for domain-specific errors
- Always include a descriptive message and error code
- Log errors with structured context (operation, input, stack trace)
- CLI commands should catch errors and display user-friendly messages
- Never swallow errors silently; log at minimum
-->

## Testing Conventions

<!-- Define how tests should be written and organized. -->

{{testingConventions}}

<!-- Example:
- Colocate test files next to source: `foo.ts` -> `foo.test.ts`
- Use `describe` blocks to group related tests by function or behavior
- Test names should read as sentences: `it("returns empty array when no matches found")`
- Prefer concrete assertions over snapshot tests for logic
- Mock external dependencies; avoid mocking internal modules
- Each test should be independent and not rely on execution order
-->

## Git Workflow

<!-- Define branching strategy, commit conventions, and merge process. -->

{{gitWorkflow}}

<!-- Example:
- Branch naming: `<type>/<short-description>` (e.g., `feat/add-risk-engine`)
- Commit messages: follow Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`)
- Always rebase feature branches onto `main` before merging
- Squash commits on merge for a clean history
- Delete branches after merge
-->

## Code Review Guidelines

<!-- Define expectations for code reviews. -->

{{codeReviewGuidelines}}

<!-- Example:
- All changes require at least one review (high-risk: human, low-risk: agent OK)
- Reviewers should check: correctness, readability, test coverage, security
- Use inline comments for specific code suggestions
- Approve only when all conversations are resolved
- Review within 24 hours of PR submission
-->

## Documentation Standards

<!-- Define when and how code should be documented. -->

{{documentationStandards}}

<!-- Example:
- Public API functions require JSDoc comments with `@param` and `@returns`
- Complex algorithms should have inline comments explaining "why"
- README must be updated when user-facing behavior changes
- Architecture decisions recorded in `docs/architecture.md`
-->
