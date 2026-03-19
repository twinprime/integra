import { useSystemStore } from '../../store/useSystemStore'
import type { ReactNode } from 'react'
import type { DiagramNode } from '../../store/types'
import { useUseCaseDiagram } from '../../hooks/useUseCaseDiagram'
import { DiagramErrorBanner } from './DiagramErrorBanner'
import { DiagramPanZoom } from './DiagramPanZoom'

interface UseCaseDiagramProps {
    diagramNode: DiagramNode
    toolbarContent?: ReactNode
}

export const UseCaseDiagram = ({ diagramNode, toolbarContent }: UseCaseDiagramProps) => {
    const parseError = useSystemStore((s) => s.parseError)
    const { svg, error, errorDetails, mermaidSource, elementRef } = useUseCaseDiagram(diagramNode)

    return (
        <div className="w-full h-full flex flex-col">
            <DiagramErrorBanner error={parseError || error} details={parseError || errorDetails} />
            {svg ? (
                <DiagramPanZoom
                    contentKey={svg}
                    mermaidSource={mermaidSource}
                    toolbarContent={toolbarContent}
                >
                    <div
                        ref={elementRef}
                        data-testid="diagram-svg-container"
                        className="flex justify-center items-start pt-4"
                        dangerouslySetInnerHTML={{ __html: svg }}
                    />
                </DiagramPanZoom>
            ) : error && mermaidSource ? (
                <pre className="flex-1 overflow-auto p-4 text-xs text-gray-300 bg-gray-900 rounded-lg whitespace-pre-wrap font-mono">
                    {mermaidSource}
                </pre>
            ) : (
                <div ref={elementRef} className="flex-1" style={{ minHeight: '100px' }} />
            )}
        </div>
    )
}
