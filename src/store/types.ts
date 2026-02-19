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
  useCases: UseCaseNode[];
  useCaseDiagrams: UseCaseDiagramNode[];
  sequenceDiagrams: SequenceDiagramNode[];
  interfaces: InterfaceSpecification[];
}

export interface InterfaceSpecification {
  id: string;
  name: string;
  type: 'kafka' | 'rest' | 'graphql' | 'other';
  interactions: Interaction[];
}

export interface Interaction {
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
}

export interface DiagramNode extends BaseNode {
  content: string; // The text specification (mermaid or custom yaml)
  referencedNodeIds: string[]; // IDs of actors/components referenced in this diagram
}

export interface UseCaseDiagramNode extends DiagramNode {
  type: 'use-case-diagram';
}

export interface SequenceDiagramNode extends DiagramNode {
  type: 'sequence-diagram';
}

export type Node = ComponentNode | ActorNode | UseCaseNode | UseCaseDiagramNode | SequenceDiagramNode;

