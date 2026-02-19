I want to convert this sample project into an app for editing a system model.

The system model consists of a root component which can contain one or more sub-components. Each component can contain one or more sub-components.

Each component can contain:
- Actors (automatically created from use case and sequence diagrams)
- Use Case Diagrams (contain use cases)
- Sub-components

Each use case diagram contains:
- Use Cases (automatically created from the diagram specification)

Each use case contains:
- Sequence Diagrams

Each component has zero or more interface specifications (automatically derived from sequence diagrams within its nested use cases).

Each interface specification contains a name, type, and interactions with parameters. Interface types include: kafka, rest, graphql, or other.

The editor contains three panels. The left panel shows a tree structure of the system model. The middle panel shows an editor for the selected node from the left panel. The right panel shows the mermaid diagram generated for diagrams or a preview for other node types.

When a use case diagram or sequence diagram is selected, the middle panel shows a text editor for the diagram specification. The right panel renders the mermaid visualization.

When a component is selected, the middle panel shows fields for name and description, and displays the automatically derived interface specifications (read-only).

When an actor or use case is selected, the middle panel shows fields for name and description.

An example of the tree structure on the left panel:

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

Note: The system no longer has a separate "system" node. The root itself is a ComponentNode. There are also no "diagrams" or "entities" grouping folders - all children are shown directly under their parent component.

Hierarchy rules:
- Use cases can only exist under use case diagrams
- Sequence diagrams can only exist under use cases
- Actors remain at the component level (not nested under diagrams)
- Interface specifications remain at the component level (derived from all sequence diagrams within the component's hierarchy)

The specification of the following nodes in the tree structure are editable via text editor:
- Use Case Diagram (content field)
- Sequence Diagram (content field)

The specification of the following nodes are editable via form fields:
- Component (name, description - interfaces are auto-generated and read-only)
- Actor (name, description)
- Use Case (name, description)

The following are automatically generated from use case and sequence diagram specifications:
- Component nodes (when mentioned in sequence diagrams - added to the owning component)
- Actor nodes (when mentioned in use case diagrams or sequence diagrams - added to the owning component)
- Use Case nodes (when mentioned in use case diagrams - added to the diagram itself)
- Interface specifications (when messages are sent to components in sequence diagrams - added to the owning component)

Note: All diagrams have an `ownerComponentUuid` field that references the component they logically belong to, regardless of nesting depth.

# Use Case Diagram

Use case diagrams contain use cases and their relationships with actors.

This is an example of the text specification of a use case diagram:

```
actor "Exploration Leader" as leader
use case "Create an exploration" as create
leader --> create
```

The syntax uses the `actor` and `use case` keywords with double-quoted names and `as` keyword for IDs.

When the diagram is parsed:
- Actors are added to the component that owns the diagram
- Use cases are added to the use case diagram itself (and can contain sequence diagrams)

When an actor is selected in the tree, the editor panel shows:
- ID (read-only label)
- Name (editable input field)
- Description (editable textarea)

When a use case is selected in the tree, the editor panel shows:
- ID (read-only label)
- Name (editable input field)
- Description (editable textarea)

# Sequence Diagram

Sequence diagrams are nested under use cases and define interactions between actors and components.

The sequence diagram specification follows the Mermaid sequence diagram syntax with custom participant declarations.
Use `actor` or `component` keywords to specify the type of participants. You can specify an ID using the "as" keyword:

```
actor "User" as user
component "Service" as service
user->>service: createExploration(explorationId)
```

If the "as" part is omitted, the name itself will be used as the ID.

Messages follow the format: `participant1->>participant2: methodName(param1, param2)`

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

Example: For the message `user->>service: createExploration(explorationId)`, the system creates:
- A "Default" interface on the "service" component
- An interaction with ID "createExploration"
- A parameter named "explorationId" of type "string" (required)

The interface specifications are automatically updated whenever sequence diagrams are modified.
