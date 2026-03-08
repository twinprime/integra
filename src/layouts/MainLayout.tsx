import { useRef, useState, type ReactNode } from "react"
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from "react-resizable-panels"
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from "lucide-react"
import { useSystemStore } from "../store/useSystemStore"
import { findNode } from "../nodes/nodeTree"

interface MainLayoutProps {
  leftPanel: ReactNode
  rightPanel: ReactNode
  bottomPanel: ReactNode
}

export function MainLayout({
  leftPanel,
  rightPanel,
  bottomPanel,
}: MainLayoutProps) {
  const leftPanelRef = useRef<ImperativePanelHandle>(null)
  const rightPanelRef = useRef<ImperativePanelHandle>(null)
  const topPanelRef = useRef<ImperativePanelHandle>(null)
  const bottomPanelRef = useRef<ImperativePanelHandle>(null)

  type HLayout = "default" | "left-collapsed"
  type VLayout = "default" | "top-collapsed" | "bottom-collapsed"
  const [hLayout, setHLayout] = useState<HLayout>("default")
  const [vLayout, setVLayout] = useState<VLayout>("default")

  function handleExpandRight() {
    if (hLayout === "left-collapsed") {
      leftPanelRef.current?.expand()
      setHLayout("default")
    } else {
      leftPanelRef.current?.collapse()
      setHLayout("left-collapsed")
    }
  }

  function handleExpandTop() {
    if (vLayout === "bottom-collapsed") {
      bottomPanelRef.current?.expand()
      setVLayout("default")
    } else {
      bottomPanelRef.current?.collapse()
      setVLayout("bottom-collapsed")
    }
  }

  function handleExpandBottom() {
    if (vLayout === "top-collapsed") {
      topPanelRef.current?.expand()
      setVLayout("default")
    } else {
      topPanelRef.current?.collapse()
      setVLayout("top-collapsed")
    }
  }

  const selectedNodeId = useSystemStore((state) => state.selectedNodeId)
  const rootComponent = useSystemStore((state) => state.rootComponent)

  const selectedNode = selectedNodeId ? findNode([rootComponent], selectedNodeId) : null
  const hasDiagram =
    selectedNode?.type === "use-case-diagram" ||
    selectedNode?.type === "sequence-diagram" ||
    selectedNode?.type === "use-case" ||
    selectedNode?.type === "component"

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
            {leftPanel}
          </div>
        </Panel>

        <PanelResizeHandle className="relative w-2 bg-transparent hover:bg-blue-600 transition-colors flex flex-col items-center justify-center gap-1">
          <button
            onClick={handleExpandRight}
            className="z-10 flex items-center justify-center w-4 h-4 rounded bg-gray-700 hover:bg-blue-600 text-gray-300 hover:text-white transition-colors"
            title={hLayout === "left-collapsed" ? "Restore panels" : "Expand right panel"}
          >
            {hLayout === "left-collapsed" ? <ChevronRight size={10} /> : <ChevronLeft size={10} />}
          </button>
        </PanelResizeHandle>

        <Panel ref={rightPanelRef} defaultSize={80} minSize={30}>
          <PanelGroup direction="vertical">
            <Panel
              ref={topPanelRef}
              defaultSize={hasDiagram ? 60 : 100}
              minSize={20}
              collapsible
              className="bg-gray-900"
            >
              <div className="h-full flex flex-col">{rightPanel}</div>
            </Panel>

            {hasDiagram && (
              <>
                <PanelResizeHandle className="relative h-2 bg-gray-800 hover:bg-blue-600 transition-colors flex flex-row items-center justify-center gap-1">
                  {vLayout !== "bottom-collapsed" && (
                    <button
                      onClick={handleExpandBottom}
                      className="z-10 flex items-center justify-center w-4 h-4 rounded bg-gray-700 hover:bg-blue-600 text-gray-300 hover:text-white transition-colors"
                      title={vLayout === "top-collapsed" ? "Restore panels" : "Expand bottom panel"}
                    >
                      {vLayout === "top-collapsed" ? <ChevronDown size={10} /> : <ChevronUp size={10} />}
                    </button>
                  )}
                  {vLayout !== "top-collapsed" && (
                    <button
                      onClick={handleExpandTop}
                      className="z-10 flex items-center justify-center w-4 h-4 rounded bg-gray-700 hover:bg-blue-600 text-gray-300 hover:text-white transition-colors"
                      title={vLayout === "bottom-collapsed" ? "Restore panels" : "Expand top panel"}
                    >
                      {vLayout === "bottom-collapsed" ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                    </button>
                  )}
                </PanelResizeHandle>

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
                      {bottomPanel}
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
