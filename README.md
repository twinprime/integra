# Integra

A visual editor for system engineering models using diagram specifications.

---

## For Users

### Quick Start

#### 1. Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

#### 2. Build your system model

The left panel shows your **system tree**. Start by renaming the root component, then add sub-components, use case diagrams, and sequence diagrams using the **+** buttons on each node.

#### 3. Write diagram specifications

Select a diagram node to open its specification editor. Type your spec in the text area — the right panel renders the diagram in real time. Syntax is highlighted as you type.

#### 4. Explore the derived model

As you write sequence diagrams, Integra automatically derives:
- **Actors and components** added to the owning component
- **Interface specifications** (with typed functions and parameters) on the receiving component
- **Use cases** listed under their use case diagram

Navigate the tree to inspect generated nodes. Orphaned nodes (no longer referenced by any diagram) show a delete button on hover.

---

### Diagram Specifications

#### Use Case Diagram

Declare actors, use cases, and their relationships.

```
actor "Customer" as customer
actor "Admin" from root/admin as admin

use case "Browse Catalogue" as browse
use case "Place Order" as order
use case "Manage Products" as manage

customer --> browse
customer --> order
admin --> manage
```

| Keyword | Purpose |
|---|---|
| `actor "Name" as id` | Declare an actor |
| `use case "Name" as id` | Declare a use case |
| `from path/to/node` | Reference an existing node instead of creating a new one |
| `A --> B` | Relationship arrow (rendered as-is by Mermaid) |

**Node IDs are scoped to the owning component.** The same ID can be reused in different components.

---

#### Sequence Diagram

Declare participants and message interactions.

```
actor "Customer" as customer
component "Order Service" as orderSvc
component "Payment Service" from payments/paymentSvc as paymentSvc

customer->>orderSvc: OrdersAPI:placeOrder(orderId: string, amount: number)
orderSvc->>paymentSvc: PaymentsAPI:charge(orderId: string, amount: number, currency: string?)
orderSvc->>customer: UseCase:orderConfirmed
```

| Syntax | Purpose |
|---|---|
| `actor "Name" as id` | Declare an actor participant |
| `component "Name" as id` | Declare a component participant |
| `from path/to/node` | Reference an existing node (no new node created) |
| `sender->>receiver: Interface:function(param: type)` | Function call message — derives interface on receiver |
| `sender->>receiver: UseCase:useCaseId` | Use case reference — links to an existing use case on the receiver |

**Function call message format:** `sender->>receiver: InterfaceId:functionId(param: type, param2: type?)`
- Parameter types default to `any` if omitted
- Append `?` to mark a parameter as optional (e.g. `name: string?`)
- For `kafka`-type interfaces, the **sender** owns the interface

**Self-reference:** A `component` participant with the same ID as the owning component is treated as a self-reference — no child component is created.

---

### Cross-Component References

Use the `from` clause to reference nodes defined in other parts of the tree. The path is a `/`-separated list of component IDs with the node ID last:

```
actor "Global Admin" from root/admin as admin
component "Auth Service" from services/auth as auth
```

When `from` is used, no new node is created — the existing node's UUID is recorded in `referencedNodeIds`. The node cannot be deleted while this reference exists.

---

### Markdown Descriptions

All description fields support Markdown. In preview mode, write links to other nodes using their tree path:

```markdown
See also [Login Flow](loginFlow)                          <!-- same component, bare id -->
See also [Auth Service](services/auth)                    <!-- cross-component path -->
See also [Login Use Case](services/auth/mainDiag/login)   <!-- deep path -->
```

Clicking a node link navigates to that node in the tree.

---

## For Developers

### System Requirements

Integra is a single-page web application that allows users to model software systems hierarchically. The core requirements are:

