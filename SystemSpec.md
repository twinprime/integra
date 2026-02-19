I want to convert this sample project into a app for editing a system model.

The system model consists of a single system which can contain one or more components. Each component can contain one or more sub-components.

Each component can contain one or more actors, use cases and sequence diagrams.

Each component has one or more interface specification.

Each interface specification contains attributes and interactions with parameters. Attributes of the interface include the interface name and type. Type includes kafka topic, REST, GraphQL.

The editor contains three panels. The left panel shows a tree structure of the system model. The right panel shows an editor for the text specification of the object selected on the left panel. If the selected object is a use case or sequence diagram, then the bottom panel shows the mermaid diagram generated for the object. Mermaid flowchart can be used to visualize use case diagrams.

An example of the tree structure on the left panel

- system
    - component 1
        - diagrams
            - use case diagram 1
            - use case diagram 2
            - sequence diagram 1
            - sequence diagram 2
        - entities
            - component 2
                - diagrams
                    - use case diagram 1
                    - use case diagram 2
                    - sequence diagram 1
                    - sequence diagram 2
                - entities
                    - component 3
                    - actor 1
                    - use case 1
            - component 4
    - component 5

The specification of the following nodes in the tree structure are completely editable
- use case diagram
- sequence diagram

The specification of the following nodes in the tree structure are automatically generated from the use case and sequence diagram specification provided by the user
- component
- actor

If an actor is mentioned in a use case, then a skeleton specification for it is generated and added to the system model.

If a component is mentioned in a sequence diagram, then a skeleton specification for it is generated and added to the system model.

If in a sequence diagram a message is sent to a component, then the message is added to the interface specification of the component.

# Use Case Diagram

this is an example of the text specification of a use case diagram

```
actor "Exploration Leader" as leader
use case "Create an exploration" as create
leader --> create
```

Actor text specification should be valid yaml. This is an example.

```
id: leader
name: Exploration Leader
description: leader of an exploration
```

When an actor is selected on the left panel, the right panel will show the 'id' and 'name' attributes of the actor as labels, while providing a text field for editing the 'description' attribute.

Use case text specification should be valid yaml. This is an example.

```
id: create
name: Create an exploration
description: An exploration leader creates an exploration using the system
```

When a use case is selected on the left panel, the right panel will show the 'id' and 'name' attributes of the use case as labels, while providing a text field for editing the 'description' attribute.

# Sequence Diagram

The sequence diagram specification follows the Mermaid sequence diagram syntax with custom participant declarations.
Use `actor` or `component` keywords to specify the type of participants. You can also specify an id using the "as" keyword:

```
actor "User" as user
component "Service" as service
```

If the "as" part is omitted, the name itself will be used as the id.

Component text specification should be valid yaml. This is an example.

```
id: ExplorationController
name: Exploration Controller
interactions:
    - id: createExploration
      description: Creates a new exploration
      type: REST
      parameters:
        - name: explorationId
          type: string
          required: true
          description: The id of the exploration to create
```

The interactions are derived from messages of the format: 'id(parameter1, parameter2)'. For the above example, it should be 'createExploration(explorationId)'. 

In the right panel, these derived attributes are shown as labels while the other attributes are provided by the user via a text field.
