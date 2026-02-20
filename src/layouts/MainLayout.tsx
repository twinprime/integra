import type { ReactNode } from "react"
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"
import { useSystemStore, findNode } from "../store/useSystemStore"

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
  const selectedNodeId = useSystemStore((state) => state.selectedNodeId)
  const rootComponent = useSystemStore((state) => state.rootComponent)

  const selectedNode = selectedNodeId ? findNode([rootComponent], selectedNodeId) : null
  const hasDiagram =
    selectedNode?.type === "use-case-diagram" ||
    selectedNode?.type === "sequence-diagram"

  return (
    <div className="h-screen w-screen bg-gray-950 text-gray-100 font-sans overflow-hidden">
      <PanelGroup direction="horizontal">
        <Panel
          defaultSize={20}
          minSize={15}
          className="bg-gray-900 border-r border-gray-800"
        >
          <div className="h-full flex flex-col">
            {leftPanel}
          </div>
        </Panel>

        <PanelResizeHandle className="w-1 bg-transparent hover:bg-blue-600 transition-colors" />

        <Panel defaultSize={80} minSize={30}>
          <PanelGroup direction="vertical">
            <Panel
              defaultSize={hasDiagram ? 60 : 100}
              minSize={20}
              className="bg-gray-900"
            >
              <div className="h-full flex flex-col">{rightPanel}</div>
            </Panel>

            {hasDiagram && (
              <>
                <PanelResizeHandle className="h-1 bg-gray-800 hover:bg-blue-600 transition-colors" />

                <Panel
                  defaultSize={40}
                  minSize={20}
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
