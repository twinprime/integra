import { useEffect, useState } from "react"
import type { ComponentNode, InterfaceSpecification, InterfaceFunction } from "../../store/types"
import { useSystemStore } from "../../store/useSystemStore"
import { collectReferencedFunctionUuids } from "../../utils/nodeUtils"
import { MarkdownEditor } from "./MarkdownEditor"
import { InterfaceEditor } from "./InterfaceEditor"

export const ComponentEditor = ({
  node,
  onUpdate,
  contextComponentUuid,
}: {
  node: ComponentNode
  onUpdate: (updates: any) => void
  contextComponentUuid?: string
}) => {
  const [name, setName] = useState(node.name || "")
  const [description, setDescription] = useState(node.description || "")

  useEffect(() => {
    setName(node.name || "")
    setDescription(node.description || "")
  }, [node.uuid, node.name, node.description])

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

  const rootComponent = useSystemStore((state) => state.rootComponent)
  const referencedFunctionUuids = collectReferencedFunctionUuids(rootComponent)

  const handleInterfaceUpdate = (ifaceIdx: number, updates: Partial<InterfaceSpecification>) => {
    const newInterfaces = node.interfaces.map((iface, i) =>
      i === ifaceIdx ? { ...iface, ...updates } : iface
    )
    onUpdate({ interfaces: newInterfaces })
  }

  const handleFunctionUpdate = (ifaceIdx: number, fnIdx: number, updates: Partial<InterfaceFunction>) => {
    const newInterfaces = node.interfaces.map((iface, i) => {
      if (i !== ifaceIdx) return iface
      return {
        ...iface,
        functions: iface.functions.map((fn, j) =>
          j === fnIdx ? { ...fn, ...updates } : fn
        ),
      }
    })
    onUpdate({ interfaces: newInterfaces })
  }

  const handleDeleteFunction = (ifaceIdx: number, fnIdx: number) => {
    const newInterfaces = node.interfaces.map((iface, i) => {
      if (i !== ifaceIdx) return iface
      return {
        ...iface,
        functions: iface.functions.filter((_, j) => j !== fnIdx),
      }
    })
    onUpdate({ interfaces: newInterfaces })
  }

  const handleParamDescriptionUpdate = (
    ifaceIdx: number,
    fnIdx: number,
    paramIdx: number,
    description: string
  ) => {
    const newInterfaces = node.interfaces.map((iface, i) => {
      if (i !== ifaceIdx) return iface
      return {
        ...iface,
        functions: iface.functions.map((fn, j) => {
          if (j !== fnIdx) return fn
          return {
            ...fn,
            parameters: fn.parameters.map((p, k) =>
              k === paramIdx ? { ...p, description } : p
            ),
          }
        }),
      }
    })
    onUpdate({ interfaces: newInterfaces })
  }

  return (
    <div className="p-4 h-full flex flex-col overflow-y-auto">
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

      {node.interfaces && node.interfaces.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
            Interface Specifications
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full border border-gray-700">
              {node.interfaces.length}
            </span>
          </h3>
          <div className="space-y-4">
            {node.interfaces.map((iface, ifaceIdx) => (
              <InterfaceEditor
                key={iface.uuid || iface.id}
                iface={iface}
                ifaceIdx={ifaceIdx}
                referencedFunctionUuids={referencedFunctionUuids}
                onInterfaceUpdate={(updates) => handleInterfaceUpdate(ifaceIdx, updates)}
                onFunctionUpdate={(fnIdx, updates) => handleFunctionUpdate(ifaceIdx, fnIdx, updates)}
                onDeleteFunction={(fnIdx) => handleDeleteFunction(ifaceIdx, fnIdx)}
                onParamDescriptionUpdate={(fnIdx, paramIdx, desc) =>
                  handleParamDescriptionUpdate(ifaceIdx, fnIdx, paramIdx, desc)
                }
                contextComponentUuid={contextComponentUuid}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
