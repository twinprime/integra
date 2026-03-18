import type { InterfaceSpecification } from '../store/types'

function toMermaidSafeId(value: string): string {
    return value.replace(/[^a-zA-Z0-9_]/g, '_')
}

export function getInterfaceDiagramNodeId(iface: Pick<InterfaceSpecification, 'uuid'>): string {
    return `iface_${toMermaidSafeId(iface.uuid)}`
}
