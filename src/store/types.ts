export type NodeType = 'component' | 'actor' | 'use-case' | 'sequence-diagram' | 'use-case-diagram' | 'folder';

export interface BaseNode {
  uuid: string; // Globally unique identifier
  id: string; // ID used in specification
  name: string;
  type: NodeType;
  description?: string;
}

export interface ComponentNode extends BaseNode {
  type: 'component';
  subComponents: ComponentNode[];
  actors: ActorNode[];
  useCaseDiagrams: UseCaseDiagramNode[];
  interfaces: InterfaceSpecification[];
}

export interface InterfaceSpecification {
  uuid: string;
  id: string;
  name: string;
  description?: string;
  type: 'kafka' | 'rest' | 'graphql' | 'other';
  /** Stored local functions. Inherited interfaces may keep this empty; read/lookup/render paths should resolve effective functions via the shared helper. */
  functions: InterfaceFunction[];
  /** UUID of the parent component's interface this interface inherits from. When set, functions are sourced from the parent interface. */
  parentInterfaceUuid?: string;
}

export interface InterfaceFunction {
  uuid: string;
  id: string;
  description?: string;
  parameters: Parameter[];
}

export interface Parameter {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface ActorNode extends BaseNode {
  type: 'actor';
}

export interface UseCaseNode extends BaseNode {
  type: 'use-case';
  sequenceDiagrams: SequenceDiagramNode[];
}

export interface DiagramNode extends BaseNode {
  content: string; // The text specification (mermaid or custom yaml)
  referencedNodeIds: string[]; // UUIDs of actors/components referenced in this diagram
  ownerComponentUuid: string; // UUID of the component that owns this diagram (for quick lookup)
}

export interface UseCaseDiagramNode extends DiagramNode {
  type: 'use-case-diagram';
  useCases: UseCaseNode[];
}

export interface SequenceDiagramNode extends DiagramNode {
  type: 'sequence-diagram';
  referencedFunctionUuids: string[];
}

export type Node = ComponentNode | ActorNode | UseCaseNode | UseCaseDiagramNode | SequenceDiagramNode;
