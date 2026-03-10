import { useState } from "react"
import { Trash2 } from "lucide-react"
import type { InterfaceFunction } from "../../store/types"
import { MarkdownEditor } from "./MarkdownEditor"
import { useSystemStore, getSequenceDiagrams } from "../../store/useSystemStore"
import { NodeReferencesButton } from "./NodeReferencesButton"

const ID_FORMAT = /^[a-zA-Z_][a-zA-Z0-9_-]*$/

export const FunctionEditor = ({
  fn,
  isUnreferenced,
  siblingFunctionIds,
  onUpdate,
  onDelete,
  onParamDescriptionUpdate,
  contextComponentUuid,
  readOnly = false,
}: {
  fn: InterfaceFunction
  fnIdx: number
  isUnreferenced: boolean
  siblingFunctionIds: string[]
  onUpdate: (updates: Partial<InterfaceFunction>) => void
  onDelete: () => void
  onParamDescriptionUpdate: (paramIdx: number, desc: string) => void
  contextComponentUuid?: string
  readOnly?: boolean
}) => {
  const [fnId, setFnId] = useState(fn.id)
  const [idError, setIdError] = useState<string | null>(null)
  const [fnDescription, setFnDescription] = useState(fn.description || "")

  const { rootComponent, renameNodeId } = useSystemStore()
  const referencingDiagrams = getSequenceDiagrams(rootComponent).filter((d) =>
    d.referencedFunctionUuids.includes(fn.uuid),
  )

  const handleIdChange = (value: string) => {
    setFnId(value)
    if (!value) {
      setIdError("ID cannot be empty")
    } else if (!ID_FORMAT.test(value)) {
      setIdError("ID must start with a letter or _ and contain only letters, digits, _ or -")
    } else {
      setIdError(null)
    }
  }

  const handleIdBlur = () => {
    const trimmed = fnId.trim()
    if (!trimmed || idError || trimmed === fn.id) {
      setFnId(fn.id)
      setIdError(null)
      return
    }
    if (siblingFunctionIds.includes(trimmed)) {
      setIdError(`ID "${trimmed}" is already used by another function`)
      return
    }
    renameNodeId(fn.uuid, trimmed)
  }

  return (
    <div className="bg-gray-950 border border-gray-800 rounded p-2">
      <div className="flex items-start gap-2 mb-1">
        <div className="flex-1 min-w-0">
          {readOnly ? (
            <span className="text-sm font-mono text-blue-400 select-text">{fn.id}</span>
          ) : (
            <>
              <input
                className={`text-sm font-mono w-full bg-transparent border-b focus:outline-none ${
                  idError
                    ? "border-red-500 text-red-400"
                    : isUnreferenced
                      ? "line-through text-gray-500 border-transparent hover:border-gray-600 focus:border-blue-400"
                      : "text-blue-400 border-transparent hover:border-gray-600 focus:border-blue-400"
                }`}
                value={fnId}
                onChange={(e) => handleIdChange(e.target.value)}
                onBlur={handleIdBlur}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }}
                aria-label="Function ID"
              />
              {idError && <p className="text-xs text-red-400 mt-0.5">{idError}</p>}
            </>
          )}
        </div>
        <NodeReferencesButton
          refs={referencingDiagrams}
          title="Show referencing sequence diagrams"
        />
        {!readOnly && isUnreferenced && (
          <button
            className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-900/20"
            title="Delete unreferenced function"
            onClick={onDelete}
            data-testid="fn-delete-btn"
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
