# {{projectName}}

## Build & Run Commands

{{buildCommands}}

<!-- Example:
```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Lint and format
npm run lint
npm run format
```
-->

## Code Style & Conventions

{{codeStyle}}

<!-- Example:
- Use TypeScript strict mode for all source files
- Prefer named exports over default exports
- Use camelCase for variables and functions, PascalCase for types and classes
- Maximum line length: 100 characters
- Use early returns to reduce nesting
- All public functions must have JSDoc comments
-->

## Architecture Overview

{{architectureOverview}}

<!-- Example:
- Modular CLI architecture using commander.js
- Separation of concerns: commands / services / utils
- Configuration-driven behavior via harness.config.json
- Template-based scaffolding system
-->

## Project Structure

{{projectStructure}}

<!-- Example:
```
src/
  commands/     # CLI command definitions
  services/     # Business logic
  utils/        # Shared utilities
  types/        # TypeScript type definitions
templates/      # Scaffolding templates
tests/          # Test suites
docs/           # Project documentation
```
-->

## Security Constraints

{{securityConstraints}}

<!-- Example:
- Never commit secrets, API keys, or credentials
- Validate all user input before processing
- Use parameterized queries for any database operations
- Follow OWASP Top 10 guidelines
- Dependencies must be audited before adding
-->

## Dependency Management

{{dependencyManagement}}

<!-- Example:
- Pin exact versions in package.json (no ^ or ~ prefixes)
- Run `npm audit` before merging dependency updates
- Prefer well-maintained packages with active communities
- Document the purpose of each dependency in this section
-->

## Risk Tiers

See `harness.config.json` for full risk tier definitions.

{{riskTierSummary}}

<!-- Example:
| Tier | Paths | Required Checks | Approvals |
|------|-------|-----------------|-----------|
| High | src/core/**, migrations/** | All CI + smoke + browser evidence | 1 |
| Low  | docs/**, tests/** | CI pipeline only | 0 |
-->

## Testing Strategy

{{testingStrategy}}

<!-- Example:
- Unit tests for all utility functions and services
- Integration tests for CLI commands
- Snapshot tests for generated output
- Minimum 80% code coverage target
-->

## Agent Instructions

{{agentInstructions}}

<!-- Example:
- Always run the full test suite before proposing changes
- Create a new branch for each task
- Follow the PR template in .github/pull_request_template.md
- Include evidence (screenshots, logs) for UI changes
- Check harness.config.json for risk tier before submitting
- Do not modify CI/CD configuration without explicit approval
-->
