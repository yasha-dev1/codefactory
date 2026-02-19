# Architecture: {{projectName}}

## System Overview

<!-- High-level description of the system, its purpose, and its boundaries. -->

{{systemOverview}}

## Architectural Layers

<!-- Describe the logical layers of the system and their responsibilities. -->

### Presentation Layer

<!-- CLI interface, API endpoints, or UI components. -->

{{presentationLayer}}

### Business Logic Layer

<!-- Core domain logic, services, and workflows. -->

{{businessLogicLayer}}

### Data Layer

<!-- Data access, storage, and external integrations. -->

{{dataLayer}}

## Key Components

<!-- List and describe the most important modules, classes, or services. -->

| Component | Location | Responsibility |
|-----------|----------|----------------|
| {{componentName}} | {{componentPath}} | {{componentDescription}} |

## Data Flow

<!-- Describe how data moves through the system for key operations. -->

### Primary Flow

```
{{dataFlowDiagram}}
```

<!-- Example:
```
User Input -> CLI Parser -> Command Handler -> Service Layer -> Output Formatter -> Console
```
-->

## Dependencies

### Runtime Dependencies

| Package | Purpose | Version |
|---------|---------|---------|
| {{depName}} | {{depPurpose}} | {{depVersion}} |

### Development Dependencies

| Package | Purpose | Version |
|---------|---------|---------|
| {{devDepName}} | {{devDepPurpose}} | {{devDepVersion}} |

### External Services

<!-- List any external APIs, databases, or services the system depends on. -->

{{externalServices}}

## Architecture Decision Records

<!-- Document significant architectural decisions using the ADR format. -->

### ADR-001: {{decisionTitle}}

- **Status:** {{decisionStatus}}
- **Date:** {{decisionDate}}
- **Context:** {{decisionContext}}
- **Decision:** {{decisionOutcome}}
- **Consequences:** {{decisionConsequences}}
