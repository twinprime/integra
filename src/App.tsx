import { useSystemStore } from './store/useSystemStore'
import { findNode, findNearestComponentAncestor } from './utils/nodeUtils'
import type { ComponentNode } from './types'
import { DiagramEditor } from './components/editor/DiagramEditor'
import { DiagramPanel } from './components/editor/DiagramPanel'

function TreeNode({ node, depth = 0 }: { node: ComponentNode; depth?: number }) {
  const { selectedNodeUuid, selectNode } = useSystemStore()
  const isSelected = node.uuid === selectedNodeUuid

  return (
    <div>
      <div
        style={{
          paddingLeft: depth * 16,
          cursor: 'pointer',
          padding: '2px 4px 2px ' + (4 + depth * 16) + 'px',
          background: isSelected ? '#094771' : 'transparent',
          color: isSelected ? '#fff' : '#ccc',
          borderRadius: 3,
          fontSize: 13,
        }}
        onClick={() => selectNode(node.uuid)}
      >
        {node.name}
      </div>
      {node.children.map(child => (
        <TreeNode key={child.uuid} node={child} depth={depth + 1} />
      ))}
    </div>
  )
}

export default function App() {
  const { root, selectedNodeUuid, updateNode, addChild } = useSystemStore()
  const selectedNode = selectedNodeUuid ? findNode(root, selectedNodeUuid) : null
  const ownerComp = selectedNode
    ? findNearestComponentAncestor(root, selectedNode.uuid)
    : null

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#1e1e1e', color: '#d4d4d4' }}>
      {/* Sidebar */}
      <div style={{ width: 220, borderRight: '1px solid #333', overflow: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontWeight: 'bold', marginBottom: 8, fontSize: 13 }}>Components</div>
        <TreeNode node={root} />
        <button
          onClick={() => addChild(selectedNodeUuid || root.uuid, {
            uuid: crypto.randomUUID(),
            id: 'comp' + Date.now(),
            name: 'New Component',
            type: 'component',
            interfaces: [],
            useCases: [],
            diagramSpec: '',
            diagramType: 'sequence-diagram',
          })}
          style={{ marginTop: 8, padding: '4px 8px', background: '#333', color: '#ccc', border: '1px solid #555', borderRadius: 3, cursor: 'pointer', fontSize: 12 }}
        >
          + Add Component
        </button>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selectedNode ? (
          <>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #333', fontSize: 13 }}>
              <strong>{selectedNode.name}</strong>
              <span style={{ marginLeft: 8, color: '#888', fontSize: 11 }}>({selectedNode.id})</span>
            </div>
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              {/* Editor pane */}
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden', borderRight: '1px solid #333' }}>
                <DiagramEditor
                  node={selectedNode}
                  ownerComp={ownerComp}
                  rootComponent={root}
                  onChange={spec => updateNode(selectedNode.uuid, { diagramSpec: spec })}
                />
              </div>
              {/* Preview pane */}
              <div style={{ flex: 1, overflow: 'auto', background: '#fff' }}>
                <DiagramPanel node={selectedNode} />
              </div>
            </div>
          </>
        ) : (
          <div style={{ padding: 16, color: '#888' }}>Select a component to edit its diagram</div>
        )}
      </div>
    </div>
  )
}
