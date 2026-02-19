# integra

A visual editor for system engineering models using Mermaid diagrams.

## Overview

Integra is an interactive system modeling tool that allows you to define and visualize software architectures through use case diagrams and sequence diagrams. The tool automatically derives interface specifications from your sequence diagrams and maintains a hierarchical component structure.

## System Model

The system model consists of a root component which can contain one or more sub-components. Each component can contain one or more sub-components.

### Component Structure

Each component can contain:
- **Actors** (automatically created from use case and sequence diagrams)
- **Use Case Diagrams** (contain use cases)
- **Sub-components**

Each use case diagram contains:
- **Use Cases** (automatically created from the diagram specification)

Each use case contains:
- **Sequence Diagrams**

Each component has zero or more **interface specifications** (automatically derived from sequence diagrams within its nested use cases).

Each interface specification contains a name, type, and interactions with parameters. Interface types include: `kafka`, `rest`, `graphql`, or `other`.

### Hierarchy Rules

- Use cases can only exist under use case diagrams
- Sequence diagrams can only exist under use cases
- Actors remain at the component level (not nested under diagrams)
- Interface specifications remain at the component level (derived from all sequence diagrams within the component's hierarchy)

**Note:** All diagrams have an `ownerComponentUuid` field that references the component they logically belong to, regardless of nesting depth.

### Example Tree Structure

```
- Root Component
    - Sub-component 1
        - Actor 1 (auto-generated from diagrams)
        - Use Case Diagram 1
            - Use Case 1 (auto-generated from diagram)
                - Sequence Diagram 1
                - Sequence Diagram 2
            - Use Case 2
                - Sequence Diagram 3
        - Use Case Diagram 2
            - Use Case 3
        - Sub-component 2
            - Actor 2
            - Use Case Diagram 3
                - Use Case 4
                    - Sequence Diagram 4
            - Sub-component 3
        - Sub-component 4
    - Sub-component 5
```

## Editor Interface

The editor contains three panels:
- **Left Panel:** Tree structure of the system model
- **Middle Panel:** Editor for the selected node (text editor for diagrams, form fields for other nodes)
- **Right Panel:** Mermaid diagram visualization or preview

### Editable Nodes

**Text editor (content field):**
- Use Case Diagram
- Sequence Diagram

**Form fields:**
- Component (name, description - interfaces are auto-generated and read-only)
- Actor (name, description)
- Use Case (name, description)

### Auto-Generated Nodes

The following are automatically generated from diagram specifications:
- **Component nodes** (when mentioned in sequence diagrams - added to the owning component)
- **Actor nodes** (when mentioned in use case or sequence diagrams - added to the owning component)
- **Use Case nodes** (when mentioned in use case diagrams - added to the diagram itself)
- **Interface specifications** (when messages are sent to components in sequence diagrams - added to the owning component)

## Use Case Diagrams

Use case diagrams contain use cases and their relationships with actors.

### Syntax

```
actor "Exploration Leader" as leader
use case "Create an exploration" as create
leader --> create
```

The syntax uses the `actor` and `use case` keywords with double-quoted names and `as` keyword for IDs.

### Parsing Behavior

When the diagram is parsed:
- Actors are added to the component that owns the diagram
- Use cases are added to the use case diagram itself (and can contain sequence diagrams)

## Sequence Diagrams

Sequence diagrams are nested under use cases and define interactions between actors and components.

### Syntax

The sequence diagram specification follows the Mermaid sequence diagram syntax with custom participant declarations.
Use `actor` or `component` keywords to specify the type of participants. You can specify an ID using the "as" keyword:

```
actor "User" as user
component "Service" as service
user->>service: createExploration(explorationId)
```

If the "as" part is omitted, the name itself will be used as the ID.

Messages follow the format: `participant1->>participant2: methodName(param1, param2)`

### Parsing Behavior

When the diagram is parsed:
- Actors and components are added to the component that owns the diagram (via `ownerComponentUuid`)
- Interface specifications are generated on the receiving components

## Derived Interface Specifications

When a component is selected in the tree, the editor shows:
- ID (read-only label)
- Name (editable input field)
- Description (editable textarea)
- Interface Specifications (read-only, auto-generated)

Each interface specification includes:
- Interface name (e.g., "Default")
- Interface type (rest, kafka, graphql, other)
- Interface ID (e.g., "iface-Service-default")
- List of interactions derived from messages:
  - Interaction ID (the method name from the message)
  - Description (auto-generated)
  - Parameters with:
    - name (extracted from message parameters)
    - type (defaults to "string")
    - required (defaults to true)

**Example:** For the message `user->>service: createExploration(explorationId)`, the system creates:
- A "Default" interface on the "service" component
- An interaction with ID "createExploration"
- A parameter named "explorationId" of type "string" (required)

The interface specifications are automatically updated whenever sequence diagrams are modified.

## Tech Stack

This project is built with:
- **React** 19.2 - A JavaScript library for building user interfaces
- **TypeScript** 5.9 - Typed superset of JavaScript
- **Vite** 7.2 - Next generation frontend tooling
- **ESLint** 9.39 - Pluggable linting utility for JavaScript and TypeScript
- **Vitest** 4.0 - Blazing fast unit test framework

## Getting Started

### Install dependencies

```bash
npm install
```

### Development

Run the development server:

```bash
npm run dev
```

### Build

Build for production:

```bash
npm run build
```

### Lint

Run ESLint:

```bash
npm run lint
```

### Test

Run tests:

```bash
npm test
```

Run tests once (CI mode):

```bash
npm run test:run
```

Run tests with UI:

```bash
npm run test:ui
```

### Preview

Preview production build:

```bash
npm run preview
```
