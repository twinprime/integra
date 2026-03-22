import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
    Panel,
    PanelGroup,
    PanelResizeHandle,
    type ImperativePanelHandle,
} from 'react-resizable-panels'
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react'
import { useSystemStore } from '../store/useSystemStore'
import { findNode } from '../nodes/nodeTree'
import { ErrorBoundary } from '../components/ErrorBoundary'

type HLayout = 'default' | 'left-collapsed'
type VLayout = 'default' | 'top-collapsed' | 'bottom-collapsed'

interface MainLayoutProps {
    leftPanel: ReactNode
    rightPanel: ReactNode
    bottomPanel: ReactNode
}

function hasVisualizationPanel(node: ReturnType<typeof findNode>): boolean {
    return (
        node?.type === 'use-case-diagram' ||
        node?.type === 'sequence-diagram' ||
        node?.type === 'use-case' ||
        node?.type === 'component'
    )
}

function getPreferredTopPanelSize(
    selectedNode: ReturnType<typeof findNode>,
    readOnly: boolean,
    hasVisibleDescription: boolean
) {
    const hasDiagram = hasVisualizationPanel(selectedNode)
    if (!hasDiagram) return 100
    if (!readOnly) {
        if (selectedNode?.type === 'use-case') return 30
        if (selectedNode?.type === 'component') {
            return selectedNode.interfaces.length > 0 ? 45 : 30
        }
        return 60
    }
    return hasVisibleDescription ? 30 : 18
}

type HorizontalResizeHandleProps = {
    hLayout: HLayout
    onToggle: () => void
}

function HorizontalResizeHandle({ hLayout, onToggle }: HorizontalResizeHandleProps) {
    return (
        <PanelResizeHandle className="relative w-2 bg-transparent hover:bg-blue-600 transition-colors flex flex-col items-center justify-center gap-1">
            <button
                onClick={onToggle}
                className="z-10 flex items-center justify-center w-4 h-4 rounded bg-gray-700 hover:bg-blue-600 text-gray-300 hover:text-white transition-colors"
                title={hLayout === 'left-collapsed' ? 'Restore panels' : 'Expand right panel'}
            >
                {hLayout === 'left-collapsed' ? (
                    <ChevronRight size={10} />
                ) : (
                    <ChevronLeft size={10} />
                )}
            </button>
        </PanelResizeHandle>
    )
}

type VerticalResizeHandleProps = {
    vLayout: VLayout
    onExpandBottom: () => void
    onExpandTop: () => void
}

function VerticalResizeHandle({ vLayout, onExpandBottom, onExpandTop }: VerticalResizeHandleProps) {
    return (
        <PanelResizeHandle className="relative h-2 bg-gray-800 hover:bg-blue-600 transition-colors flex flex-row items-center justify-center gap-1">
            {vLayout !== 'bottom-collapsed' && (
                <button
                    onClick={onExpandBottom}
                    className="z-10 flex items-center justify-center w-4 h-4 rounded bg-gray-700 hover:bg-blue-600 text-gray-300 hover:text-white transition-colors"
                    title={vLayout === 'top-collapsed' ? 'Restore panels' : 'Expand bottom panel'}
                >
                    {vLayout === 'top-collapsed' ? (
                        <ChevronDown size={10} />
                    ) : (
                        <ChevronUp size={10} />
                    )}
                </button>
            )}
            {vLayout !== 'top-collapsed' && (
                <button
                    onClick={onExpandTop}
                    className="z-10 flex items-center justify-center w-4 h-4 rounded bg-gray-700 hover:bg-blue-600 text-gray-300 hover:text-white transition-colors"
                    title={vLayout === 'bottom-collapsed' ? 'Restore panels' : 'Expand top panel'}
                >
                    {vLayout === 'bottom-collapsed' ? (
                        <ChevronUp size={10} />
                    ) : (
                        <ChevronDown size={10} />
                    )}
                </button>
            )}
        </PanelResizeHandle>
    )
}

