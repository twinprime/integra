import { useState } from "react"
import type { ComponentNode, InterfaceSpecification, InterfaceFunction } from "../../store/types"
import { useSystemStore } from "../../store/useSystemStore"
import { collectReferencedFunctionUuids, findReferencingDiagrams } from "../../utils/nodeUtils"
import { getNodeSiblingIds } from "../../nodes/nodeTree"
import { MarkdownEditor } from "./MarkdownEditor"
import { InterfaceEditor } from "./InterfaceEditor"
import { NodeReferencesButton } from "./NodeReferencesButton"
import { PanelTitleInput } from "./PanelTitleInput"
import { useInterfaceTabManager } from "./useInterfaceTabManager"
import { isLocalInterface, type ResolvedInterface } from "../../utils/interfaceFunctions"

type EditableInterfaceUpdates = Partial<Pick<InterfaceSpecification, "id" | "name" | "description" | "type">>

const ID_FORMAT = /^[a-zA-Z_][a-zA-Z0-9_]*$/

export const ComponentEditor = ({
  node,
  onUpdate,
  contextComponentUuid,
}: {
  node: ComponentNode
  onUpdate: (updates: Partial<ComponentNode>) => void
  contextComponentUuid?: string
}) => {
  const [name, setName] = useState(node.name || "")
  const [description, setDescription] = useState(node.description || "")
  const [localId, setLocalId] = useState(node.id)
  const [idError, setIdError] = useState<string | null>(null)

  const rootComponent = useSystemStore((state) => state.rootComponent)
  const renameNodeId = useSystemStore((s) => s.renameNodeId)
  const referencedFunctionUuids = collectReferencedFunctionUuids(rootComponent)
  const referencingDiagrams = findReferencingDiagrams(rootComponent, node.uuid)

  const {
    activeTabUuid,
    setActiveTabUuid,
    resolvedInterfaces,
    uninheritedParentInterfaces,
    handleInheritParentInterface,
  } = useInterfaceTabManager(node)

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
      setIdError("ID must start with a letter or _ and contain only letters, digits, or _")
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

  const handleInterfaceUpdate = (ifaceIdx: number, updates: EditableInterfaceUpdates) => {
    const newInterfaces = node.interfaces.map((iface, i) =>
      i === ifaceIdx
        ? (isLocalInterface(iface)
          ? { ...iface, ...updates, kind: "local" as const }
          : { ...iface, ...updates, kind: "inherited" as const, parentInterfaceUuid: iface.parentInterfaceUuid })
        : iface
    )
    onUpdate({ interfaces: newInterfaces })
  }

  const handleFunctionUpdate = (ifaceIdx: number, fnIdx: number, updates: Partial<InterfaceFunction>) => {
    const newInterfaces = node.interfaces.map((iface, i) => {
      if (i !== ifaceIdx) return iface
      if (!isLocalInterface(iface)) return iface
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
      if (!isLocalInterface(iface)) return iface
      return {
        ...iface,
        functions: iface.functions.filter((_, j) => j !== fnIdx),
      }
    })
    onUpdate({ interfaces: newInterfaces })
  }

  const handleDeleteInterface = (ifaceIdx: number) => {
    const removedUuid = node.interfaces[ifaceIdx]?.uuid
    const newInterfaces = node.interfaces.filter((_, i) => i !== ifaceIdx)
    onUpdate({ interfaces: newInterfaces })
    if (activeTabUuid === removedUuid) {
      setActiveTabUuid(newInterfaces[0]?.uuid ?? null)
    }
  }

  const handleParamDescriptionUpdate = (
    ifaceIdx: number,
    fnIdx: number,
    paramIdx: number,
    description: string
  ) => {
    const newInterfaces = node.interfaces.map((iface, i) => {
      if (i !== ifaceIdx) return iface
      if (!isLocalInterface(iface)) return iface
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
        <PanelTitleInput
          value={name}
          nodeType={node.type}
          onChange={setName}
          onBlur={handleNameBlur}
        />
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

      {/* Inherit parent interface selector — above tabs, visible even with no interfaces yet */}
      {uninheritedParentInterfaces.length > 0 && (
        <div className="flex items-center gap-1.5 mb-3">
          <span className="text-xs text-gray-500">Inherit parent interface:</span>
          <select
            className="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-gray-300 focus:outline-none focus:border-blue-400"
            value=""
            onChange={(e) => { if (e.target.value) handleInheritParentInterface(e.target.value, onUpdate) }}
            data-testid="inherit-parent-select"
          >
            <option value="" disabled>— select —</option>
            {uninheritedParentInterfaces.map((pi) => (
              <option key={pi.uuid} value={pi.uuid}>{pi.name || pi.id}</option>
            ))}
          </select>
        </div>
      )}

      {node.interfaces && node.interfaces.length > 0 && (
        <div className="mb-4 flex flex-col min-h-0">
          <h3 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2 flex-shrink-0">
            Interface Specifications
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full border border-gray-700">
              {node.interfaces.length}
            </span>
          </h3>

          {/* Tab bar — horizontally scrollable */}
          <div className="flex overflow-x-auto border-b border-gray-700 flex-shrink-0 scrollbar-thin scrollbar-thumb-gray-600">
            {resolvedInterfaces.map((iface) => {
              const isActive = iface.uuid === activeTabUuid
              const hasSubComponents = node.subComponents.length > 0
              const isInherited = node.subComponents.some((sub) =>
                sub.interfaces.some((si) => si.kind === "inherited" && si.parentInterfaceUuid === iface.uuid)
              )
              const showWarning = hasSubComponents && !isInherited
              return (
                <button
                  key={iface.uuid}
                  data-testid={`interface-tab-${iface.id}`}
                  onClick={() => setActiveTabUuid(iface.uuid)}
                  className={`flex-shrink-0 whitespace-nowrap px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                    isActive
                      ? "border-blue-400 text-blue-300"
                      : "border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500"
                  }`}
                >
                  {iface.name || iface.id}
                  {showWarning && (
                    <span
                      className="ml-1 text-amber-400"
                      title="No sub-component inherits this interface"
                      data-testid={`interface-tab-warning-${iface.id}`}
                    >⚠</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Active interface panel */}
          {resolvedInterfaces.map((iface: ResolvedInterface, ifaceIdx) =>
            iface.uuid === activeTabUuid ? (
              <div key={iface.uuid} data-testid="interface-tab-panel" className="mt-3">
                <InterfaceEditor
                  iface={iface}
                  ifaceIdx={ifaceIdx}
                  referencedFunctionUuids={referencedFunctionUuids}
                  siblingInterfaceIds={node.interfaces
                    .filter((_, i) => i !== ifaceIdx)
                    .map((i) => i.id)}
                  onInterfaceUpdate={(updates) => handleInterfaceUpdate(ifaceIdx, updates)}
                  onFunctionUpdate={(fnIdx, updates) => handleFunctionUpdate(ifaceIdx, fnIdx, updates)}
                  onDeleteFunction={(fnIdx) => handleDeleteFunction(ifaceIdx, fnIdx)}
                  onDeleteInterface={() => handleDeleteInterface(ifaceIdx)}
                  onParamDescriptionUpdate={(fnIdx, paramIdx, desc) =>
                    handleParamDescriptionUpdate(ifaceIdx, fnIdx, paramIdx, desc)
                  }
                  contextComponentUuid={contextComponentUuid}
                />
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  )
}
