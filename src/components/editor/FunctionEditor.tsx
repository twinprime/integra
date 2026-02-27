import { useState } from "react"
import { Trash2, Link } from "lucide-react"
import type { InterfaceFunction } from "../../store/types"
import { MarkdownEditor } from "./MarkdownEditor"
import { useSystemStore, getSequenceDiagrams } from "../../store/useSystemStore"

export const FunctionEditor = ({
  fn,
  isUnreferenced,
  onUpdate,
  onDelete,
  onParamDescriptionUpdate,
  contextComponentUuid,
}: {
  fn: InterfaceFunction
  fnIdx: number
  isUnreferenced: boolean
  onUpdate: (updates: Partial<InterfaceFunction>) => void
  onDelete: () => void
  onParamDescriptionUpdate: (paramIdx: number, desc: string) => void
  contextComponentUuid?: string
}) => {
  const [fnId, setFnId] = useState(fn.id)
  const [fnDescription, setFnDescription] = useState(fn.description || "")
  const [showDiagrams, setShowDiagrams] = useState(false)

  const { rootComponent, selectNode } = useSystemStore()
  const referencingDiagrams = getSequenceDiagrams(rootComponent).filter((d) =>
    d.referencedFunctionUuids.includes(fn.uuid),
  )

  return (
    <div className="bg-gray-950 border border-gray-800 rounded p-2">
      <div className="flex items-center gap-2 mb-1">
        <input
          className={`text-sm font-mono flex-1 bg-transparent border-b border-transparent hover:border-gray-600 focus:border-blue-400 focus:outline-none ${isUnreferenced ? "line-through text-gray-500" : "text-blue-400"}`}
          value={fnId}
          onChange={(e) => setFnId(e.target.value)}
          onBlur={() => {
            if (fnId !== fn.id && fnId.trim()) onUpdate({ id: fnId.trim() })
          }}
        />
        {referencingDiagrams.length > 0 && (
          <button
            type="button"
            className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border transition-colors ${
              showDiagrams
                ? "bg-blue-900/40 border-blue-600 text-blue-300"
                : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-300"
            }`}
            title="Show referencing sequence diagrams"
            onClick={() => setShowDiagrams((v) => !v)}
          >
            <Link size={10} />
            <span>{referencingDiagrams.length}</span>
          </button>
        )}
        {isUnreferenced && (
          <button
            className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-900/20"
            title="Delete unreferenced function"
            onClick={onDelete}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
      {showDiagrams && (
        <div className="mb-2 rounded border border-blue-900/50 bg-blue-950/20 px-2 py-1.5">
          <p className="text-[0.65rem] font-medium text-gray-500 mb-1 uppercase tracking-wide">
            Referenced in
          </p>
          <ul className="space-y-0.5">
            {referencingDiagrams.map((d) => (
              <li key={d.uuid}>
                <button
                  type="button"
                  className="text-xs text-blue-400 hover:text-blue-300 hover:underline text-left w-full"
                  onClick={() => {
                    selectNode(d.uuid)
                    setShowDiagrams(false)
                  }}
                >
                  {d.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <MarkdownEditor
        value={fnDescription}
        onChange={setFnDescription}
        onBlur={() => {
          if (fnDescription !== (fn.description || "")) onUpdate({ description: fnDescription })
        }}
        height={70}
        placeholder="Function description..."
        contextComponentUuid={contextComponentUuid}
      />
      {fn.parameters && fn.parameters.length > 0 && (
        <div className="mt-1">
          <p className="text-xs font-medium text-gray-500 mb-1">Parameters:</p>
          <div className="space-y-1">
            {fn.parameters.map((param, idx) => (
              <div key={idx} className="text-xs font-mono text-gray-400">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-gray-300">{param.name}</span>
                  <span className="text-gray-600">:</span>
                  <span className="text-green-400">{param.type}</span>
                  {!param.required && (
                    <span className="text-yellow-500 text-[0.65rem]">optional</span>
                  )}
                  {param.required && (
                    <span className="text-red-400 text-[0.65rem]">required</span>
                  )}
                </div>
                <input
                  className="mt-0.5 w-full text-[0.7rem] text-gray-500 bg-transparent border-b border-transparent hover:border-gray-700 focus:border-gray-600 focus:outline-none placeholder-gray-700"
                  placeholder="Parameter description..."
                  defaultValue={param.description || ""}
                  onBlur={(e) => {
                    if (e.target.value !== (param.description || "")) {
                      onParamDescriptionUpdate(idx, e.target.value)
                    }
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