1. **Hierarchical component model** — a tree of components, each with actors, sub-components, use case diagrams, and interface specifications
2. **Use case diagrams** — text-specified diagrams that declare actors and use cases, with relationship arrows rendered via Mermaid
3. **Sequence diagrams** — text-specified interaction diagrams that automatically derive typed interface specifications on components
4. **Derived interfaces** — interface functions (with typed parameters) are extracted from sequence diagram messages and stored on the receiving component
5. **Cross-component references** — participants can reference nodes in other components via a `from path` clause; referenced nodes cannot be deleted while the reference exists
6. **Self-referencing** — a sequence diagram can declare a participant with the same id as its owning component (treated as a self-reference, not a new child)
7. **Use case references in messages** — sequence diagram messages can reference use cases on a component via `UseCase:ucId`; referenced use cases cannot be deleted
8. **Function update flow** — when a function signature changes, the user is prompted to update all affected sequence diagrams or add an overload
9. **Orphan detection** — actors and components not referenced by any diagram are deletable; otherwise the delete button is hidden
10. **Syntax highlighting** — the diagram specification editor highlights known tokens (keywords, participants, interfaces, functions, use case references) in real time using a backdrop technique
11. **Navigation** — highlighted tokens in the specification editor are clickable and navigate to the corresponding node in the tree
12. **Persistence** — system state is persisted to `localStorage` and restored on page load; a clear button resets to the initial state

---

### Design Overview

#### Node Types

| Type | Parent | Auto-created? | Contains |
|---|---|---|---|
| `component` | `component` | Yes (from seq diagram) | actors, subComponents, useCaseDiagrams, interfaces |
| `actor` | `component` | Yes (from diagrams) | — |
| `use-case-diagram` | `component` | No | useCases |
| `use-case` | `use-case-diagram` | Yes (from UC diagram) | sequenceDiagrams |
| `sequence-diagram` | `use-case` | No | — |

#### Key Fields on `DiagramNode`

- `ownerComponentUuid` — the component that logically owns the diagram (set when created)
- `referencedNodeIds` — UUIDs of all actors/components/use-cases referenced in the diagram spec
- `referencedFunctionUuids` — UUIDs of all interface functions referenced in the diagram spec

#### Data Flow

```
User types spec
     │
     ▼
updateNode(diagramUuid, { content })
     │
     ├─► parseUseCaseDiagram()    (for use-case-diagram)
     │         └─► upsertTree() — adds actors, use cases to owning component
     │
     └─► parseSequenceDiagram()   (for sequence-diagram)
               ├─► applyParticipantsToComponent() — adds actors/components
               ├─► applyMessageToComponents() — derives interface functions
               └─► upsertTree() — stores referencedNodeIds, referencedFunctionUuids
```

#### Interface Derivation

Each `sender->>receiver: InterfaceId:functionId(...)` message:
1. Finds or creates an `InterfaceSpecification` with `id = InterfaceId` on the receiver (or sender for `kafka`)
2. Finds or creates a function with `id = functionId` and the parsed parameter list
3. If a function with the same id already exists with a **different** parameter count or types, the user is prompted via a dialog to update all affected diagrams or add as overload

#### Deletion Guards

- **Actors / components**: deletable only when `isNodeOrphaned()` returns `true` — i.e., the node's UUID appears in no `referencedNodeIds` anywhere in the full tree
- **Use cases**: deletable only when `isUseCaseReferenced()` returns `false` — same full-tree search
- `isNodeOrphaned` delegates to `isUseCaseReferenced` for a unified implementation

#### Syntax Highlighting (Backdrop Technique)

The spec editor overlays a transparent `<textarea>` on top of a non-interactive `DiagramSpecPreview` (mode `"backdrop"`). The textarea uses `text-transparent caret-white` so the coloured tokens from the backdrop show through. An `onScroll` handler keeps the two layers in sync.

#### Tech Stack

| Tool | Version | Role |
|---|---|---|
| React | 19 | UI |
| TypeScript | 5.9 | Type safety |
| Vite | 7 | Build tooling |
| Zustand | — | State management |
| Mermaid | — | Diagram rendering |
| Tailwind CSS | — | Styling |
| @uiw/react-md-editor | — | Markdown description fields |
| Vitest | 4 | Unit tests |
| ESLint | 9 | Linting |

#### Scripts

```bash
npm run dev        # Development server
npm run build      # Production build
npm run preview    # Preview production build
npm run lint       # Run ESLint
npm test           # Run tests in watch mode
npm run test:run   # Run tests once (CI)
npm run test:ui    # Run tests with Vitest UI
```

