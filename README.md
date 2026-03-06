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

#### 2. Save and load your model

Use the **Save** / **Load** buttons in the toolbar to persist your model as a YAML file via the browser's File System Access API. Changes are also auto-saved to `localStorage` and restored on page load.

#### 3. Build your system model

The left panel shows your **system tree**. Start by renaming the root component, then add sub-components, use case diagrams, and sequence diagrams using the **+** buttons on each node.

#### 4. Write diagram specifications

Select a diagram node to open its specification editor. Type your spec in the text area — the right panel renders the diagram in real time. Syntax is highlighted as you type.

#### 5. Explore the derived model

As you write sequence diagrams, Integra automatically derives:
- **Actors and components** added to the owning component
- **Interface specifications** (with typed functions and parameters) on the receiving component
- **Use cases** listed under their use case diagram
- **Use-case class diagram** — when a use-case node is selected, the bottom panel renders an auto-generated class diagram showing all actors, components, and interfaces used across its sequence diagrams, with realization (`..|>`) and dependency (`..>`) arrows

Navigate the tree to inspect generated nodes. Clicking a node or participant in the rendered diagram navigates to that node in the tree. Orphaned nodes (no longer referenced by any diagram) show a delete button on hover.

---

### Editor Features

#### Autocomplete

The diagram spec editor provides context-aware suggestions as you type:
- **Participants**: suggest known actors and components when typing after `actor`, `component`, or `from`
- **Message receivers**: suggest participants when typing the receiver in a message line
- **UseCase targets**: suggest use case IDs after `UseCase:` in a message label; for use cases in other components the suggestion includes the full path (e.g. `UseCase:orders/placeOrder`)

Suggestions appear automatically as you type or can be triggered explicitly with `Tab`. They reflect nodes already defined in the current component (local-first ordering). Accept with `Tab` or `Enter`, dismiss with `Escape`.

#### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Shift+Enter` | Save spec and preview diagram without leaving edit mode |
| `Cmd/Ctrl+Z` | Undo in the diagram spec editor (CodeMirror history) *or* tree-level |
| `Cmd/Ctrl+Shift+Z` / `Cmd/Ctrl+Y` | Redo |
| `Tab` | Accept autocomplete suggestion (or trigger if no suggestions are showing) |

Tree-level undo/redo is also accessible via the toolbar buttons above the system tree.
The diagram spec editor uses CodeMirror's built-in history, fully independent from the tree-level history.

#### Panel Layout

The split-panel layout can be adjusted by dragging the resize handles. Use the **›** button on the right-panel handle to expand/collapse the right panel.

---

### Diagram Specifications

#### Use Case Diagram

Declare actors, use cases, and their relationships.

```
# Local nodes (created in the owning component)
actor customer
use case login
use case placeOrder

# External node — reference an existing node by path
component root/admin as admin

# Relationships
customer --> login
customer --> placeOrder
admin --> placeOrder
```

| Syntax | Purpose |
|---|---|
| `actor id` | Declare a local actor |
| `actor id as alias` | Declare a local actor; use `alias` in relationship lines |
| `use case id` | Declare a use case |
| `component path/to/node` | Reference an existing component by path (no new node created) |
| `component path/to/node as alias` | Reference with an alias |
| `A --> B` | Relationship arrow |

**Node IDs are scoped to the owning component.** The same ID can be reused in different components.

---

#### Sequence Diagram

Declare participants and message interactions.

```
# Local participants
actor customer
component orderSvc
component paymentSvc

# External component referenced by path
component root/services/auth as auth

customer --> orderSvc: OrdersAPI:placeOrder(orderId: string, amount: number)
orderSvc --> paymentSvc: PaymentsAPI:charge(orderId: string, amount: number, currency: string?)
orderSvc --> customer: UseCase:orderConfirmed
orderSvc --> customer: UseCase:orderService/orderConfirmed
orderSvc --> customer: UseCase:root/orders/orderConfirmed:Order confirmed

note right of customer: initiates the flow
note over orderSvc, paymentSvc: payment handshake
```

