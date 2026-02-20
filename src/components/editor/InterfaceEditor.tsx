import { useEffect, useState } from "react"
import type { InterfaceSpecification, InterfaceFunction } from "../../store/types"
import { MarkdownEditor } from "./MarkdownEditor"
import { FunctionEditor } from "./FunctionEditor"

const INTERFACE_TYPES = ["rest", "graphql", "kafka", "other"] as const

export const InterfaceEditor = ({
  iface,
  referencedFunctionUuids,
  onInterfaceUpdate,
  onFunctionUpdate,
  onDeleteFunction,
  onParamDescriptionUpdate,
  contextComponentUuid,
}: {
  iface: InterfaceSpecification
  ifaceIdx: number
  referencedFunctionUuids: Set<string>
  onInterfaceUpdate: (updates: Partial<InterfaceSpecification>) => void
  onFunctionUpdate: (fnIdx: number, updates: Partial<InterfaceFunction>) => void
  onDeleteFunction: (fnIdx: number) => void
  onParamDescriptionUpdate: (fnIdx: number, paramIdx: number, desc: string) => void
  contextComponentUuid?: string
}) => {
  const [name, setName] = useState(iface.name)
  const [description, setDescription] = useState(iface.description || "")

  useEffect(() => {
    setName(iface.name)
    setDescription(iface.description || "")
  }, [iface.uuid, iface.name, iface.description])

  return (
    <div className="border border-gray-700 rounded-md bg-gray-900/50 p-3">
      <div className="flex items-center gap-2 mb-2">
        <input
          className="flex-1 p-1 text-sm font-medium text-gray-200 bg-transparent border border-transparent rounded hover:border-gray-600 focus:border-blue-400 focus:outline-none"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name !== iface.name && name.trim()) onInterfaceUpdate({ name: name.trim() })
          }}
        />
        <select
          className="text-xs text-gray-400 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 focus:outline-none focus:border-blue-400"
          value={iface.type}
          onChange={(e) => onInterfaceUpdate({ type: e.target.value as any })}
        >
          {INTERFACE_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <p className="text-xs text-gray-500 mb-2">
        ID: <span className="font-mono">{iface.id}</span>
      </p>
      <MarkdownEditor
        value={description}
        onChange={setDescription}
        onBlur={() => {
          if (description !== (iface.description || "")) onInterfaceUpdate({ description })
        }}
        height={80}
        placeholder="Description..."
        contextComponentUuid={contextComponentUuid}
      />

      {iface.functions && iface.functions.length > 0 && (
        <div className="space-y-2 mt-3">
          <p className="text-xs font-medium text-gray-400">
            Functions ({iface.functions.length})
          </p>
          {iface.functions.map((fn, fnIdx) => {
            const isUnreferenced = !referencedFunctionUuids.has(fn.uuid)
            return (
              <FunctionEditor
                key={fn.uuid || fn.id}
                fn={fn}
                fnIdx={fnIdx}
                isUnreferenced={isUnreferenced}
                onUpdate={(updates) => onFunctionUpdate(fnIdx, updates)}
                onDelete={() => onDeleteFunction(fnIdx)}
                onParamDescriptionUpdate={(paramIdx, desc) =>
                  onParamDescriptionUpdate(fnIdx, paramIdx, desc)
                }
                contextComponentUuid={contextComponentUuid}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
