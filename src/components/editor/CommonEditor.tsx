import { useState } from "react"
import type { Node } from "../../store/types"
import { useSystemStore } from "../../store/useSystemStore"
import { getNodeSiblingIds } from "../../nodes/nodeTree"
import { findReferencingDiagrams } from "../../utils/nodeUtils"
import { MarkdownEditor } from "./MarkdownEditor"
import { NodeReferencesButton } from "./NodeReferencesButton"

const ID_FORMAT = /^[a-zA-Z_][a-zA-Z0-9_-]*$/

export const CommonEditor = ({
  node,
  onUpdate,
  contextComponentUuid,
}: {
  node: Node
  onUpdate: (updates: Partial<Node>) => void
  contextComponentUuid?: string
}) => {
  const [name, setName] = useState(node.name || "")
  const [description, setDescription] = useState(node.description || "")
  const [localId, setLocalId] = useState(node.id)
  const [idError, setIdError] = useState<string | null>(null)

  const rootComponent = useSystemStore((s) => s.rootComponent)
  const renameNodeId = useSystemStore((s) => s.renameNodeId)
  const referencingDiagrams = findReferencingDiagrams(rootComponent, node.uuid)

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

  const handleIdChange = (value: string) => {
    setLocalId(value)
    if (!value) {
      setIdError("ID cannot be empty")
    } else if (!ID_FORMAT.test(value)) {
      setIdError("ID must start with a letter or _ and contain only letters, digits, _ or -")
    } else {
      setIdError(null)
    }
  }

  const handleIdBlur = () => {
    const trimmed = localId.trim()
    if (!trimmed || idError || trimmed === node.id) {
      setLocalId(node.id)
      setIdError(null)
      return
    }
    const siblings = getNodeSiblingIds(rootComponent, node.uuid)
    if (siblings.includes(trimmed)) {
      setIdError(`ID "${trimmed}" is already used by a sibling node`)
      return
    }
    renameNodeId(node.uuid, trimmed)
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
        <div className="mt-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-gray-400">ID:</span>
            <input
              className={`font-mono text-sm bg-transparent border-b focus:outline-none w-40 ${
                idError
                  ? "border-red-500 text-red-400"
                  : "border-transparent text-gray-400 hover:border-gray-600 focus:border-blue-400"
              }`}
              value={localId}
              onChange={(e) => handleIdChange(e.target.value)}
              onBlur={handleIdBlur}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }}
              aria-label="Node ID"
            />
            <NodeReferencesButton refs={referencingDiagrams} />
          </div>
          {idError && <p className="text-xs text-red-400 mt-0.5">{idError}</p>}
        </div>
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

      <div className="flex-1 flex flex-col min-h-0">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Description
        </label>
        <MarkdownEditor
          value={description}
          onChange={setDescription}
          onBlur={handleDescriptionBlur}
          height="100%"
          className="flex-1 min-h-0"
          placeholder="Add a description..."
          contextComponentUuid={contextComponentUuid}
        />
      </div>
    </div>
  )
}
