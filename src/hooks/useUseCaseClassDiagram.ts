import { useMermaidClassDiagram } from './useMermaidClassDiagram'
import { buildUseCaseClassDiagram } from '../utils/useCaseClassDiagram'
import type { UseCaseNode } from '../store/types'

export function useUseCaseClassDiagram(useCaseNode: UseCaseNode | null) {
    return useMermaidClassDiagram(buildUseCaseClassDiagram, useCaseNode, 'uc-class')
}
