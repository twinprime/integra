import { useMemo, useState } from 'react'
import type { ComponentNode, InterfaceSpecification, InterfaceFunction } from '../../store/types'
import { useSystemStore } from '../../store/useSystemStore'
import { collectReferencedFunctionUuids, findReferencingDiagrams } from '../../utils/nodeUtils'
import { getNodeSiblingIds } from '../../nodes/nodeTree'
import { FunctionRenameConflictDialog } from '../FunctionRenameConflictDialog'
import { InterfaceInheritanceDialog } from '../InterfaceInheritanceDialog'
import { DescriptionField } from './DescriptionField'
import { InterfaceEditor } from './InterfaceEditor'
import { NodeReferencesButton } from './NodeReferencesButton'
import { NodePathEditorRow } from './NodePathEditorRow'
import { PanelTitleInput } from './PanelTitleInput'
import { useInterfaceTabManager } from './useInterfaceTabManager'
import {
    analyzeInterfaceInheritanceMerge,
    findChildFunctionsInInheritedInterfaces,
    findInheritedParentFunction,
    isInheritedInterface,
    isLocalInterface,
    isResolvedInterfaceDeletable,
    type InterfaceInheritanceMergeProblem,
    type InheritedChildFunctionConflict,
    type ResolvedInterface,
    resolveEffectiveInterfaceFunctions,
} from '../../utils/interfaceFunctions'
import { buildFunctionReferenceLookup } from '../../utils/functionReferenceLookup'

type EditableInterfaceUpdates = Partial<
    Pick<InterfaceSpecification, 'id' | 'name' | 'description' | 'type'>
>

const ID_FORMAT = /^[a-zA-Z_][a-zA-Z0-9_]*$/

type PendingFunctionRenameConflict = {
    functionUuid: string
    newId: string
    removeFunctionUuids: string[]
    title: string
    description: string
    confirmLabel: string
    conflictingChildren?: ReadonlyArray<InheritedChildFunctionConflict>
}

type PendingInterfaceInheritanceMerge = {
    interfaces: ReadonlyArray<InterfaceSpecification>
}