export function MainLayout({ leftPanel, rightPanel, bottomPanel }: MainLayoutProps) {
    const leftPanelRef = useRef<ImperativePanelHandle>(null)
    const rightPanelRef = useRef<ImperativePanelHandle>(null)
    const topPanelRef = useRef<ImperativePanelHandle>(null)
    const bottomPanelRef = useRef<ImperativePanelHandle>(null)

    const [hLayout, setHLayout] = useState<HLayout>('default')
    const [vLayout, setVLayout] = useState<VLayout>('default')

    function handleExpandRight() {
        if (hLayout === 'left-collapsed') {
            leftPanelRef.current?.expand()
            setHLayout('default')
        } else {
            leftPanelRef.current?.collapse()
            setHLayout('left-collapsed')
        }
    }

    function handleExpandTop() {
        if (vLayout === 'bottom-collapsed') {
            bottomPanelRef.current?.expand()
            setVLayout('default')
        } else {
            bottomPanelRef.current?.collapse()
            setVLayout('bottom-collapsed')
        }
    }

    function handleExpandBottom() {
        if (vLayout === 'top-collapsed') {
            topPanelRef.current?.expand()
            setVLayout('default')
        } else {
            topPanelRef.current?.collapse()
            setVLayout('top-collapsed')
        }
    }

    const selectedNodeId = useSystemStore((state) => state.selectedNodeId)
    const rootComponent = useSystemStore((state) => state.rootComponent)
    const readOnly = useSystemStore((state) => state.uiMode === 'browse')

    const selectedNode = selectedNodeId ? findNode([rootComponent], selectedNodeId) : null
    const hasDiagram = hasVisualizationPanel(selectedNode)
    const hasVisibleDescription = !!selectedNode?.description?.trim() || !readOnly
    const preferredTopPanelSize = getPreferredTopPanelSize(
        selectedNode,
        readOnly,
        hasVisibleDescription
    )

    useEffect(() => {
        if (!hasDiagram) return
        topPanelRef.current?.resize(preferredTopPanelSize)
    }, [hasDiagram, preferredTopPanelSize, selectedNodeId, readOnly])

    return (
        <div className="h-screen w-screen bg-gray-950 text-gray-100 font-sans overflow-hidden">
            <PanelGroup direction="horizontal">
                <Panel
                    ref={leftPanelRef}
                    defaultSize={20}
                    minSize={15}
                    collapsible
                    className="bg-gray-900 border-r border-gray-800"
                >
                    <div className="h-full flex flex-col">
                        <ErrorBoundary label="Tree">{leftPanel}</ErrorBoundary>
                    </div>
                </Panel>

                <HorizontalResizeHandle hLayout={hLayout} onToggle={handleExpandRight} />

                <Panel ref={rightPanelRef} defaultSize={80} minSize={30}>
                    <PanelGroup direction="vertical">
                        <Panel
                            ref={topPanelRef}
                            defaultSize={preferredTopPanelSize}
                            minSize={readOnly && hasDiagram ? 12 : 20}
                            collapsible
                            className="bg-gray-900"
                        >
                            <div className="h-full flex flex-col">
                                <ErrorBoundary label="Editor">{rightPanel}</ErrorBoundary>
                            </div>
                        </Panel>

                        {hasDiagram && (
                            <>
                                <VerticalResizeHandle
                                    vLayout={vLayout}
                                    onExpandBottom={handleExpandBottom}
                                    onExpandTop={handleExpandTop}
                                />

                                <Panel
                                    ref={bottomPanelRef}
                                    defaultSize={40}
                                    minSize={20}
                                    collapsible
                                    className="bg-gray-900 border-t border-gray-800"
                                >
                                    <div className="h-full flex flex-col">
                                        <div className="px-4 py-2 border-b border-gray-800 font-medium text-gray-400 text-sm bg-gray-800/50">
                                            Visualization
                                        </div>
                                        <div className="flex-1 overflow-auto p-4 bg-gray-900/30">
                                            <ErrorBoundary label="Diagram">
                                                {bottomPanel}
                                            </ErrorBoundary>
                                        </div>
                                    </div>
                                </Panel>
                            </>
                        )}
                    </PanelGroup>
                </Panel>
            </PanelGroup>
        </div>
    )
}
