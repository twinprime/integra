# Integra User Guide

A visual editor for system engineering models using diagram specifications.

### Quick Start

#### Browse mode

Integra restores the last used mode from `localStorage` and defaults to
**browse mode** on first load. Click the **Integra** icon in the tree toolbar
to toggle between browse and edit mode; the icon is decorated while edit mode
is active.

In browse mode:

- visible fields stay readable but become non-editable
- empty description sections are hidden across nodes, interfaces, and functions
- diagram specification editor fields are hidden so the visualization panel can use the freed space
- tree mutation affordances such as add/delete/reorder controls are hidden
- the **Undo**, **Redo**, **Save**, and **Clear** toolbar buttons are hidden

#### 1. Switch to edit mode

Click on the **Integra** icon in the tree toolbar to enter edit mode if you are currently in browse mode.

#### 2. Save and load your model

Use the **Save** / **Load** buttons in the toolbar to persist your model as a **directory of YAML files** via the browser's File System Access API. Each component is saved as its own `.yaml` file inside a chosen directory. Changes are also auto-saved to `localStorage` and restored on page load.

> **Browser support:** Save/Load requires Chrome or Edge (File System Access API). Firefox and Safari are not supported.

#### 3. Build your system model

The left panel shows your **system tree**. Start by clicking the **Integra** icon
to switch from the default **browse mode** into **edit mode**, then rename the
root component and add sub-components, use case diagrams, and sequence diagrams
using the **+** buttons on each node. When you select a node, the right panel
lets you edit its title inline at the top of the panel and shows its absolute
path directly underneath; the final segment remains the editable node ID, while
earlier segments are clickable breadcrumbs back into the tree.

#### 4. Write diagram specifications

Select a diagram node to open its specification editor. Type your spec in the text area — the right panel renders the diagram in real time. Syntax is highlighted as you type.

#### 5. Explore the derived model

As you write sequence diagrams, Integra automatically derives:

- **Actors and components** added to the owning component
- **Interface specifications** (with typed functions and parameters) on the receiving component
- **Use cases** listed under their use case diagram
- **Visualization panel view switcher** — node types can expose multiple renderable diagram views in the bottom panel; the panel shows a switcher when more than one view is available and resets to that node type's default view when you change tree selection
- **Generated class diagrams** — root, component, use-case-diagram, and use-case views now follow the same generation rules:
    - Input comes from all sequence diagrams owned under the selected node's owner boundary plus all transitively referenced `Sequence:`, `UseCase:`, and `UseCaseDiagram:` targets
    - Visible participants are limited to actors owned by visible components plus components that are direct children of the owner component, components that are in this guide's **Reference scope** for that owner component, and the selected component itself when the selected node is a component
    - Interfaces are shown only for visible components that participate in at least one derived dependency; if a visible component interface is used, only the called methods are listed, otherwise the full interface is shown
    - Dependencies to or from out-of-scope descendants are folded up to the closest ancestor component that is still visible in scope
    - The shared **Interfaces** toggle hides interface nodes and collapses interface-derived dependencies into direct component-to-component links while preserving separate opposite-direction dependencies
    - In component class diagrams, the selected component and its interfaces are styled as the default subject
    - Single-click a class node to focus/filter the diagram to that component, its interfaces, and directly linked classes; single-click it again to clear the filter; double-click to navigate to the node in the tree

Navigate the tree to inspect generated nodes. On initial load, only the root node starts expanded; descendants stay collapsed until you expand them or selection/navigation auto-reveals them. In generated class diagrams, single-clicking a class focuses the diagram around that component; double-clicking navigates to that node in the tree. Hovering a dependency link shows the dependency source and target names plus the sequence diagrams that derived that dependency; clicking a multi-source dependency keeps that popup available for selection, while clicking a single-source dependency navigates directly to that sequence diagram. Hovering an implementation link shows the component and interface names for that relationship, and clicking it pins the popup for inspection. Orphaned nodes (no longer referenced by any diagram) show a delete button on hover.

### Sharing models via direct URL

