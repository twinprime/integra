import { z } from 'zod'
import type {
    ActorNode,
    ComponentNode,
    InheritedInterfaceSpecification,
    InterfaceFunction,
    InterfaceSpecification,
    LocalInterfaceSpecification,
    Parameter,
    SequenceDiagramNode,
    UseCaseDiagramNode,
    UseCaseNode,
} from './types'
import { asFunctionUuid, asInterfaceUuid } from './types'

const baseNodeFields = {
    uuid: z.string(),
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
}

const parameterSchema: z.ZodType<Parameter> = z.object({
    name: z.string(),
    type: z.string(),
    required: z.boolean(),
    description: z.string().optional(),
})

const interfaceFunctionSchema: z.ZodType<InterfaceFunction> = z.object({
    uuid: z.string().transform(asFunctionUuid),
    id: z.string(),
    description: z.string().optional(),
    parameters: z.array(parameterSchema).default([]),
})

const localInterfaceSchema = z.object({
    ...baseNodeFields,
    kind: z.literal('local').optional(),
    type: z.enum(['kafka', 'rest', 'graphql', 'other']),
    functions: z.array(interfaceFunctionSchema).default([]),
})

const inheritedInterfaceSchema = z.object({
    ...baseNodeFields,
    kind: z.literal('inherited').optional(),
    type: z.enum(['kafka', 'rest', 'graphql', 'other']),
    parentInterfaceUuid: z.string().transform(asInterfaceUuid),
    functions: z.array(interfaceFunctionSchema).optional(),
})

export const interfaceSpecificationSchema: z.ZodType<InterfaceSpecification> = z
    .union([inheritedInterfaceSchema, localInterfaceSchema])
    .transform((raw): InterfaceSpecification => {
        if ('parentInterfaceUuid' in raw && raw.parentInterfaceUuid !== undefined) {
            const inherited: InheritedInterfaceSpecification = {
                kind: 'inherited',
                uuid: asInterfaceUuid(raw.uuid),
                id: raw.id,
                name: raw.name,
                description: raw.description,
                type: raw.type,
                parentInterfaceUuid: raw.parentInterfaceUuid,
                functions: [],
            }
            return inherited
        }

        const local: LocalInterfaceSpecification = {
            kind: 'local',
            uuid: asInterfaceUuid(raw.uuid),
            id: raw.id,
            name: raw.name,
            description: raw.description,
            type: raw.type,
            functions: raw.functions ?? [],
        }
        return local
    })

const actorNodeSchema: z.ZodType<ActorNode> = z.object({
    ...baseNodeFields,
    type: z.literal('actor'),
})

const sequenceDiagramNodeSchema: z.ZodType<SequenceDiagramNode> = z.object({
    ...baseNodeFields,
    type: z.literal('sequence-diagram'),
    content: z.string().default(''),
    referencedNodeIds: z.array(z.string()).default([]),
    ownerComponentUuid: z.string().default(''),
    referencedFunctionUuids: z.array(z.string().transform(asFunctionUuid)).default([]),
})

const useCaseNodeSchema: z.ZodType<UseCaseNode> = z.lazy(() =>
    z.object({
        ...baseNodeFields,
        type: z.literal('use-case'),
        sequenceDiagrams: z.array(sequenceDiagramNodeSchema).default([]),
    })
)

const useCaseDiagramNodeSchema: z.ZodType<UseCaseDiagramNode> = z.lazy(() =>
    z.object({
        ...baseNodeFields,
        type: z.literal('use-case-diagram'),
        content: z.string().default(''),
        referencedNodeIds: z.array(z.string()).default([]),
        ownerComponentUuid: z.string().default(''),
        useCases: z.array(useCaseNodeSchema).default([]),
    })
)

export const componentNodeSchema: z.ZodType<ComponentNode> = z.lazy(() =>
    z.object({
        ...baseNodeFields,
        type: z.literal('component'),
        subComponents: z.array(componentNodeSchema).default([]),
        actors: z.array(actorNodeSchema).default([]),
        useCaseDiagrams: z.array(useCaseDiagramNodeSchema).default([]),
        interfaces: z.array(interfaceSpecificationSchema).default([]),
    })
)

export const persistedSystemStateSchema = z.object({
    rootComponent: componentNodeSchema,
    savedSnapshot: z.string().nullable().optional(),
})

export function parseComponentNode(input: unknown): ComponentNode {
    return componentNodeSchema.parse(input)
}

export function safeParseComponentNode(input: unknown) {
    return componentNodeSchema.safeParse(input)
}

export function safeParsePersistedSystemState(input: unknown) {
    return persistedSystemStateSchema.safeParse(input)
}
