import { useState } from "react"
import type { FunctionDecision } from "../store/useSystemStore"
import type { FunctionMatch } from "../parser/sequenceDiagram/systemUpdater"
import { paramsToString } from "../parser/sequenceDiagram/systemUpdater"

type SeqDiagramInfo = { uuid: string; name: string }

type Props = {
  matches: FunctionMatch[]
  seqDiagrams: SeqDiagramInfo[]
  onResolve: (decisions: FunctionDecision[]) => void
  onCancel: () => void
}

type CompatibleAction = "add-new" | "update-existing"

function DiagramList({
  uuids,
  seqDiagrams,
}: {
  uuids: string[]
  seqDiagrams: SeqDiagramInfo[]
}) {
  if (uuids.length === 0) return null
  const names = uuids.map(
    (u) => seqDiagrams.find((d) => d.uuid === u)?.name ?? u,
  )
  return (
    <ul className="mt-1 ml-3 list-disc list-inside text-xs text-gray-400">
      {names.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  )
}

function SignatureChange({
  interfaceId,
  functionId,
  oldParams,
  newParams,
}: Pick<
  FunctionMatch,
  "interfaceId" | "functionId" | "oldParams" | "newParams"
>) {
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

export function FunctionUpdateDialog({
  matches,
  seqDiagrams,
  onResolve,
  onCancel,
}: Props) {
  const [compatibleActions, setCompatibleActions] = useState<
    Record<string, CompatibleAction>
  >(() =>
    Object.fromEntries(
      matches
        .filter((m) => m.kind === "compatible")
        .map((m) => [`${m.interfaceId}:${m.functionId}`, "add-new"]),
    ),
  )

  const compatibleMatches = matches.filter((m) => m.kind === "compatible")
  const incompatibleMatches = matches.filter((m) => m.kind === "incompatible")

  const handleApply = (): void => {
    const decisions: FunctionDecision[] = []

    for (const m of compatibleMatches) {
      const key = `${m.interfaceId}:${m.functionId}`
      const action = compatibleActions[key] ?? "add-new"
      decisions.push({ ...m, action })
    }

    for (const m of incompatibleMatches) {
      decisions.push({ ...m, action: "update-all" })
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
          {compatibleMatches.map((m) => {
            const key = `${m.interfaceId}:${m.functionId}`
            const action = compatibleActions[key] ?? "add-new"
            return (
              <div key={key} className="space-y-2">
                <p className="text-sm text-gray-200">
                  <span className="font-semibold text-yellow-400">
                    {m.interfaceId}:{m.functionId}
                  </span>{" "}
                  already exists with a different number of parameters.
                </p>
                <SignatureChange
                  interfaceId={m.interfaceId}
                  functionId={m.functionId}
                  oldParams={m.oldParams}
                  newParams={m.newParams}
                />
                <div className="flex gap-3 mt-2">
                  <label className="flex items-center gap-1.5 text-sm text-gray-300 cursor-pointer">
                    <input
                      type="radio"
                      name={key}
                      value="add-new"
                      checked={action === "add-new"}
                      onChange={() =>
                        setCompatibleActions((prev) => ({
                          ...prev,
                          [key]: "add-new",
                        }))
                      }
                    />
                    Add new definition
                  </label>
                  <label className="flex items-center gap-1.5 text-sm text-gray-300 cursor-pointer">
                    <input
                      type="radio"
                      name={key}
                      value="update-existing"
                      checked={action === "update-existing"}
                      onChange={() =>
                        setCompatibleActions((prev) => ({
                          ...prev,
                          [key]: "update-existing",
                        }))
                      }
                    />
                    Update existing
                  </label>
                </div>
                {action === "update-existing" &&
                  m.affectedDiagramUuids.length > 0 && (
                    <div className="text-xs text-gray-400">
                      Affected diagrams:
                      <DiagramList
                        uuids={m.affectedDiagramUuids}
                        seqDiagrams={seqDiagrams}
                      />
                    </div>
                  )}
              </div>
            )
          })}

          {incompatibleMatches.map((m) => {
            const key = `${m.interfaceId}:${m.functionId}`
            return (
              <div key={key} className="space-y-2">
                <p className="text-sm text-gray-200">
                  <span className="font-semibold text-red-400">
                    {m.interfaceId}:{m.functionId}
                  </span>{" "}
                  has incompatible parameters. This will update all affected
                  diagrams.
                </p>
                <SignatureChange
                  interfaceId={m.interfaceId}
                  functionId={m.functionId}
                  oldParams={m.oldParams}
                  newParams={m.newParams}
                />
                {m.affectedDiagramUuids.length > 0 && (
                  <div className="text-xs text-gray-400">
                    Affected diagrams:
                    <DiagramList
                      uuids={m.affectedDiagramUuids}
                      seqDiagrams={seqDiagrams}
                    />
                  </div>
                )}
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
