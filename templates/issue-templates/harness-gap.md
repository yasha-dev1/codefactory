---
name: Harness Gap Report
about: Convert a production regression into a harness improvement
labels: harness-gap
---

## Incident Description

<!-- Describe the production incident that revealed the harness gap. Include dates, impact, and affected systems. -->

**Incident Date:** YYYY-MM-DD
**Severity:** <!-- critical / major / minor -->
**Affected Systems:** <!-- list affected components or services -->

### What Happened

<!-- Brief description of the production issue. -->

### User Impact

<!-- How were users affected? Include metrics if available (error rate, downtime, etc.). -->

## Root Cause

<!-- Describe the root cause of the incident. What code change or condition led to the failure? -->

### Offending Change

<!-- Link to the PR or commit that introduced the regression, if known. -->

- PR: #
- Commit:

### Why It Wasn't Caught

<!-- Explain why existing tests, checks, or review processes did not prevent this. -->

## What the Harness Should Have Caught

<!-- Describe the specific check, test, or validation that would have prevented this incident. -->

### Expected Detection Point

<!-- At which stage should the issue have been detected? -->

- [ ] Unit tests
- [ ] Integration tests
- [ ] Smoke tests
- [ ] Risk policy gate
- [ ] Browser evidence review
- [ ] Docs drift check
- [ ] Manual code review

### Missing Coverage

<!-- Describe the specific gap: missing test case, uncovered path, insufficient validation, etc. -->

## Proposed Harness Improvement

<!-- Describe the concrete changes needed to close this gap. -->

### Changes Required

<!-- List specific changes to tests, configuration, or CI pipeline. -->

- [ ]

### Risk Tier Update

<!-- Does the risk tier classification need to change for the affected paths? -->

**Current tier for affected paths:** <!-- high / low -->
**Proposed tier:** <!-- high / low -->
**Paths to reclassify:**

```
<!-- glob patterns for paths that need tier changes -->
```

### New Required Checks

<!-- List any new checks that should be added to the merge policy. -->

## SLO Target

<!-- Define the service level objective for this improvement. -->

**Metric:** <!-- e.g., "Time to detect similar regression" -->
**Current:** <!-- current performance, e.g., "Not detected (reached production)" -->
**Target:** <!-- target performance, e.g., "Blocked at CI within 5 minutes" -->
**Measurement:** <!-- how this will be measured going forward -->

## Implementation Notes

<!-- Any additional context, constraints, or considerations for implementing the fix. -->

