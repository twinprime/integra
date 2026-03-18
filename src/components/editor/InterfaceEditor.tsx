import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { InterfaceSpecification, InterfaceFunction } from '../../store/types'
import { useSystemStore } from '../../store/useSystemStore'
import { MarkdownEditor } from './MarkdownEditor'
import { FunctionEditor } from './FunctionEditor'
import {
    isInheritedInterface,
    isLocalInterface,
    type ResolvedInterface,
} from '../../utils/interfaceFunctions'

type EditableInterfaceUpdates = Partial<
    Pick<InterfaceSpecification, 'id' | 'name' | 'description' | 'type'>
>

const ID_FORMAT = /^[a-zA-Z_][a-zA-Z0-9_]*$/

const INTERFACE_TYPES = ['rest', 'graphql', 'kafka', 'other'] as const

export const InterfaceEditor = ({
    iface,
    referencedFunctionUuids,
    siblingInterfaceIds,
    onInterfaceUpdate,
    onFunctionUpdate,
    onDeleteFunction,
    onDeleteInterface,
    onParamDescriptionUpdate,
    contextComponentUuid,
}: {
    iface: ResolvedInterface
    ifaceIdx: number
    referencedFunctionUuids: Set<string>
    siblingInterfaceIds: string[]
    onInterfaceUpdate: (updates: EditableInterfaceUpdates) => void
    onFunctionUpdate: (fnIdx: number, updates: Partial<InterfaceFunction>) => void
    onDeleteFunction: (fnIdx: number) => void
    onDeleteInterface?: () => void
    onParamDescriptionUpdate: (fnIdx: number, paramIdx: number, desc: string) => void
    contextComponentUuid?: string
    // eslint-disable-next-line complexity
}) => {
    const [name, setName] = useState(iface.name)
    const [description, setDescription] = useState(iface.description || '')
    const [localId, setLocalId] = useState(iface.id)
    const [idError, setIdError] = useState<string | null>(null)

    const renameNodeId = useSystemStore((s) => s.renameNodeId)

    const isInherited = isInheritedInterface(iface)
    const isDangling = iface.isDangling

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
        if (!trimmed || idError || trimmed === iface.id) {
            setLocalId(iface.id)
            setIdError(null)
            return
        }
        if (siblingInterfaceIds.includes(trimmed)) {
            setIdError(`ID "${trimmed}" is already used by another interface`)
            return
        }
        renameNodeId(iface.uuid, trimmed)
    }

    if (isInherited || isDangling) {
        const parentName = isInherited ? iface.inheritedFrom?.name || iface.inheritedFrom?.id : null
        const fns = iface.effectiveFunctions
        return (
            <div className="border border-indigo-800/50 rounded-md bg-gray-900/50 p-3">
                <div className="flex items-center gap-2 mb-2">
                    <span className="flex-1 text-sm font-medium text-gray-200">
                        {iface.name || iface.id}
                    </span>
                    <span className="text-xs text-gray-500 bg-gray-800 border border-gray-700 rounded px-2 py-0.5">
                        {iface.type}
                    </span>
                    <span
                        className="text-xs text-indigo-400 bg-indigo-900/30 px-1.5 py-0.5 rounded"
                        data-testid="inherited-badge"
                    >
                        {isInherited ? `inherited from ${parentName}` : 'inherited (unresolved)'}
                    </span>
                    {onDeleteInterface && (
                        <button
                            className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                            title="Remove inherited interface"
                            onClick={onDeleteInterface}
                            data-testid="delete-interface-btn"
                        >
                            <Trash2 size={14} />
                        </button>
                    )}
                </div>

                <div className="mb-2">
                    <span className="text-xs text-gray-500">ID: </span>
                    <span className="font-mono text-xs text-gray-500">{iface.id}</span>
                </div>

                {isDangling && (
                    <p
                        className="text-xs text-amber-400 mt-1"
                        data-testid="dangling-inherit-notice"
                    >
                        ⚠ Referenced parent interface not found.
                    </p>
                )}

                {isInherited && fns.length > 0 && (
                    <div className="space-y-2 mt-3">
                        <p className="text-xs font-medium text-gray-400">
                            Functions ({fns.length})
                        </p>
                        {fns.map((fn, fnIdx) => (
                            <FunctionEditor
                                key={fn.uuid || fn.id}
                                fn={fn}
                                fnIdx={fnIdx}
                                isUnreferenced={false}
                                siblingFunctionIds={fns
                                    .filter((_, j) => j !== fnIdx)
                                    .map((f) => f.id)}
                                onUpdate={() => {}}
                                onDelete={() => {}}
                                onParamDescriptionUpdate={() => {}}
                                contextComponentUuid={contextComponentUuid}
                                readOnly={true}
                            />
                        ))}
                    </div>
                )}

                {isInherited && fns.length === 0 && (
                    <p className="text-xs text-gray-500 mt-2 italic">
                        No functions defined on parent interface.
                    </p>
                )}
            </div>
        )
    }

    return (
        <div className="border border-gray-700 rounded-md bg-gray-900/50 p-3">
            <div className="flex items-center gap-2 mb-2">
                <input
                    className="flex-1 p-1 text-sm font-medium text-gray-200 bg-transparent border border-transparent rounded hover:border-gray-600 focus:border-blue-400 focus:outline-none"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => {
                        if (name !== iface.name && name.trim())
                            onInterfaceUpdate({ name: name.trim() })
                    }}
                />
                <select
                    className="text-xs text-gray-400 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 focus:outline-none focus:border-blue-400"
                    value={iface.type}
                    onChange={(e) =>
                        onInterfaceUpdate({
                            type: e.target.value as InterfaceSpecification['type'],
                        })
                    }
                >
                    {INTERFACE_TYPES.map((t) => (
                        <option key={t} value={t}>
                            {t}
                        </option>
                    ))}
                </select>
                {onDeleteInterface && iface.effectiveFunctions.length === 0 && (
                    <button
                        className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                        title="Delete interface"
                        onClick={onDeleteInterface}
                        data-testid="delete-interface-btn"
                    >
                        <Trash2 size={14} />
                    </button>
                )}
            </div>

            <div className="mb-2">
                <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500">ID:</span>
                    <input
                        className={`font-mono text-xs bg-transparent border-b focus:outline-none w-32 ${
                            idError
                                ? 'border-red-500 text-red-400'
                                : 'border-transparent text-gray-500 hover:border-gray-600 focus:border-blue-400'
                        }`}
                        value={localId}
                        onChange={(e) => handleIdChange(e.target.value)}
                        onBlur={handleIdBlur}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                        }}
                        aria-label="Interface ID"
                    />
                </div>
                {idError && <p className="text-xs text-red-400 mt-0.5">{idError}</p>}
            </div>
            <MarkdownEditor
                value={description}
                onChange={setDescription}
                onBlur={() => {
                    if (description !== (iface.description || ''))
                        onInterfaceUpdate({ description })
                }}
                height={80}
                placeholder="Description..."
                contextComponentUuid={contextComponentUuid}
            />

            {isLocalInterface(iface) && iface.functions.length > 0 && (
                <div className="space-y-2 mt-3">
                    <p className="text-xs font-medium text-gray-400">
                        Functions ({iface.functions.length})
                    </p>
                    {iface.functions.map((fn, fnIdx) => {
                        const isUnreferenced = !referencedFunctionUuids.has(fn.uuid)
                        const siblingFunctionIds = iface.functions
                            .filter((_, j) => j !== fnIdx)
                            .map((f) => f.id)
                        return (
                            <FunctionEditor
                                key={fn.uuid || fn.id}
                                fn={fn}
                                fnIdx={fnIdx}
                                isUnreferenced={isUnreferenced}
                                siblingFunctionIds={siblingFunctionIds}
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
