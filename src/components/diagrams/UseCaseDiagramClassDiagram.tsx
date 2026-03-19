import type { ReactNode } from 'react'
import type { UseCaseDiagramNode } from '../../store/types'
import { useUseCaseDiagramClassDiagram } from '../../hooks/useUseCaseDiagramClassDiagram'
import { ClassDiagramCanvas } from './ClassDiagramCanvas'
import { DependencySourceDialog } from './DependencySourceDialog'
import { DiagramErrorBanner } from './DiagramErrorBanner'

interface UseCaseDiagramClassDiagramProps {
    useCaseDiagramNode: UseCaseDiagramNode
    toolbarContent?: ReactNode
}

export const UseCaseDiagramClassDiagram = ({
    useCaseDiagramNode,
    toolbarContent,
}: UseCaseDiagramClassDiagramProps) => {
    const {
        svg,
        error,
        mermaidSource,
        elementRef,
        handleDiagramClick,
        handleDiagramMouseMove,
        handleDiagramMouseLeave,
        activeRelationship,
        activePopupPosition,
        isPopupPinned,
        clearActiveSequenceDiagrams,
        selectSequenceDiagram,
        handlePopupMouseEnter,
        handlePopupMouseLeave,
    } = useUseCaseDiagramClassDiagram(useCaseDiagramNode)

    if (!useCaseDiagramNode.useCases.some((useCase) => useCase.sequenceDiagrams.length > 0)) {
        return (
            <div className="h-full flex items-center justify-center text-gray-500">
                No sequence diagrams defined for this use case diagram
            </div>
        )
    }

    return (
        <div className="w-full h-full flex flex-col">
            <DiagramErrorBanner error={error} details={error} />
            {svg ? (
                <ClassDiagramCanvas
                    svg={svg}
                    elementRef={elementRef}
                    handleDiagramClick={handleDiagramClick}
                    handleDiagramMouseMove={handleDiagramMouseMove}
                    handleDiagramMouseLeave={handleDiagramMouseLeave}
                    mermaidSource={mermaidSource}
                    toolbarContent={toolbarContent}
                />
            ) : error && mermaidSource ? (
                <pre className="flex-1 overflow-auto p-4 text-xs text-gray-300 bg-gray-900 rounded-lg whitespace-pre-wrap font-mono">
                    {mermaidSource}
                </pre>
            ) : (
                <div ref={elementRef} className="flex-1" style={{ minHeight: '100px' }} />
            )}
            <DependencySourceDialog
                relationship={activeRelationship}
                position={activePopupPosition}
                pinned={isPopupPinned}
                onClose={clearActiveSequenceDiagrams}
                onSelect={selectSequenceDiagram}
                onMouseEnter={handlePopupMouseEnter}
                onMouseLeave={handlePopupMouseLeave}
            />
        </div>
    )
}
