import { useEffect, useState } from "react"
import type { DiagramNode } from "../../store/types"
import { useSystemStore, getSequenceDiagrams, type FunctionDecision } from "../../store/useSystemStore"
import { analyzeSequenceDiagramChanges, type FunctionMatch } from "../../utils/sequenceDiagramParser"
import { FunctionUpdateDialog } from "../FunctionUpdateDialog"

export const DiagramEditor = ({
  node,
  onUpdate,
}: {
  node: DiagramNode
  onUpdate: (updates: any) => void
}) => {
  const [name, setName] = useState(node.name || "")
  const [content, setContent] = useState(node.content || "")
  const [pendingContent, setPendingContent] = useState<string | null>(null)
  const [functionMatches, setFunctionMatches] = useState<FunctionMatch[]>([])

  const { rootComponent, applyFunctionUpdates } = useSystemStore()
  const seqDiagrams = getSequenceDiagrams(rootComponent)

  useEffect(() => {
    setName(node.name || "")
    setContent(node.content || "")
  }, [node.uuid, node.name, node.content])

  const handleNameBlur = () => {
    if (name !== node.name && name.trim() !== "") {
      onUpdate({ name: name.trim() })
    } else if (name.trim() === "") {
      setName(node.name)
    }
  }

  const handleContentBlur = () => {
    if (content === node.content) return

    if (node.type === "sequence-diagram") {
      const matches = analyzeSequenceDiagramChanges(
        content,
        rootComponent,
        node.uuid,
        seqDiagrams,
      )
      if (matches.length > 0) {
        setPendingContent(content)
        setFunctionMatches(matches)
        return
      }
    }

    onUpdate({ content })
  }

  const handleDialogResolve = (decisions: FunctionDecision[]): void => {
    const saved = pendingContent!
    setPendingContent(null)
    setFunctionMatches([])
    applyFunctionUpdates(decisions, node.uuid, saved)
  }

  const handleDialogCancel = (): void => {
    setContent(node.content || "")
    setPendingContent(null)
    setFunctionMatches([])
  }

  return (
    <div className="p-4 h-full flex flex-col">
      {pendingContent !== null && functionMatches.length > 0 && (
        <FunctionUpdateDialog
          matches={functionMatches}
          seqDiagrams={seqDiagrams}
          onResolve={handleDialogResolve}
          onCancel={handleDialogCancel}
        />
      )}
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
              ? 'actor "User" as user\ncomponent "Service" as service\nuser->>service: ExplorationsAPI:createExploration(id: number)'
              : 'actor "User" as user\nuse case "Login" as login\nuser --> login'
          }
        />
      </div>
    </div>
  )
}
