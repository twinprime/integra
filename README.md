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

Each interface specification has a UUID, ID, name, description, type, and a list of functions. Interface types include: `kafka`, `rest`, `graphql`, or `other`.

Each interface function has a UUID, ID, description, and a list of parameters. Each parameter has a name, type (defaults to `any`), and required flag.

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

**Form fields (with markdown description editor):**
- Component (name, description, interface specifications — name, type, description and functions are editable)
- Actor (name, description)
- Use Case (name, description)

### Auto-Generated Nodes

The following are automatically generated from diagram specifications:
- **Component nodes** (when mentioned in sequence diagrams - added to the owning component)
- **Actor nodes** (when mentioned in use case or sequence diagrams - added to the owning component)
- **Use Case nodes** (when mentioned in use case diagrams - added to the diagram itself)
- **Interface specifications** (when messages are sent to components in sequence diagrams — added to the receiving component; functions are tracked with UUIDs and unreferenced functions are highlighted in the editor)

### Orphan Detection

Actors and components that are not referenced by any diagram's `referencedNodeIds` are considered **orphaned** and can be deleted from the tree view. A delete button appears inline on hover for orphaned nodes (and always for diagrams and use cases).

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

### Syntax

```
actor "User" as user
component "Service" as service
user->>service: ExplorationsAPI:createExploration(id: number, name: string?)
```

Messages follow the format: `sender->>receiver: InterfaceId:functionId(param: type, param2: type?)`

- `InterfaceId` is the interface ID on the receiving component
- `functionId` is the function ID within that interface
- Parameter types default to `any` if omitted
- Appending `?` to a type marks the parameter as optional (e.g. `string?`)

If no interface prefix is given, the message is silently ignored (no interface is created).

### Kafka Ownership

For `kafka`-type interfaces, the **sender** owns the interface (not the receiver). This reflects the publish/subscribe model where the producer defines the message contract.

### Parameter Compatibility

If a function already exists with a different parameter signature, parsing fails with an error message shown in the diagram panel. The system state is not updated until the conflict is resolved.

### Parsing Behavior

When the diagram is parsed:
- Actors and components are added to the component that owns the diagram (via `ownerComponentUuid`)
- Interface specifications are generated on the receiving component (or sender for kafka)
- `referencedNodeIds` on the diagram stores the UUIDs of all referenced actors/components
- `referencedFunctionUuids` on the diagram stores the UUIDs of all interface functions used

## Derived Interface Specifications

When a component is selected in the tree, the editor shows its interface specifications. Each interface can be edited:
- **Name** — editable inline
- **Type** — dropdown (`rest`, `kafka`, `graphql`, `other`)
- **Description** — markdown editor

Each function within an interface shows:
- **ID** — editable inline (used in sequence diagram messages)
- **Description** — markdown editor
- **Parameters** — read-only (name, type, required/optional badge, editable description)
- Functions not referenced by any sequence diagram are shown with **strikethrough** and a delete button

**Example:** For the message `user->>service: ExplorationsAPI:createExploration(id: number)`, the system creates:
- An `ExplorationsAPI` interface on the `service` component
- A function with ID `createExploration`
- A parameter named `id` of type `number` (required)

## Markdown Descriptions

All description fields (on components, actors, use cases, interfaces, and functions) use a markdown editor with syntax highlighting. In preview mode, you can write links to other nodes using their relative path:

```markdown
See also [Service A](serviceA) or [Login Flow](serviceA/mainDiagram/loginCase)
```

Clicking a node link in preview mode navigates to that node in the tree. The path is composed of node IDs separated by `/`. Regular URLs and anchor links (`#`) behave normally.

## Tech Stack

This project is built with:
- **React** 19.2 - A JavaScript library for building user interfaces
- **TypeScript** 5.9 - Typed superset of JavaScript
- **Vite** 7.2 - Next generation frontend tooling
- **Zustand** - Lightweight state management
- **Mermaid** - Diagram rendering from text
- **@uiw/react-md-editor** - Markdown editor with syntax highlighting and preview
- **Tailwind CSS** - Utility-first CSS framework
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
