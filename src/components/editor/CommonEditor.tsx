import { useState } from "react"
import type { Node } from "../../store/types"
import { MarkdownEditor } from "./MarkdownEditor"

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
        <MarkdownEditor
          value={description}
          onChange={setDescription}
          onBlur={handleDescriptionBlur}
          height={100}
          placeholder="Add a description..."
          contextComponentUuid={contextComponentUuid}
        />
      </div>
    </div>
  )
}
