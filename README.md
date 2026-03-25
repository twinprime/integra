# Integra

A visual editor for system engineering models using diagram specifications.

## Documentation

- [User guide](src/docs/user-guide.md)
- [Developer guide](docs/developer-guide.md)

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Repository notes

- The user guide is also packaged into the app and can be opened from the toolbar help button.
- Preserve the model invariants documented in `docs/developer-guide.md` when making code changes.

---

## For Users

### Quick Start

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
