import { memo } from 'react'
import type React from 'react'
import { useSystemStore } from '../../store/useSystemStore'
import type { DiagramNode } from '../../store/types'
import { useSequenceDiagram } from '../../hooks/useSequenceDiagram'
import { DiagramErrorBanner } from './DiagramErrorBanner'
import { DiagramPanZoom } from './DiagramPanZoom'
import { SequenceLinkTooltip } from './SequenceLinkTooltip'

interface SequenceDiagramProps {
    diagramNode: DiagramNode
}

interface SequenceSvgPanelProps {
    svg: string
    mermaidSource: string
    elementRef: React.RefObject<HTMLDivElement>
    handleSequenceClick: (e: React.MouseEvent<HTMLDivElement>) => void
}

// Memoized to prevent re-renders from tooltip state changes, which would cause
// react-zoom-pan-pinch to re-render and disrupt its internal click handling.
const SequenceSvgPanel = memo(function SequenceSvgPanel({
    svg,
    mermaidSource,
    elementRef,
    handleSequenceClick,
}: SequenceSvgPanelProps) {
    return (
        <DiagramPanZoom contentKey={svg} mermaidSource={mermaidSource}>
            <div
                ref={elementRef}
                data-testid="diagram-svg-container"
                className="flex justify-center items-start pt-4"
                dangerouslySetInnerHTML={{ __html: svg }}
                onClick={handleSequenceClick}
            />
        </DiagramPanZoom>
    )
})

export const SequenceDiagram = ({ diagramNode }: SequenceDiagramProps) => {
    const parseError = useSystemStore((s) => s.parseError)
    const {
        svg,
        error,
        errorDetails,
        mermaidSource,
        elementRef,
        handleSequenceClick,
        tooltipInfo,
        tooltipPosition,
        handleSequenceMouseMove,
        handleSequenceMouseLeave,
    } = useSequenceDiagram(diagramNode)

    return (
        <div
            className="w-full h-full flex flex-col"
            onMouseMove={handleSequenceMouseMove}
            onMouseLeave={handleSequenceMouseLeave}
        >
            <DiagramErrorBanner error={parseError || error} details={parseError || errorDetails} />
            {svg ? (
                <SequenceSvgPanel
                    svg={svg}
                    mermaidSource={mermaidSource}
                    elementRef={elementRef}
                    handleSequenceClick={handleSequenceClick}
                />
            ) : error && mermaidSource ? (
                <pre className="flex-1 overflow-auto p-4 text-xs text-gray-300 bg-gray-900 rounded-lg whitespace-pre-wrap font-mono">
                    {mermaidSource}
                </pre>
            ) : (
                <div ref={elementRef} className="flex-1" style={{ minHeight: '100px' }} />
            )}
            <SequenceLinkTooltip info={tooltipInfo} position={tooltipPosition} />
        </div>
    )
}