If the web server serving Integra also hosts model YAML files under `/models/`, you can link directly to a model:

```
https://your-server/models/<component-id>
```

The app will fetch `/models/<component-id>/root.yaml` and all referenced sub-components automatically, then render the model in **browse mode** (read-only, edit mode locked). If the model file is not found, a 404 page is shown.

**Expected file layout on the server:**

```
/models/
  <component-id>/
    root.yaml
    root-<child-id>.yaml
    root-<child-id>-<grandchild-id>.yaml
    ...
```

**Nginx configuration example:**

```nginx
# Serve YAML files directly
location ~* ^/models/.*\.yaml$ { }

# All other /models/<id> paths → SPA
location /models/ {
    try_files $uri /index.html;
}
```

---

### Editor Features

#### Autocomplete

The diagram spec editor provides context-aware suggestions as you type:

- **Participants**: suggest known actors and components when typing after `actor`, `component`, or `from`; descendants of the owning component are suggested with a **relative path** (e.g. `grandchild` or `child/grandchild`), while cross-tree references use an **absolute path** with an alias (e.g. `root/services/auth as auth`)
- **Message receivers**: suggest participants when typing the receiver in a message line
- **UseCase targets**: suggest use case IDs after `UseCase:` in a message label; for use cases in other components the suggestion includes the full path (e.g. `UseCase:orders/placeOrder`)
- **UseCaseDiagram targets**: suggest use case diagram IDs after `UseCaseDiagram:` in a message label; for diagrams in other components the suggestion includes the full path

Suggestions appear automatically as you type. They reflect nodes already defined in the current component (local-first ordering). Accept with `Enter`, dismiss with `Escape`.

#### Keyboard Shortcuts

| Shortcut                          | Action                                                               |
| --------------------------------- | -------------------------------------------------------------------- |
| `Shift+Enter`                     | Save spec and preview diagram without leaving edit mode              |
| `Cmd/Ctrl+Z`                      | Undo in the diagram spec editor (CodeMirror history) _or_ tree-level |
| `Cmd/Ctrl+Shift+Z` / `Cmd/Ctrl+Y` | Redo                                                                 |
| `Alt+←`                           | Navigate back to the previously selected tree node                   |
| `Alt+→`                           | Navigate forward (after going back)                                  |

Tree-level undo/redo is also accessible via the toolbar buttons above the system tree.
The diagram spec editor uses CodeMirror's built-in history, fully independent from the tree-level history.

#### Node Navigation History

The toolbar above the system tree includes **← Back** and **→ Forward** buttons (before Undo/Redo). These work like browser navigation — clicking any node in the tree adds it to the history, and you can step backwards and forwards through your recent selections. The history is per-session and is not persisted across page reloads.

When navigation happens from a rendered diagram or a markdown node link, the
tree automatically expands the newly selected node's ancestor chain and scrolls
that node into view.

#### Description editing

Node descriptions open in a **preview-first** mode. The selected node shows its
rendered markdown immediately, without a separate description label or markdown
toolbar. Click the description area to switch into the full markdown editor;
when the description is empty, the preview shows a compact **No Description**
placeholder until you enter edit mode. In **browse mode**, empty description
sections are hidden instead of showing the placeholder.

#### TODO comments

Nodes can expose a derived TODO list in the tree.

- Add a TODO in description markdown with an HTML comment:
  `<!-- TODO review naming -->`
- Add a TODO in diagram text with a line comment:
  `# TODO review naming`

Each node's TODO indicator aggregates TODOs defined on that node plus all of its
descendants. Clicking the indicator opens a flat list showing each TODO and the
node where it is defined; clicking a TODO navigates to that source node in the
tree. TODOs are derived at runtime and are not saved with the model.

#### Panel Layout

The split-panel layout can be adjusted by dragging the resize handles. Use the **›** button on the right-panel handle to expand/collapse the right panel.

---

### Interface Inheritance