export const ComponentEditor = ({
    node,
    onUpdate,
    contextComponentUuid,
    readOnly = false,
}: {
    node: ComponentNode
    onUpdate: (updates: Partial<ComponentNode>) => void
    contextComponentUuid?: string
    readOnly?: boolean
}) => {
    const [name, setName] = useState(node.name || '')
    const [description, setDescription] = useState(node.description || '')
    const [localId, setLocalId] = useState(node.id)
    const [idError, setIdError] = useState<string | null>(null)
    const [pendingFunctionRenameConflict, setPendingFunctionRenameConflict] =
        useState<PendingFunctionRenameConflict | null>(null)
    const [pendingInterfaceInheritanceMerge, setPendingInterfaceInheritanceMerge] =
        useState<PendingInterfaceInheritanceMerge | null>(null)
    const [interfaceInheritanceProblems, setInterfaceInheritanceProblems] =
        useState<ReadonlyArray<InterfaceInheritanceMergeProblem> | null>(null)

    const rootComponent = useSystemStore((state) => state.rootComponent)
    const renameNodeId = useSystemStore((s) => s.renameNodeId)
    const renameNodeIdAndResolveFunctionConflicts = useSystemStore(
        (s) => s.renameNodeIdAndResolveFunctionConflicts
    )
    const referencingDiagrams = findReferencingDiagrams(rootComponent, node.uuid)
    const functionReferenceLookup = useMemo(
        () => buildFunctionReferenceLookup(rootComponent),
        [rootComponent]
    )
    const referencedFunctionUuids = useMemo(
        () => collectReferencedFunctionUuids(rootComponent),
        [rootComponent]
    )

    const {
        activeTabUuid,
        setActiveTabUuid,
        resolvedInterfaces,
        parentComponent,
        uninheritedParentInterfaces,
        handleInheritParentInterface,
        parentInterfaces,
    } = useInterfaceTabManager(node)

    const handleNameBlur = () => {
        if (name !== node.name && name.trim() !== '') {
            onUpdate({ name: name.trim() })
        } else if (name.trim() === '') {
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
            setIdError('ID cannot be empty')
        } else if (!ID_FORMAT.test(value)) {
            setIdError('ID must start with a letter or _ and contain only letters, digits, or _')
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
                ? isLocalInterface(iface)
                    ? { ...iface, ...updates, kind: 'local' as const }
                    : {
                          ...iface,
                          ...updates,
                          kind: 'inherited' as const,
                          parentInterfaceUuid: iface.parentInterfaceUuid,
                      }
                : iface
        )
        onUpdate({ interfaces: newInterfaces })
    }

    const handleFunctionUpdate = (
        ifaceIdx: number,
        fnIdx: number,
        updates: Partial<InterfaceFunction>
    ) => {
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

    const handleFunctionRenameAttempt = (
        iface: InterfaceSpecification,
        fn: InterfaceFunction,
        newId: string
    ) => {
        if (isInheritedInterface(iface)) {
            const inheritedParentFn = findInheritedParentFunction(
                iface,
                node,
                rootComponent,
                newId,
                fn.parameters
            )
            if (inheritedParentFn) {
                setPendingFunctionRenameConflict({
                    functionUuid: fn.uuid,
                    newId,
                    removeFunctionUuids: [fn.uuid],
                    title: 'Redundant child function',
                    description:
                        'This child-added function would become identical to the inherited parent function. Confirm to remove the redundant child-local function and keep using the inherited one.',
                    confirmLabel: 'Remove child function',
                })
                return
            }
        } else {
            const conflictingChildren = findChildFunctionsInInheritedInterfaces(
                rootComponent,
                iface.uuid,
                newId,
                fn.parameters
            )
            if (conflictingChildren.length > 0) {
                setPendingFunctionRenameConflict({
                    functionUuid: fn.uuid,
                    newId,
                    removeFunctionUuids: conflictingChildren.map(
                        (conflict) => conflict.functionUuid
                    ),
                    title: 'Conflicting child-added functions',
                    description:
                        'This parent function rename would make child-added inherited-interface functions redundant. Confirm to remove those child-local functions or cancel to reject the rename.',
                    confirmLabel: 'Rename and remove conflicts',
                    conflictingChildren,
                })
                return
            }
        }

        renameNodeId(fn.uuid, newId)
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

    const handleInheritParentInterfaceSelection = (parentUuid: string) => {
        const parentIface = parentInterfaces.find((iface) => iface.uuid === parentUuid)
        if (!parentIface || !parentComponent) return

        const existingInterface = node.interfaces.find((iface) => iface.id === parentIface.id)
        if (!existingInterface) {
            handleInheritParentInterface(parentUuid, onUpdate)
            return
        }

        const inheritedFunctions = resolveEffectiveInterfaceFunctions(
            parentIface,
            parentComponent,
            rootComponent
        )
        const mergeAnalysis = analyzeInterfaceInheritanceMerge(
            existingInterface.functions,
            inheritedFunctions
        )

        if (mergeAnalysis.problems.length > 0) {
            setInterfaceInheritanceProblems(mergeAnalysis.problems)
            return
        }

        setPendingInterfaceInheritanceMerge({
            interfaces: node.interfaces.map((iface) =>
                iface.uuid === existingInterface.uuid
                    ? {
                          uuid: existingInterface.uuid,
                          kind: 'inherited' as const,
                          id: parentIface.id,
                          name: parentIface.name,
                          description: existingInterface.description,
                          type: parentIface.type,
                          parentInterfaceUuid: parentIface.uuid,
                          functions: mergeAnalysis.additionalFunctions,
                      }
                    : iface
            ),
        })
        setActiveTabUuid(existingInterface.uuid)
    }

    return (
        <div className="p-4 h-full flex flex-col overflow-y-auto">
            {pendingFunctionRenameConflict && (
                <FunctionRenameConflictDialog
                    title={pendingFunctionRenameConflict.title}
                    description={pendingFunctionRenameConflict.description}
                    confirmLabel={pendingFunctionRenameConflict.confirmLabel}
                    conflictingChildren={pendingFunctionRenameConflict.conflictingChildren}
                    onCancel={() => setPendingFunctionRenameConflict(null)}
                    onConfirm={() => {
                        renameNodeIdAndResolveFunctionConflicts(
                            pendingFunctionRenameConflict.functionUuid,
                            pendingFunctionRenameConflict.newId,
                            pendingFunctionRenameConflict.removeFunctionUuids
                        )
                        setPendingFunctionRenameConflict(null)
                    }}
                />
            )}
            {pendingInterfaceInheritanceMerge && (
                <InterfaceInheritanceDialog
                    title="Merge with existing interface?"
                    description="This component already has an interface with the same ID. Confirm to convert the existing interface into an inherited one and keep only child-local functions that are not already provided by the inherited contract."
                    confirmLabel="Merge interface"
                    onClose={() => setPendingInterfaceInheritanceMerge(null)}
                    onConfirm={() => {
                        onUpdate({ interfaces: pendingInterfaceInheritanceMerge.interfaces })
                        setPendingInterfaceInheritanceMerge(null)
                    }}
                />
            )}
            {interfaceInheritanceProblems && (
                <InterfaceInheritanceDialog
                    title="Cannot inherit interface"
                    description="One or more existing functions are incompatible with the inherited interface. Resolve these conflicts before trying again."
                    problems={interfaceInheritanceProblems}
                    onClose={() => setInterfaceInheritanceProblems(null)}
                />
            )}
            <div className="mb-6 border-b border-gray-800 pb-4">
                <PanelTitleInput
                    value={name}
                    nodeType={node.type}
                    onChange={setName}
                    onBlur={handleNameBlur}
                    readOnly={readOnly}
                />
                <NodePathEditorRow
                    nodeUuid={node.uuid}
                    nodeType={node.type}
                    localId={localId}
                    idError={idError}
                    onIdChange={handleIdChange}
                    onIdBlur={handleIdBlur}
                    trailingContent={<NodeReferencesButton refs={referencingDiagrams} />}
                    readOnly={readOnly}
                />
            </div>

            <div className="mb-4 flex flex-col">
                <DescriptionField
                    value={description}
                    onChange={setDescription}
                    onBlur={handleDescriptionBlur}
                    height={100}
                    placeholder="Add a description..."
                    contextComponentUuid={contextComponentUuid}
                    readOnly={readOnly}
                    hideWhenEmpty={readOnly}
                />
            </div>

            {/* Inherit parent interface selector — above tabs, visible even with no interfaces yet */}
            {!readOnly && uninheritedParentInterfaces.length > 0 && (
                <div className="flex items-center gap-1.5 mb-3">
                    <span className="text-xs text-gray-500">Inherit parent interface:</span>
                    <select
                        className="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-gray-300 focus:outline-none focus:border-blue-400"
                        value=""
                        onChange={(e) => {
                            if (e.target.value)
                                handleInheritParentInterfaceSelection(e.target.value)
                        }}
                        data-testid="inherit-parent-select"
                    >
                        <option value="" disabled>
                            — select —
                        </option>
                        {uninheritedParentInterfaces.map((pi) => (
                            <option key={pi.uuid} value={pi.uuid}>
                                {pi.name || pi.id}
                            </option>
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
                                sub.interfaces.some(
                                    (si) =>
                                        si.kind === 'inherited' &&
                                        si.parentInterfaceUuid === iface.uuid
                                )
                            )
                            const showWarning = hasSubComponents && !isInherited
                            return (
                                <button
                                    key={iface.uuid}
                                    data-testid={`interface-tab-${iface.id}`}
                                    onClick={() => setActiveTabUuid(iface.uuid)}
                                    className={`flex-shrink-0 whitespace-nowrap px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                                        isActive
                                            ? 'border-blue-400 text-blue-300'
                                            : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
                                    }`}
                                >
                                    <span
                                        className={
                                            isResolvedInterfaceDeletable(
                                                iface,
                                                referencedFunctionUuids
                                            )
                                                ? 'line-through'
                                                : undefined
                                        }
                                        data-testid={`interface-tab-label-${iface.id}`}
                                    >
                                        {iface.name || iface.id}
                                    </span>
                                    {showWarning && (
                                        <span
                                            className="ml-1 text-amber-400"
                                            title="No sub-component inherits this interface"
                                            data-testid={`interface-tab-warning-${iface.id}`}
                                        >
                                            ⚠
                                        </span>
                                    )}
                                </button>
                            )
                        })}
                    </div>

                    {/* Active interface panel */}
                    {resolvedInterfaces.map((iface: ResolvedInterface, ifaceIdx) =>
                        iface.uuid === activeTabUuid
                            ? (() => {
                                  const functionReferencesById =
                                      functionReferenceLookup.get(iface.uuid) ?? new Map()

                                  return (
                                      <div
                                          key={iface.uuid}
                                          data-testid="interface-tab-panel"
                                          className="mt-3"
                                      >
                                          <InterfaceEditor
                                              iface={iface}
                                              ifaceIdx={ifaceIdx}
                                              referencedFunctionUuids={referencedFunctionUuids}
                                              functionReferencesById={functionReferencesById}
                                              siblingInterfaceIds={node.interfaces
                                                  .filter((_, i) => i !== ifaceIdx)
                                                  .map((i) => i.id)}
                                              onInterfaceUpdate={(updates) =>
                                                  handleInterfaceUpdate(ifaceIdx, updates)
                                              }
                                              onFunctionUpdate={(fnIdx, updates) =>
                                                  handleFunctionUpdate(ifaceIdx, fnIdx, updates)
                                              }
                                              onDeleteFunction={(fnIdx) =>
                                                  handleDeleteFunction(ifaceIdx, fnIdx)
                                              }
                                              onFunctionRenameAttempt={(fnIdx, newId) =>
                                                  handleFunctionRenameAttempt(
                                                      node.interfaces[ifaceIdx],
                                                      node.interfaces[ifaceIdx].functions[fnIdx],
                                                      newId
                                                  )
                                              }
                                              onDeleteInterface={() =>
                                                  handleDeleteInterface(ifaceIdx)
                                              }
                                              onParamDescriptionUpdate={(fnIdx, paramIdx, desc) =>
                                                  handleParamDescriptionUpdate(
                                                      ifaceIdx,
                                                      fnIdx,
                                                      paramIdx,
                                                      desc
                                                  )
                                              }
                                              contextComponentUuid={contextComponentUuid}
                                              readOnly={readOnly}
                                          />
                                      </div>
                                  )
                              })()
                            : null
                    )}
                </div>
            )}
        </div>
    )
}
