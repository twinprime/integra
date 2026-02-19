I want to convert this sample project into an app for editing a system model.

The system model consists of a root component which can contain one or more sub-components. Each component can contain one or more sub-components.

Each component can contain one or more actors, use cases, use case diagrams, and sequence diagrams.

Each component has zero or more interface specifications (automatically derived from sequence diagrams).

Each interface specification contains a name, type, and interactions with parameters. Interface types include: kafka, rest, graphql, or other.

The editor contains three panels. The left panel shows a tree structure of the system model. The middle panel shows an editor for the selected node from the left panel. The right panel shows the mermaid diagram generated for diagrams or a preview for other node types.

When a use case diagram or sequence diagram is selected, the middle panel shows a text editor for the diagram specification. The right panel renders the mermaid visualization.

When a component is selected, the middle panel shows fields for name and description, and displays the automatically derived interface specifications (read-only).

When an actor or use case is selected, the middle panel shows fields for name and description.

An example of the tree structure on the left panel:

- Root Component
    - Sub-component 1
        - Use Case Diagram 1
        - Use Case Diagram 2
        - Sequence Diagram 1
        - Sequence Diagram 2
        - Sub-component 2
            - Use Case Diagram 1
            - Use Case Diagram 2
            - Sequence Diagram 1
            - Sequence Diagram 2
            - Sub-component 3
            - Actor 1
            - Use Case 1
        - Sub-component 4
        - Actor 2
        - Use Case 2
    - Sub-component 5

Note: The system no longer has a separate "system" node. The root itself is a ComponentNode. There are also no "diagrams" or "entities" grouping folders - all children are shown directly under their parent component.

The specification of the following nodes in the tree structure are editable via text editor:
- Use Case Diagram (content field)
- Sequence Diagram (content field)

The specification of the following nodes are editable via form fields:
- Component (name, description - interfaces are auto-generated and read-only)
- Actor (name, description)
- Use Case (name, description)

The following are automatically generated from use case and sequence diagram specifications:
- Component nodes (when mentioned in sequence diagrams)
- Actor nodes (when mentioned in use case diagrams or sequence diagrams)
- Use Case nodes (when mentioned in use case diagrams)
- Interface specifications (when messages are sent to components in sequence diagrams)

# Use Case Diagram

This is an example of the text specification of a use case diagram:

```
actor "Exploration Leader" as leader
use case "Create an exploration" as create
leader --> create
```

The syntax uses the `actor` and `use case` keywords with double-quoted names and `as` keyword for IDs.

When an actor is selected in the tree, the editor panel shows:
- ID (read-only label)
- Name (editable input field)
- Description (editable textarea)

When a use case is selected in the tree, the editor panel shows:
- ID (read-only label)
- Name (editable input field)
- Description (editable textarea)

# Sequence Diagram

The sequence diagram specification follows the Mermaid sequence diagram syntax with custom participant declarations.
Use `actor` or `component` keywords to specify the type of participants. You can specify an ID using the "as" keyword:

```
actor "User" as user
component "Service" as service
user->>service: createExploration(explorationId)
```

If the "as" part is omitted, the name itself will be used as the ID.

Messages follow the format: `participant1->>participant2: methodName(param1, param2)`

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
