import { useSystemStore } from './store/useSystemStore'
import { findNode } from './utils/nodeUtils'
import type { ComponentNode } from './types'

function TreeNode({ node, depth = 0 }: { node: ComponentNode; depth?: number }) {
  const { selectedNodeUuid, selectNode } = useSystemStore()
  const isSelected = node.uuid === selectedNodeUuid

  return (
    <div>
      <div
        style={{ paddingLeft: depth * 16, cursor: 'pointer', background: isSelected ? '#ddd' : 'transparent' }}
        onClick={() => selectNode(node.uuid)}
      >
        {node.name} ({node.id})
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

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ width: 250, borderRight: '1px solid #ccc', overflow: 'auto', padding: 8 }}>
        <TreeNode node={root} />
        <button onClick={() => addChild(selectedNodeUuid || root.uuid, {
          uuid: crypto.randomUUID(),
          id: 'comp' + Date.now(),
          name: 'New Component',
          type: 'component',
          interfaces: [],
          useCases: [],
          diagramSpec: '',
          diagramType: 'sequence-diagram',
        })}>+ Add Component</button>
      </div>
      <div style={{ flex: 1, padding: 8 }}>
        {selectedNode && (
          <textarea
            value={selectedNode.diagramSpec}
            onChange={e => updateNode(selectedNode.uuid, { diagramSpec: e.target.value })}
            style={{ width: '100%', height: 300 }}
          />
        )}
      </div>
    </div>
  )
}