A sub-component can declare that one of its interfaces **inherits** a parent component's interface. This means the sub-component's interface shares the same contract (functions and types) as the parent interface, sourced live from the parent rather than duplicated. Inheritance is **transitive**: if the parent interface is itself inherited, the child sees the parent's full effective inherited contract as read-only inherited functions.

#### Setting up inheritance

1. Select a sub-component in the tree.
2. If its parent component defines interfaces, an **"Inherit parent interface:"** selector appears above the interface tabs.
3. The dropdown lists all parent interfaces not yet inherited by this component. Select one to create a new inherited interface entry and activate its tab.
4. If the component already has an interface with the same ID, Integra analyzes the existing child-local functions before inheriting:
    - exact matches with the inherited contract are dropped as redundant
    - functions with different IDs are kept as additional child-local functions
    - functions with the same ID but a different signature are incompatible and block inheritance
5. When there are no blocking conflicts, the user is prompted to confirm merging into the existing same-ID interface; cancelling leaves the existing interface unchanged.

#### Inherited interface behaviour

- The inherited interface tab is a **mixed view**:
    - parent-inherited functions stay read-only
    - child-added functions on the inherited interface are editable and removable
- Function IDs are unique within an interface. Child-added inherited functions may
  extend the inherited contract, but they cannot reuse a parent function ID with a
  different signature.
- An interface cannot be deleted while any descendant sub-component still inherits
  it, whether that interface is local or itself inherited from an ancestor.
- Component and root class diagrams use the inherited interface's **effective contract**, which combines the full inherited-chain parent contract with any child-local additions.
- A badge shows which parent interface is being inherited (e.g. `inherited from IPaymentGateway`).
- To remove the inheritance, click the **delete** button on the inherited interface tab.
- Sequence diagrams **can add new child-local functions** to an inherited interface. If a message references a function that is not already defined on the parent interface, the function is stored locally on the child inherited interface instead of raising a parse error.
- If a child-added function is edited so it becomes identical to an inherited parent function, the user is prompted to confirm removing the redundant child-local function. If they cancel, the change is rejected.
- If a parent interface function change would become identical to child-added functions on inherited child interfaces, the user is prompted to confirm removing those child-local child functions. If they cancel, the parent change is rejected.

#### Warning icon

When a parent component's interface has no sub-component inheriting it, a **⚠** warning icon appears on the interface tab with the tooltip _"No sub-component inherits this interface"_. This is purely informational — it highlights interfaces that may be intended for inheritance but haven't been wired up yet.

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
customer ->> login
customer ->> placeOrder
admin ->> placeOrder
```

| Syntax                            | Purpose                                                       |
| --------------------------------- | ------------------------------------------------------------- |
| `actor id`                        | Declare a local actor                                         |
| `actor id as alias`               | Declare a local actor; use `alias` in relationship lines      |
| `use case id`                     | Declare a use case                                            |
| `component path/to/node`          | Reference an existing component by path (no new node created) |
| `component path/to/node as alias` | Reference with an alias                                       |
| `A ->> B`                         | Relationship arrow (default — maps to `-->` in Mermaid)       |
| `A ->> B: label`                  | Relationship arrow with a link label                          |

**Arrow types** — the arrow between two nodes maps directly to Mermaid flowchart syntax:

| Arrow  | Mermaid meaning                                                 |
| ------ | --------------------------------------------------------------- |
| `->>`  | Arrowhead (**default**, backward-compatible — renders as `-->`) |
| `-->`  | Arrowhead                                                       |
| `---`  | Open link, no arrowhead                                         |
| `--o`  | Circle at end                                                   |
| `--x`  | Cross/X at end                                                  |
| `<-->` | Bidirectional arrow                                             |
| `o--o` | Bidirectional circle                                            |
| `x--x` | Bidirectional cross                                             |
| `-.->` | Dotted arrow                                                    |
| `-.-`  | Dotted open link                                                |
| `==>`  | Thick arrow                                                     |
| `===`  | Thick open link                                                 |
| `~~~`  | Invisible link                                                  |

**Link labels** — append `: label text` to add a label displayed on the link:

```
customer ->> login: initiates
admin --o placeOrder: extends
customer <--> admin: interacts with
```

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

customer ->> orderSvc: OrdersAPI:placeOrder(orderId: string, amount: number)
orderSvc ->> paymentSvc: PaymentsAPI:charge(orderId: string, amount: number, currency: string?)
orderSvc ->> customer: UseCase:orderConfirmed
orderSvc ->> customer: UseCase:orderService/orderConfirmed
orderSvc ->> customer: UseCase:root/orders/orderConfirmed:Order confirmed
orderSvc ->> customer: UseCaseDiagram:orderingFlows
orderSvc ->> customer: UseCaseDiagram:root/orders/orderingFlows:Ordering flows
orderSvc ->> customer: Sequence:orderConfirmedFlow
orderSvc ->> customer: Sequence:auth/loginFlow:Log In

note right of customer: initiates the flow
note over orderSvc, paymentSvc: payment handshake
```

