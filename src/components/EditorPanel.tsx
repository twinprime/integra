import { useEffect, useState } from "react"
import { useSystemStore, findNode } from "../store/useSystemStore"
import type { Node, DiagramNode } from "../store/types"

const CommonEditor = ({
  node,
  onUpdate,
}: {
  node: Node
  onUpdate: (updates: any) => void
}) => {
  const [name, setName] = useState(node.name || "")
  const [description, setDescription] = useState(node.description || "")

  useEffect(() => {
    setName(node.name || "")
    setDescription(node.description || "")
  }, [node.id, node.name, node.description])

  const handleNameBlur = () => {
    if (name !== node.name && name.trim() !== "") {
      onUpdate({ name: name.trim() })
    } else if (name.trim() === "") {
      setName(node.name)
    }
  }

  const handleDescriptionBlur = () => {
    if (description !== node.description) {
      onUpdate({ description })
    }
  }

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="mb-6 border-b border-gray-800 pb-4">
        <h2 className="text-xl font-semibold text-gray-100 flex items-center gap-2">
          {node.name}
          <span className="text-xs font-normal text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full border border-gray-700">
            {node.type}
          </span>
        </h2>
        <p className="mt-1 text-sm text-gray-400">
          ID: <span className="font-mono text-gray-500">{node.id}</span>
        </p>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Name
        </label>
        <input
          className="w-full p-2 border border-gray-700 rounded-md text-sm text-gray-100 bg-gray-900 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleNameBlur}
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Description
        </label>
        <textarea
          className="w-full p-2 border border-gray-700 rounded-md text-sm text-gray-100 bg-gray-900 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={handleDescriptionBlur}
        />
      </div>
    </div>
  )
}

const DiagramEditor = ({
  node,
  onUpdate,
}: {
  node: DiagramNode
  onUpdate: (updates: any) => void
}) => {
  const [name, setName] = useState(node.name || "")
  const [content, setContent] = useState(node.content || "")

  useEffect(() => {
    setName(node.name || "")
    setContent(node.content || "")
  }, [node.id, node.name, node.content])

  const handleNameBlur = () => {
    if (name !== node.name && name.trim() !== "") {
      onUpdate({ name: name.trim() })
    } else if (name.trim() === "") {
      setName(node.name)
    }
  }

  const handleContentBlur = () => {
    if (content !== node.content) {
      onUpdate({ content })
    }
  }

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="mb-6 border-b border-gray-800 pb-4">
        <h2 className="text-xl font-semibold text-gray-100 flex items-center gap-2">
          {node.name}
        </h2>
        <p className="mt-1 text-sm text-gray-400">
          Usage:{" "}
          {node.type === "sequence-diagram"
            ? "Mermaid Sequence Syntax"
            : "Text / YAML"}
        </p>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Name
        </label>
        <input
          className="w-full p-2 border border-gray-700 rounded-md text-sm text-gray-100 bg-gray-900 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleNameBlur}
        />
      </div>

      <div className="mb-4 flex-1 flex flex-col">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Specification
        </label>
        <textarea
          className="w-full p-2 border border-gray-700 rounded-md text-[0.85rem] font-mono text-gray-100 resize-y min-h-[200px] flex-1 bg-gray-950 leading-relaxed focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onBlur={handleContentBlur}
          placeholder={
            node.type === "sequence-diagram"
              ? "participant Alice\nparticipant Bob\nAlice->>Bob: Hello"
              : 'actor "User" as user\nuse case "Login" as login\nuser --> login'
          }
        />
      </div>
    </div>
  )
}

export const EditorPanel = () => {
  const selectedNodeId = useSystemStore((state) => state.selectedNodeId)
  const system = useSystemStore((state) => state.system)
  const updateNode = useSystemStore((state) => state.updateNode)

  const selectedNode = selectedNodeId
    ? findNode([system], selectedNodeId)
    : null

  if (!selectedNode) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        Select a node from the explorer to edit
      </div>
    )
  }

  const handleUpdate = (updates: any) => {
    updateNode(selectedNode.id, updates)
  }

  if (
    selectedNode.type === "use-case-diagram" ||
    selectedNode.type === "sequence-diagram"
  ) {
    return (
      <DiagramEditor
        node={selectedNode as DiagramNode}
        onUpdate={handleUpdate}
      />
    )
  }

  return <CommonEditor node={selectedNode} onUpdate={handleUpdate} />
}
