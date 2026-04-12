import type { FunctionDecision } from '../store/useSystemStore'
import type {
    FunctionMatch,
    ExistingFunctionMatch,
    ParentAddConflictMatch,
} from '../parser/sequenceDiagram/systemUpdater'
import { paramsToString } from '../parser/sequenceDiagram/systemUpdater'

type SeqDiagramInfo = { uuid: string; name: string }

type Props = {
    matches: FunctionMatch[]
    seqDiagrams: SeqDiagramInfo[]
    onResolve: (decisions: FunctionDecision[]) => void
    onCancel: () => void
}

function DiagramList({ uuids, seqDiagrams }: { uuids: string[]; seqDiagrams: SeqDiagramInfo[] }) {
    if (uuids.length === 0) return null
    const names = uuids.map((u) => seqDiagrams.find((d) => d.uuid === u)?.name ?? u)
    return (
        <ul className="mt-1 ml-3 list-disc list-inside text-xs text-gray-400">
            {names.map((n) => (
                <li key={n}>{n}</li>
            ))}
        </ul>
    )
}

function ChildConflictList({
    matches,
}: {
    matches: ReadonlyArray<NonNullable<FunctionMatch['conflictingChildFunctions']>[number]>
}) {
    if (matches.length === 0) return null
    return (
        <ul className="mt-1 ml-3 list-disc list-inside text-xs text-gray-400">
            {matches.map((match) => (
                <li key={match.functionUuid}>
                    {match.componentName} · {match.interfaceId}:{match.functionId}
                </li>
            ))}
        </ul>
    )
}

function SignatureChange({
    interfaceId,
    functionId,
    oldParams,
    newParams,
}: Pick<FunctionMatch, 'interfaceId' | 'functionId' | 'oldParams' | 'newParams'>) {
    return (
        <div className="mt-1 font-mono text-xs space-y-0.5">
            <div className="text-red-400 line-through">
                {interfaceId}:{functionId}({paramsToString(oldParams)})
            </div>
            <div className="text-green-400">
                {interfaceId}:{functionId}({paramsToString(newParams)})
            </div>
        </div>
    )
}

export function FunctionUpdateDialog({ matches, seqDiagrams, onResolve, onCancel }: Props) {
    const changedMatches = matches.filter(
        (m): m is ExistingFunctionMatch => m.kind === 'incompatible'
    )
    const redundantMatches = matches.filter(
        (m): m is ExistingFunctionMatch => m.kind === 'redundant'
    )
    const parentAddMatches = matches.filter(
        (m): m is ParentAddConflictMatch => m.kind === 'parent-add-conflict'
    )

    const handleApply = (): void => {
        const decisions: FunctionDecision[] = []

        for (const m of changedMatches) {
            decisions.push({ ...m, action: 'update-existing' })
        }

        for (const m of redundantMatches) {
            decisions.push({ ...m, action: 'remove-redundant' })
        }

        for (const m of parentAddMatches) {
            decisions.push({ ...m, action: 'apply-parent-add' })
        }

        onResolve(decisions)
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="w-[480px] max-h-[80vh] overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 shadow-xl">
                <div className="px-5 py-4 border-b border-gray-700">
                    <h2 className="text-base font-semibold text-gray-100">
                        Function Definition Conflict
                    </h2>
                    <p className="mt-1 text-xs text-gray-400">
                        Review the changes below before applying.
                    </p>
                </div>

                <div className="px-5 py-4 space-y-5">
                    {changedMatches.map((m) => {
                        const key = `${m.interfaceId}:${m.functionId}`
                        const conflictingChildFunctions = m.conflictingChildFunctions ?? []
                        return (
                            <div key={key} className="space-y-2">
                                <p className="text-sm text-gray-200">
                                    <span className="font-semibold text-yellow-400">
                                        {m.interfaceId}:{m.functionId}
                                    </span>{' '}
                                    already exists with a different signature. Applying this change
                                    will update the existing function definition.
                                </p>
                                <SignatureChange
                                    interfaceId={m.interfaceId}
                                    functionId={m.functionId}
                                    oldParams={m.oldParams}
                                    newParams={m.newParams}
                                />
                                {(m.affectedDiagramUuids.length > 0 ||
                                    conflictingChildFunctions.length > 0) && (
                                    <div className="text-xs text-gray-400 space-y-2">
                                        {m.affectedDiagramUuids.length > 0 && (
                                            <div>
                                                Affected diagrams:
                                                <DiagramList
                                                    uuids={m.affectedDiagramUuids}
                                                    seqDiagrams={seqDiagrams}
                                                />
                                            </div>
                                        )}
                                        {conflictingChildFunctions.length > 0 && (
                                            <div>
                                                Child-added inherited-interface functions that will
                                                be removed:
                                                <ChildConflictList
                                                    matches={conflictingChildFunctions}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}

                    {redundantMatches.map((m) => {
                        const key = `${m.interfaceId}:${m.functionId}:${m.functionUuid}`
                        return (
                            <div key={key} className="space-y-2">
                                <p className="text-sm text-gray-200">
                                    <span className="font-semibold text-indigo-300">
                                        {m.interfaceId}:{m.functionId}
                                    </span>{' '}
                                    now matches an inherited parent function. Applying this change
                                    will remove the redundant child-local function.
                                </p>
                                <SignatureChange
                                    interfaceId={m.interfaceId}
                                    functionId={m.functionId}
                                    oldParams={m.oldParams}
                                    newParams={m.newParams}
                                />
                                {m.affectedDiagramUuids.length > 0 && (
                                    <div className="text-xs text-gray-400">
                                        Other diagrams that will be updated to the inherited
                                        signature:
                                        <DiagramList
                                            uuids={m.affectedDiagramUuids}
                                            seqDiagrams={seqDiagrams}
                                        />
                                    </div>
                                )}
                            </div>
                        )
                    })}

                    {parentAddMatches.map((m) => {
                        const key = `${m.interfaceId}:${m.functionId}:${m.parentInterfaceUuid}`
                        return (
                            <div key={key} className="space-y-2">
                                <p className="text-sm text-gray-200">
                                    <span className="font-semibold text-teal-300">
                                        {m.interfaceId}:{m.functionId}
                                    </span>{' '}
                                    will be added to the parent interface. Applying this change will
                                    remove the conflicting child-local definitions listed below.
                                </p>
                                <div className="mt-1 font-mono text-xs text-green-400">
                                    {m.interfaceId}:{m.functionId}({paramsToString(m.newParams)})
                                </div>
                                <div className="text-xs text-gray-400 space-y-2">
                                    <div>
                                        Child-added inherited-interface functions that will be
                                        removed:
                                        <ChildConflictList matches={m.conflictingChildFunctions} />
                                    </div>
                                    {m.affectedDiagramUuids.length > 0 && (
                                        <div>
                                            Affected diagrams:
                                            <DiagramList
                                                uuids={m.affectedDiagramUuids}
                                                seqDiagrams={seqDiagrams}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>

                <div className="px-5 py-3 border-t border-gray-700 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-1.5 text-sm rounded border border-gray-600 text-gray-300 hover:bg-gray-800"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleApply}
                        className="px-4 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-500"
                    >
                        Apply
                    </button>
                </div>
            </div>
        </div>
    )
}