| Syntax | Purpose |
|---|---|
| `actor id` | Declare a local actor participant |
| `actor id as alias` | Declare a local actor; use `alias` in message lines |
| `component id` | Declare a local component participant |
| `component path/to/node` | Reference an existing component by path (no new node created) |
| `component path/to/node as alias` | Reference with an alias |
| `sender --> receiver: Interface:function(param: type)` | Function call message — derives interface on receiver |
| `sender --> receiver: label text` | Plain message label |
| `sender --> receiver` | Bare arrow (no label) |
| `sender --> receiver: UseCase:useCaseId` | Use case reference (local — receiver's component) |
| `sender --> receiver: UseCase:comp/useCaseId` | Use case reference by path (relative or absolute) |
| `sender --> receiver: UseCase:useCaseId:label` | Use case reference with a custom display label |
| `sender --> receiver: UseCase:comp/useCaseId:label` | Use case path reference with a custom label |
| `note right of id: text` | Note to the right of a participant |
| `note left of id: text` | Note to the left of a participant |
| `note over id: text` | Note spanning a single participant |
| `note over id1, id2: text` | Note spanning two participants |

**Function call message format:** `sender --> receiver: InterfaceId:functionId(param: type, param2: type?)`
- Parameter types default to `any` if omitted
- Append `?` to mark a parameter as optional (e.g. `name: string?`)
- For `kafka`-type interfaces, the **sender** owns the interface
- Use `\n` in a label or note text for a line break (renders as `<br/>` in Mermaid)

**Multi-word participant names** are supported — declare as `actor Output Topics` and reference the same name in messages.

**Self-reference:** A `component` participant with the same ID as the owning component is treated as a self-reference — no child component is created.

---

### Cross-Component References

Use a path to reference nodes defined in other parts of the tree. The path is a `/`-separated list of component IDs ending with the node ID:

```
# In a use case diagram — reference external component
component root/services/auth as auth

# In a sequence diagram — reference external component with alias
component root/services/payments as pay
customer --> auth: AuthAPI:login(user: string)
customer --> pay: PaymentsAPI:charge(amount: number)
```

When a path reference is used:
- No new node is created — the existing node's UUID is recorded in `referencedNodeIds`
- The node cannot be deleted while this reference exists
- The alias (if provided with `as alias`) is used in all message lines; otherwise the last path segment is used

**Single-segment declarations** (`actor id`, `component id`) always create or reference a **local** node within the owning component. Use a multi-segment path (`component root/services/auth`) to reach nodes elsewhere in the tree.

#### Reference scope

Multi-segment path references are restricted to components that are **in scope** for the owning diagram. A component `X` is in scope when it is:

| Relationship to ownerComp | Example (ownerComp = `child`) | Allowed |
|---|---|---|
| **Self** | `child` | ✅ |
| **Direct child** | `child/grandchild` | ✅ |
| **Ancestor** (parent, grandparent, …) | `root` | ✅ |
| **Sibling** (direct child of parent) | `root/sibling` | ✅ |
| **Uncle/Aunt** (direct child of grandparent) | `root/grandparent/uncle` — resolved as `uncle` | ✅ |
| **Grandchild** (child of direct child) | `child/grandchild/greatGrandchild` | ❌ |
| **Cousin** (child of sibling/uncle) | `root/sibling/cousin` | ❌ |

```
root
  child     ← ownerComp
    grandchild        # direct child — ✅
      greatGrandchild # grandchild of owner — ❌
  sibling             # direct child of ancestor root — ✅
    cousin            # child of sibling — ❌
```

Referencing an out-of-scope path causes a parse error and the diagram spec is not applied.

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

### YAML File Format

Integra saves and loads your model as a **YAML file** (`.yaml` / `.yml`). The file is a direct serialisation of the root `ComponentNode` tree — the same structure held in memory. It can be read, authored, or version-controlled by hand, though the app manages certain fields automatically (see notes below).

#### Top-level structure

The file root is always a `component` node representing the root of your system:

```yaml
uuid: <globally-unique-id>
id: root                      # must be "root" for the root component
name: My System
type: component
description: Optional description   # supports Markdown
subComponents: [...]
actors: [...]
useCaseDiagrams: [...]
interfaces: [...]
```

#### Node type fields

| Node type | Key fields (beyond `uuid`, `id`, `name`, `type`, `description`) |
|---|---|
| `component` | `subComponents[]`, `actors[]`, `useCaseDiagrams[]`, `interfaces[]` |
| `actor` | *(none)* |
| `use-case-diagram` | `content` (spec text), `useCases[]` |
| `use-case` | `sequenceDiagrams[]` |
| `sequence-diagram` | `content` (spec text) |

Interface specifications live directly on their owning component:

| Object | Key fields |
|---|---|
| `InterfaceSpecification` | `uuid`, `id`, `name`, `type` (`rest`\|`kafka`\|`graphql`\|`other`), `functions[]` |
| `InterfaceFunction` | `uuid`, `id`, `description?`, `parameters[]` |
| `Parameter` | `name`, `type`, `required` (boolean), `description?` |

#### Example

```yaml
uuid: a1b2c3d4-0001
id: root
name: E-Commerce System
type: component
subComponents:
  - uuid: a1b2c3d4-0010
    id: orderSvc
    name: Order Service
    type: component
    subComponents: []
    actors: []
    useCaseDiagrams: []
    interfaces:
      - uuid: a1b2c3d4-0011
        id: OrdersAPI
        name: OrdersAPI
        type: rest
        functions:
          - uuid: a1b2c3d4-0012
            id: placeOrder
            parameters:
              - name: orderId
                type: string
                required: true
              - name: amount
                type: number
                required: true
actors:
  - uuid: a1b2c3d4-0020
    id: customer
    name: Customer
    type: actor
useCaseDiagrams:
  - uuid: a1b2c3d4-0030
    id: mainFlows
    name: Main Flows
    type: use-case-diagram
    content: |
      actor customer
      use case placeOrder
      customer --> placeOrder
    useCases:
      - uuid: a1b2c3d4-0031
        id: placeOrder
        name: Place Order
        type: use-case
        sequenceDiagrams:
          - uuid: a1b2c3d4-0040
            id: placeOrderFlow
            name: Place Order Flow
            type: sequence-diagram
            content: |
              actor customer
              component orderSvc
              customer --> orderSvc: OrdersAPI:placeOrder(orderId: string, amount: number)
interfaces: []
```

The only field you must ensure is unique is `uuid` — use any distinct string per node (e.g. standard UUIDs or simple incrementing IDs as in the example above).

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
7. **Use case references in messages** — sequence diagram messages can reference use cases via `UseCase:ucId` (local) or `UseCase:path/to/comp/ucId` (cross-component); referenced use cases cannot be deleted
8. **Function update flow** — when a function signature changes, the user is prompted to update all affected sequence diagrams or add an overload
9. **Orphan detection** — actors and components not referenced by any diagram are deletable; otherwise the delete button is hidden
10. **Syntax highlighting** — the diagram specification editor (CodeMirror 6) highlights known tokens (keywords, participants, interfaces, functions, use case references) in real time using a Chevrotain-based decoration pass
11. **Navigation** — highlighted tokens in the specification editor are clickable and navigate to the corresponding node in the tree; entities in the rendered Mermaid diagram are also clickable for the same purpose
12. **Persistence** — system state is persisted to `localStorage` and restored on page load; a clear button resets to the initial state; Save / Load buttons use the File System Access API to read/write YAML files
13. **Auto-generated use-case class diagram** — selecting a use-case node renders a class diagram in the bottom panel derived from all its sequence diagrams, showing actors, components, interfaces (with methods), and realization / dependency relationships

---

### Design Overview

#### React Component Architecture

The UI is split into three panels managed by `MainLayout`. Each panel is independently scrollable and resizable via drag handles.

```mermaid
graph TD
    App --> MainLayout

    MainLayout -->|left panel| TreeView
    MainLayout -->|right panel| EditorPanel
    MainLayout -->|bottom panel| DiagramPanel

    TreeView --> TreeNode["TreeNode (recursive)"]
    TreeNode --> ContextMenu

    EditorPanel -->|component| ComponentEditor
    EditorPanel -->|"use-case-diagram<br>sequence-diagram"| DiagramEditor
    EditorPanel -->|actor, use-case, etc.| CommonEditor

    ComponentEditor --> InterfaceEditor
    ComponentEditor --> MarkdownEditor
    InterfaceEditor --> FunctionEditor
    FunctionEditor --> MarkdownEditor
    CommonEditor --> MarkdownEditor

    DiagramEditor --> DiagramCodeMirrorEditor
    DiagramEditor --> FunctionUpdateDialog

    DiagramPanel -->|use-case-diagram| UseCaseDiagram
    DiagramPanel -->|sequence-diagram| SequenceDiagram
    DiagramPanel -->|use-case| UseCaseClassDiagram
```

**Panel roles:**

| Component | Role |
|---|---|
| `MainLayout` | Split-panel layout with draggable resize handles and expand/collapse buttons |
| `TreeView` | System tree with add/delete/rename; Save, Load, Clear, Undo/Redo toolbar |
| `TreeNode` | Recursive node row — renders label, type icon, +/delete buttons, selection highlight |
| `ContextMenu` | Right-click menu for node-level actions |
| `EditorPanel` | Routes to the correct editor based on the selected node's type |
| `DiagramEditor` | Text editor for use-case and sequence diagram specs; syntax highlighting, autocomplete, undo/redo, Shift+Enter save |
| `DiagramCodeMirrorEditor` | CodeMirror 6 editor wrapper used by `DiagramEditor`; handles both editable and read-only (preview) modes; Chevrotain-powered syntax highlighting; click-to-navigate tokens in preview mode |
| `ComponentEditor` | Name, description, and interface list editor for component nodes |
| `InterfaceEditor` | Interface name, type, and function list editor |
| `FunctionEditor` | Function id, parameters, and description editor; shows referencing sequence diagrams |
| `CommonEditor` | Minimal name + markdown description editor for actor, use-case, and sequence-diagram nodes |
| `MarkdownEditor` | Markdown textarea with preview toggle; node-path links are clickable |
| `FunctionUpdateDialog` | Modal dialog shown when a function signature change affects other diagrams |
| `DiagramPanel` | Routes to the correct Mermaid renderer based on selected node type |
| `UseCaseDiagram` | Renders use-case-diagram spec via Mermaid; clickable entities |
| `SequenceDiagram` | Renders sequence diagram spec via Mermaid; clickable participants and message labels |
| `UseCaseClassDiagram` | Renders auto-generated class diagram for a use-case node; clickable classes |
| `DiagramErrorBanner` | Displays Mermaid render errors with the raw spec source |

#### Hooks

Rendering logic for Mermaid diagrams is extracted into custom hooks to keep components thin:

| Hook | Used by | Purpose |
|---|---|---|
| `useMermaidBase` | `useUseCaseDiagram`, `useSequenceDiagram` | Shared Mermaid render loop — builds the diagram string, calls `mermaid.render()`, binds click handlers, exposes `svg`/`error`/`elementRef` |
| `useUseCaseDiagram` | `UseCaseDiagram` | Builds the use-case diagram transform and wires `__integraNavigate` |
| `useSequenceDiagram` | `SequenceDiagram` | Builds the sequence diagram transform and wires `__integraNavigate` |
| `useUseCaseClassDiagram` | `UseCaseClassDiagram` | Calls `buildUseCaseClassDiagram()`, renders via Mermaid, wires `__integraNavigate` |
| `useAutoComplete` | `DiagramEditor` / `integraAutocomplete.ts` | Cursor-position-aware suggestion engine — `detectContext` and `buildSuggestions` pure functions are also consumed by the CodeMirror completion source |

#### State Management

All application state lives in a single **Zustand** store (`useSystemStore`). Components subscribe selectively to avoid unnecessary re-renders.

```mermaid
graph LR
    Store[("useSystemStore<br>Zustand + persist")]

    Store -->|"rootComponent<br>selectedNodeId"| TreeView
    Store -->|"rootComponent<br>selectedNodeId"| EditorPanel
    Store -->|"rootComponent<br>selectedNodeId"| MainLayout
    Store -->|"rootComponent<br>selectedNodeId"| DiagramPanel

    TreeView -->|"selectNode<br>updateNode<br>addNode<br>deleteNode<br>undo / redo<br>markSaved<br>setSystem"| Store
    EditorPanel -->|"updateNode<br>applyFunctionUpdates"| Store
    DiagramPanel -->|selectNode| Store
```

Key store slices:

| Slice | Type | Purpose |
|---|---|---|
| `rootComponent` | `ComponentNode` | Entire system tree |
| `selectedNodeId` | `string \| null` | Currently selected node UUID |
| `savedSnapshot` | `string \| null` | YAML snapshot at last save (for unsaved-changes detection) |
| `past` / `future` | `ComponentNode[]` | Undo/redo history stacks |

#### Node Types

| Type | Parent | Auto-created? | Contains |
|---|---|---|---|
| `component` | `component` | Yes (from seq diagram) | actors, subComponents, useCaseDiagrams, interfaces |
| `actor` | `component` | Yes (from diagrams) | — |
| `use-case-diagram` | `component` | No | useCases |
| `use-case` | `use-case-diagram` | Yes (from UC diagram) | sequenceDiagrams |
| `sequence-diagram` | `use-case` | No | — |

#### Auto-generated Use-Case Class Diagram

When a `use-case` node is selected, `buildUseCaseClassDiagram()` (`src/utils/useCaseClassDiagram.ts`) parses all sequence diagrams under it using the Chevrotain `SeqAst` and produces a Mermaid `classDiagram`:

- Each actor/component participant becomes a class node (`<<actor>>` annotation for actors)
- Each interface ID referenced in a message becomes a class with `<<interface>>` and its called methods listed
- `Component ..|> Interface` — realization (component owns/provides the interface)
- `Sender ..> Interface` — dependency (sender calls via the interface)
- `Sender ..> Receiver` — dependency for plain (non-interface, non-self) messages
- Click handlers use `globalThis.__integraNavigate` to navigate to the clicked node

#### Parsers (`src/parser/`)

Diagram specs are parsed by **Chevrotain**-based lexer + CstParser + CST visitor pipelines, one per diagram type:

```
src/parser/
  tokens.ts                     ← shared token definitions
  sequenceDiagram/
    lexer.ts                    ← multi-mode lexer (label mode, text mode)
    parser.ts                   ← CstParser
    visitor.ts                  ← CST → SeqAst { declarations[], statements[] }
    systemUpdater.ts            ← SeqAst → node tree update
    mermaidGenerator.ts         ← SeqAst → Mermaid string + idToUuid map
  useCaseDiagram/
    lexer.ts                    ← single-mode lexer
    parser.ts                   ← CstParser
    visitor.ts                  ← CST → UcdAst { declarations[], links[] }
    systemUpdater.ts            ← UcdAst → node tree update
    mermaidGenerator.ts         ← UcdAst → Mermaid string + idToUuid map
```

`SeqAst.statements` preserves source order for both messages and notes, so notes appear in the rendered diagram exactly where they were written.



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

Both parsers are implemented with **Chevrotain** (lexer + CstParser + CST visitor), producing typed ASTs (`SeqAst` / `UcdAst`) before applying node-tree changes or generating Mermaid output. Parse errors are reported with line and column numbers and cleared automatically when the content becomes valid.

#### Interface Derivation

Each `sender --> receiver: InterfaceId:functionId(...)` message:
1. Finds or creates an `InterfaceSpecification` with `id = InterfaceId` on the receiver (or sender for `kafka`)
2. Finds or creates a function with `id = functionId` and the parsed parameter list
3. If a function with the same id already exists with a **different** parameter count or types, the user is prompted via a dialog to update all affected diagrams or add as overload

#### Deletion Guards

- **Actors / components**: deletable only when `isNodeOrphaned()` returns `true` — i.e., the node's UUID appears in no `referencedNodeIds` anywhere in the full tree
- **Use cases**: deletable only when `isUseCaseReferenced()` returns `false` — same full-tree search
- `isNodeOrphaned` delegates to `isUseCaseReferenced` for a unified implementation

#### Syntax Highlighting (CodeMirror 6 + Chevrotain)

The spec editor uses **CodeMirror 6** (`DiagramCodeMirrorEditor`) for both editable and read-only preview modes.  Syntax colouring is provided by a CodeMirror `StateField<DecorationSet>` in `integraLanguage.ts` that runs line-by-line regex tokenisation (identical patterns to the former backdrop approach) on every document change and maps token types to `Decoration.mark({ class })` spans.  The same pass also builds a navigation map (offset range → node UUID) used by the readonly editor to navigate the tree on token click.

Chevrotain lexer tokens defined in `src/parser/tokens.ts` are the authoritative token vocabulary; the CM highlight field follows the same pattern rules to keep behaviour in sync.

Autocomplete is provided by `integraAutocomplete.ts`, a CodeMirror `CompletionSource` that delegates to the shared `detectContext` / `buildSuggestions` pure functions from `useAutoComplete.ts`.  CodeMirror manages the trigger delay and dropdown UI.

#### Tech Stack

| Tool | Version | Role |
|---|---|---|
| React | 19 | UI |
| TypeScript | 5.9 | Type safety |
| Vite | 7 | Build tooling |
| Zustand | — | State management |
| Mermaid | — | Diagram rendering |
| Chevrotain | 11 | Lexer + parser for diagram spec grammars |
| Tailwind CSS | — | Styling |
| CodeMirror 6 | — | Diagram spec editor (syntax highlighting, autocomplete, undo/redo) |
| Chevrotain | 11 | Diagram spec lexer / parser; token vocabulary reused for CM highlighting |
| @uiw/react-md-editor | — | Markdown description fields |
| Vitest | 4 | Unit tests |
| Playwright | — | End-to-end tests |
| ESLint | 9 | Linting |

#### Scripts

```bash
npm run dev        # Development server
npm run build      # Production build
npm run preview    # Preview production build
npm run lint       # Run ESLint
npm test           # Run unit tests in watch mode
npm run test:run   # Run unit tests once (CI)
npm run test:ui    # Run unit tests with Vitest UI
npm run test:e2e   # Run Playwright end-to-end tests
```

