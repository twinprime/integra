import { useCallback, useEffect } from 'react'
import type { ComponentNode, DiagramNode } from '../store/types'
import { generateUseCaseMermaid } from '../parser/useCaseDiagram/mermaidGenerator'
import { useMermaidBase } from './useMermaidBase'

// Diagram types where Mermaid's native `click` directive is supported.
// When Mermaid adds sequence diagram support, add "sequence-diagram" here.
const CLICK_DIRECTIVE_TYPES = new Set(['use-case-diagram'])

export function useUseCaseDiagram(diagramNode: DiagramNode | null) {
    const buildContent = useCallback(
        (content: string, ownerComp: ComponentNode | null, root: ComponentNode) => {
            return generateUseCaseMermaid(content, ownerComp, root)
        },
        []
    )

    const { svg, error, errorDetails, mermaidSource, bindFunctionsRef, elementRef } =
        useMermaidBase(diagramNode, buildContent)

    // Bind Mermaid's native click handlers after SVG is injected into the DOM
    useEffect(() => {
        if (!svg || !elementRef.current) return
        if (CLICK_DIRECTIVE_TYPES.has(diagramNode?.type ?? '')) {
            bindFunctionsRef.current?.(elementRef.current)
        }
    }, [svg, diagramNode?.type, bindFunctionsRef, elementRef])

    return { svg, error, errorDetails, mermaidSource, elementRef }
}