| Syntax                                                               | Purpose                                                                           |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `# comment text`                                                     | Line comment — ignored by the parser; preserved through ID rename                 |
| `actor id`                                                           | Declare a local actor participant                                                 |
| `actor id as alias`                                                  | Declare a local actor; use `alias` in message lines                               |
| `component id`                                                       | Declare a local component participant                                             |
| `component path/to/node`                                             | Reference an existing component by path (no new node created)                     |
| `component path/to/node as alias`                                    | Reference with an alias                                                           |
| `sender ->> receiver: Interface:function(param: type)`               | Function call message — derives interface on receiver                             |
| `sender ->> receiver: Interface:function(param: type):display label` | Function call message with a custom display label (diagram shows only the label)  |
| `sender ->> receiver: label text`                                    | Plain message label                                                               |
| `sender ->> receiver`                                                | Bare arrow (no label)                                                             |
| `sender ->> receiver: UseCase:useCaseId`                             | Use case reference (local — receiver's component)                                 |
| `sender ->> receiver: UseCase:comp/useCaseId`                        | Use case reference by path (relative or absolute)                                 |
| `sender ->> receiver: UseCase:useCaseId:label`                       | Use case reference with a custom display label                                    |
| `sender ->> receiver: UseCase:comp/useCaseId:label`                  | Use case path reference with a custom label                                       |
| `sender ->> receiver: UseCaseDiagram:diagramId`                      | Use case diagram reference (expands to all sequence diagrams under its use cases) |
| `sender ->> receiver: UseCaseDiagram:comp/diagramId`                 | Use case diagram reference by path                                                |
| `sender ->> receiver: UseCaseDiagram:diagramId:label`                | Use case diagram reference with a custom display label                            |
| `sender ->> receiver: Sequence:seqDiagramId`                         | Sequence diagram reference (local — receiver's component)                         |
| `sender ->> receiver: Sequence:comp/seqDiagramId`                    | Sequence diagram reference by path                                                |
| `sender ->> receiver: Sequence:seqDiagramId:label`                   | Sequence diagram reference with a custom display label                            |
| `note right of id: text`                                             | Note to the right of a participant                                                |
| `note left of id: text`                                              | Note to the left of a participant                                                 |
| `note over id: text`                                                 | Note spanning a single participant                                                |
| `note over id1, id2: text`                                           | Note spanning two participants                                                    |
| `loop [condition]` … `end`                                           | Loop block (renders as Mermaid `loop`)                                            |
| `alt [condition]` … `else [condition]` … `end`                       | Conditional block (renders as Mermaid `alt`/`else`)                               |
| `opt [condition]` … `end`                                            | Optional block — single section, no `else` (renders as Mermaid `opt`)             |
| `par [label]` … `and [label]` … `end`                                | Parallel block (renders as Mermaid `par`/`and`)                                   |

**Arrow types** — the arrow between sender and receiver maps 1:1 to Mermaid's sequence diagram arrow syntax:

| Arrow  | Mermaid meaning                                        |
| ------ | ------------------------------------------------------ |
| `->>`  | Solid line, arrowhead — synchronous call (**default**) |
| `-->>` | Dotted line, arrowhead — reply or async                |
| `->`   | Solid line, no arrowhead                               |
| `-->`  | Dotted line, no arrowhead                              |
| `-x`   | Solid line, X — destroy                                |
| `--x`  | Dotted line, X                                         |
| `-)`   | Solid line, open arrowhead — async notation            |
| `--)`  | Dotted line, open arrowhead                            |

Prefix any sequence-diagram arrow with `X` (for example, `X->>` or `X-->`) to
exclude that message from **class-diagram dependency derivation** while still
rendering the underlying Mermaid arrow normally in the sequence diagram.

Example:

```
client ->> server: REST:getUser(id: string)
server -->> client: response
```

**Block constructs** — `loop`, `alt`, `opt`, and `par` wrap sequences of messages. Condition/label text after the keyword is optional free-form text. Blocks are fully nestable.

```
loop check every second
  A ->> B: ping
end

alt happy path
  A ->> B: ok
else error path
  A ->> B: err
else
  A ->> B: default
end

opt if user is premium
  A ->> B: upgrade offer
end

par send notification
  A ->> B: notify
and update audit log
  A ->> C: log
end
```

- `else` sections apply only to `alt` blocks; `and` sections apply only to `par` blocks; `opt` has no sections.
- `end`, `else`, `and`, and `opt` are reserved keywords and cannot be used as participant IDs.
- `UseCase:`, `UseCaseDiagram:`, and `Sequence:` path targets are not scope-restricted today. Only component path references follow the component-scope rules.

**Function call message format:** `sender ->> receiver: InterfaceId:functionId(param: type, param2: type?)`

- Parameter types default to `any` if omitted
- Append `?` to mark a parameter as optional (e.g. `name: string?`)
- Append `:display label` after the closing `)` to show a custom label in the diagram instead of `Interface:function(params)` (e.g. `IAuth:login(user: string):sign in`)
- For `kafka`-type interfaces, the **sender** owns the interface
- Use `\n` in a label or note text for a line break (renders as `<br/>` in Mermaid)

**Round-trip fidelity:** When a participant ID is renamed (e.g. via the rename action in the tree), the spec is re-generated from the AST. Line indentation (leading spaces and tabs inside blocks) and `#` comment lines are stored in the AST and reproduced verbatim — the only normalisation is that blank lines between statements are not preserved.

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
customer ->> auth: AuthAPI:login(user: string)
customer ->> pay: PaymentsAPI:charge(amount: number)
```

When a path reference is used:

- If the terminal node does not yet exist it is **auto-created** (as a component), provided the path is in scope — intermediate missing components are also created automatically
- The node's UUID is recorded in `referencedNodeIds`; the node cannot be deleted while this reference exists
- The alias (if provided with `as alias`) is used in all message lines; otherwise the last path segment is used

**Single-segment declarations** (`actor id`, `component id`) always create or reference a **local** node within the owning component. Use a multi-segment path (`component root/services/auth`) to reach nodes elsewhere in the tree.

#### Reference scope

Multi-segment path references are restricted to components that are **in scope** for the owning diagram. A component `X` is in scope when it is:

| Relationship to ownerComp                            | Example (ownerComp = `child`)                  | Allowed |
| ---------------------------------------------------- | ---------------------------------------------- | ------- |
| **Self**                                             | `child`                                        | ✅      |
| **Direct child**                                     | `child/grandchild`                             | ✅      |
| **Ancestor** (parent, grandparent, …)                | `root`                                         | ✅      |
| **Sibling** (direct child of parent)                 | `root/sibling`                                 | ✅      |
| **Uncle/Aunt** (direct child of grandparent)         | `root/grandparent/uncle` — resolved as `uncle` | ✅      |
| **Any descendant** (grandchild, great-grandchild, …) | `grandchild`, `grandchild/greatGrandchild`     | ✅      |
| **Cousin** (child of sibling/uncle)                  | `root/sibling/cousin`                          | ❌      |

```
root
  child     ← ownerComp
    grandchild        # descendant of owner — ✅
      greatGrandchild # descendant of owner — ✅
  sibling             # direct child of ancestor root — ✅
    cousin            # child of sibling — ❌
```

Referencing an out-of-scope path causes a parse error and the diagram spec is not applied.

For sequence diagrams, these scope rules apply to **component references** (for example, multi-segment participant declarations such as `component root/service/db`).

Message labels that use `UseCase:...`, `UseCaseDiagram:...`, or `Sequence:...` do **not** have scope restrictions today. Their scoping logic is intentionally encapsulated in code so rules can be added later without rewiring all call sites.

---

### Markdown Descriptions

All description fields support Markdown. In preview mode, write links to other nodes using their tree path:

```markdown
See also [Login Flow](loginFlow) <!-- same component, bare id -->
See also [Auth Service](services/auth) <!-- cross-component path -->
See also [Login Use Case](services/auth/mainDiag/login) <!-- deep path -->
```

Clicking a node link navigates to that node in the tree.

---

### YAML File Format

Integra saves and loads your model as a **directory of YAML files** — one file per component. The directory can be read, authored, or version-controlled by hand.

#### Directory layout

When you save a system whose root component has id `my-system`, you get:

```
my-system.yaml              ← root component (the load/save entry point)
my-system/
  my-system-gateway.yaml    ← direct child of root (parent-id: my-system)
  gateway-auth.yaml         ← child of gateway (parent-id: gateway)
  gateway-payments.yaml     ← another child of gateway
```

- The **root file** is `<root-id>.yaml` in the chosen directory.
- **Descendant files** live in a flat `<root-id>/` subdirectory named `<parent-id>-<self-id>.yaml`.
- The `subComponents` field in each file lists the **relative paths** of its children (relative to the chosen directory root), instead of inlining the child data.

#### Top-level structure

Each component YAML file has the following shape:

```yaml
uuid: <globally-unique-id>
id: my-system # must be "root" for the root component
name: My System
type: component
description: Optional description # supports Markdown
subComponents:
    - my-system/my-system-gateway.yaml # relative path to child file
actors: [...]
useCaseDiagrams: [...]
interfaces: [...]
```

#### Node type fields

| Node type          | Key fields (beyond `uuid`, `id`, `name`, `type`, `description`)                 |
| ------------------ | ------------------------------------------------------------------------------- |
| `component`        | `subComponents[]` (file paths), `actors[]`, `useCaseDiagrams[]`, `interfaces[]` |
| `actor`            | _(none)_                                                                        |
| `use-case-diagram` | `content` (spec text), `useCases[]`                                             |
| `use-case`         | `sequenceDiagrams[]`                                                            |
| `sequence-diagram` | `content` (spec text)                                                           |

> All diagram types (`use-case-diagram` and `sequence-diagram`) support the `description` field.

Interface specifications live directly on their owning component:

| Object                   | Key fields                                                                        |
| ------------------------ | --------------------------------------------------------------------------------- |
| `InterfaceSpecification` | `uuid`, `id`, `name`, `type` (`rest`\|`kafka`\|`graphql`\|`other`), `functions[]` |
| `InterfaceFunction`      | `uuid`, `id`, `description?`, `parameters[]`                                      |
| `Parameter`              | `name`, `type`, `required` (boolean), `description?`                              |

#### Example

Root file — `e-commerce.yaml`:

```yaml
uuid: a1b2c3d4-0001
id: e-commerce
name: E-Commerce System
type: component
subComponents:
    - e-commerce/e-commerce-orderSvc.yaml
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
          customer ->> placeOrder
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
                      customer ->> orderSvc: OrdersAPI:placeOrder(orderId: string, amount: number)
interfaces: []
```

Child file — `e-commerce/e-commerce-orderSvc.yaml`:

```yaml
uuid: a1b2c3d4-0010
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
```

The only field you must ensure is unique is `uuid` — use any distinct string per node (e.g. standard UUIDs or simple incrementing IDs as in the example above).

---
