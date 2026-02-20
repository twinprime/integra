import { useEffect, useState } from "react"
import { Trash2 } from "lucide-react"
import type { InterfaceFunction } from "../../store/types"
import { MarkdownEditor } from "./MarkdownEditor"

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

  useEffect(() => {
    setFnId(fn.id)
    setFnDescription(fn.description || "")
  }, [fn.uuid, fn.id, fn.description])

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
