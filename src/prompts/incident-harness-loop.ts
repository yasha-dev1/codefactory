import type { DetectionResult, UserPreferences } from './types.js';

export function buildIncidentHarnessLoopPrompt(
  detection: DetectionResult,
  prefs: UserPreferences,
): string {
  return `Generate an incident-to-harness loop system for this ${detection.primaryLanguage} project.

## Context

- Language: ${detection.primaryLanguage}
- Framework: ${detection.framework ?? 'none'}
- CI Provider: ${prefs.ciProvider}
- Critical paths: ${detection.criticalPaths.length > 0 ? detection.criticalPaths.join(', ') : 'none detected'}

## Concept

The incident-to-harness loop converts production regressions into harness improvements, preventing fixes from becoming one-off patches and growing long-term coverage. The pattern:

\`\`\`
production regression → harness gap issue → test case added → SLA tracked
\`\`\`

## Files to Generate

### 1. .github/ISSUE_TEMPLATE/harness-gap.md

A GitHub issue template (with YAML frontmatter) for reporting harness gaps:

\`\`\`yaml
---
name: Harness Gap Report
about: Convert a production regression into a harness improvement
title: "[HARNESS GAP] "
labels: harness-gap, quality
assignees: ''
---
\`\`\`

Template body sections:
- **Incident Summary**: What happened in production?
- **Root Cause**: Why did this happen?
- **What Should Have Caught It**: Which harness layer should have prevented this?
  - [ ] Pre-commit hooks
  - [ ] Risk policy gate
  - [ ] CI pipeline
  - [ ] Review agent
  - [ ] Browser evidence
  - [ ] Architectural linter
  - [ ] Other: ___
- **Proposed Harness Improvement**: What specific check/test/rule should be added?
- **Affected Critical Paths**: Which paths in harness.config.json are affected?
- **SLO Target**: When should this harness improvement be implemented?
  - [ ] P0: Within 24 hours
  - [ ] P1: Within 1 week
  - [ ] P2: Within 1 sprint
  - [ ] P3: Next planning cycle
- **Test Case Specification**: Describe the test that would catch this regression:
  - Input/preconditions:
  - Expected behavior:
  - Actual behavior:
  - Files to test:
- **Evidence**: Links to incident reports, logs, screenshots

### 2. docs/harness-gaps.md

A tracking document for harness gap SLOs:

\`\`\`markdown
# Harness Gap Tracker

## Overview

This document tracks gaps identified in the harness engineering setup through production incidents. Each gap represents a regression that our harness system should have prevented.

## Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Mean time to harness (MTTH) | < 1 week | - |
| Open P0 gaps | 0 | - |
| Open P1 gaps | < 3 | - |
| Gap close rate (monthly) | > 80% | - |
| Repeat regression rate | 0% | - |

## Open Gaps

<!-- Auto-updated by weekly-metrics workflow -->
| # | Title | Priority | Layer | Created | SLO Due |
|---|-------|----------|-------|---------|---------|
| - | No open gaps | - | - | - | - |

## Closed Gaps

| # | Title | Layer | Resolution | Closed |
|---|-------|-------|------------|--------|
| - | No closed gaps yet | - | - | - |

## Process

1. When a production incident occurs, create a Harness Gap issue using the template
2. Triage the gap and assign priority
3. Implement the harness improvement (new test, rule, or check)
4. Close the issue and update this tracker
5. Weekly metrics report verifies SLO compliance
\`\`\`

### 3. .github/workflows/weekly-metrics.yml

A weekly GitHub Actions workflow that generates harness metrics:

\`\`\`yaml
name: Weekly Harness Metrics
on:
  schedule:
    - cron: '0 10 * * 5'  # Every Friday at 10am UTC
  workflow_dispatch: {}

permissions:
  issues: read
  contents: read

jobs:
  metrics:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/github-script@v7
        with:
          script: |
            // Fetch all issues with 'harness-gap' label
            const issues = await github.paginate(github.rest.issues.listForRepo, {
              owner: context.repo.owner,
              repo: context.repo.repo,
              labels: 'harness-gap',
              state: 'all',
            });

            // Compute metrics
            const open = issues.filter(i => i.state === 'open');
            const closed = issues.filter(i => i.state === 'closed');
            const p0Open = open.filter(i => i.labels.some(l => l.name === 'P0'));
            const p1Open = open.filter(i => i.labels.some(l => l.name === 'P1'));

            // Calculate MTTH (mean time to harness) for closed issues
            const mtthDays = closed.length > 0
              ? closed.reduce((sum, i) => {
                  const created = new Date(i.created_at);
                  const closedAt = new Date(i.closed_at);
                  return sum + (closedAt - created) / (1000 * 60 * 60 * 24);
                }, 0) / closed.length
              : 0;

            // Output summary
            const summary = [
              '## Weekly Harness Metrics Report',
              '',
              '| Metric | Value |',
              '|--------|-------|',
              \\\`| Open gaps | \${open.length} |\\\`,
              \\\`| P0 open | \${p0Open.length} |\\\`,
              \\\`| P1 open | \${p1Open.length} |\\\`,
              \\\`| Closed (all time) | \${closed.length} |\\\`,
              \\\`| MTTH (days) | \${mtthDays.toFixed(1)} |\\\`,
            ].join('\\n');

            console.log(summary);
\`\`\`

## Quality Requirements

- Issue template must be valid GitHub issue template format (YAML frontmatter + markdown body)
- Metrics workflow should handle repos with zero issues gracefully
- The tracking document should be easy to maintain manually and by automation
- Priority labels (P0-P3) should be clearly defined
- Include links between the issue template and the tracking document`;
}
