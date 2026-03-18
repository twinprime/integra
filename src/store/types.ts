export type NodeType =
    | 'component'
    | 'actor'
    | 'use-case'
    | 'sequence-diagram'
    | 'use-case-diagram'
    | 'folder'

type Brand<T, Name extends string> = T & { readonly __brand: Name }

export type InterfaceUuid = Brand<string, 'InterfaceUuid'>
export type FunctionUuid = Brand<string, 'FunctionUuid'>

export const asInterfaceUuid = (value: string): InterfaceUuid => value as InterfaceUuid
export const asFunctionUuid = (value: string): FunctionUuid => value as FunctionUuid
export const newInterfaceUuid = (): InterfaceUuid => asInterfaceUuid(crypto.randomUUID())
export const newFunctionUuid = (): FunctionUuid => asFunctionUuid(crypto.randomUUID())

export interface BaseNode {
    readonly uuid: string // Globally unique identifier
    readonly id: string // ID used in specification
    readonly name: string
    readonly type: NodeType
    readonly description?: string
}

export interface ComponentNode extends BaseNode {
    readonly type: 'component'
    readonly subComponents: ReadonlyArray<ComponentNode>
    readonly actors: ReadonlyArray<ActorNode>
    readonly useCaseDiagrams: ReadonlyArray<UseCaseDiagramNode>
    readonly interfaces: ReadonlyArray<InterfaceSpecification>
}

export type InterfaceKind = 'local' | 'inherited'
export type InterfaceType = 'kafka' | 'rest' | 'graphql' | 'other'

interface InterfaceSpecificationBase {
    readonly uuid: string
    readonly id: string
    readonly name: string
    readonly description?: string
    readonly type: InterfaceType
}

export interface LocalInterfaceSpecification extends InterfaceSpecificationBase {
    readonly kind?: 'local'
    readonly functions: ReadonlyArray<InterfaceFunction>
    readonly parentInterfaceUuid?: never
}

export interface InheritedInterfaceSpecification extends InterfaceSpecificationBase {
    readonly kind?: 'inherited'
    readonly parentInterfaceUuid: string
    readonly functions: ReadonlyArray<InterfaceFunction>
}

export type InterfaceSpecification = LocalInterfaceSpecification | InheritedInterfaceSpecification

export interface InterfaceFunction {
    readonly uuid: string
    readonly id: string
    readonly description?: string
    readonly parameters: ReadonlyArray<Parameter>
}

export interface Parameter {
    readonly name: string
    readonly type: string
    readonly required: boolean
    readonly description?: string
}

export interface ActorNode extends BaseNode {
    readonly type: 'actor'
}

export interface UseCaseNode extends BaseNode {
    readonly type: 'use-case'
    readonly sequenceDiagrams: ReadonlyArray<SequenceDiagramNode>
}

export interface DiagramNode extends BaseNode {
    readonly content: string // The text specification (mermaid or custom yaml)
    readonly referencedNodeIds: ReadonlyArray<string> // UUIDs of actors/components referenced in this diagram
    readonly ownerComponentUuid: string // UUID of the component that owns this diagram (for quick lookup)
}

export interface UseCaseDiagramNode extends DiagramNode {
    readonly type: 'use-case-diagram'
    readonly useCases: ReadonlyArray<UseCaseNode>
}

export interface SequenceDiagramNode extends DiagramNode {
    readonly type: 'sequence-diagram'
    readonly referencedFunctionUuids: ReadonlyArray<string>
}

export type Node =
    | ComponentNode
    | ActorNode
    | UseCaseNode
    | UseCaseDiagramNode
    | SequenceDiagramNode
