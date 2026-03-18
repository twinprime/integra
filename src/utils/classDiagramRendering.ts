import type { ComponentNode, InterfaceSpecification } from '../store/types'
import { resolveEffectiveInterfaceFunctions } from './interfaceFunctions'

export type DiagramParticipant = {
    nodeId: string
    name: string
    kind: 'actor' | 'component'
}

export function emitParticipantClass(participant: DiagramParticipant, lines: string[]): void {
    if (participant.kind === 'actor') {
        lines.push(`    class ${participant.nodeId}["${participant.name}"]:::actor {`)
        lines.push(`        <<actor>>`)
        lines.push(`    }`)
        return
    }

    lines.push(`    class ${participant.nodeId}["${participant.name}"]`)
}

export function emitInterfaceClass(
    iface: InterfaceSpecification,
    ownerComponent: ComponentNode,
    rootComponent: ComponentNode,
    lines: string[],
    interfaceNodeId: string,
    calledFunctionIds?: Set<string>
): void {
    lines.push(`    class ${interfaceNodeId}["${iface.name}"] {`)
    lines.push(`        <<interface>>`)
    const effectiveFunctions = resolveEffectiveInterfaceFunctions(
        iface,
        ownerComponent,
        rootComponent
    )
    const fns = calledFunctionIds
        ? effectiveFunctions.filter((fn) => calledFunctionIds.has(fn.id))
        : effectiveFunctions

    for (const fn of fns) {
        const params = fn.parameters
            .map((p) => `${p.name}: ${p.type}${p.required ? '' : '?'}`)
            .join(', ')
        lines.push(`        +${fn.id}(${params})`)
    }

    lines.push(`    }`)
}
