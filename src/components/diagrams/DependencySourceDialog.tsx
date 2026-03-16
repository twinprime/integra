import type { SequenceDiagramSource } from "../../utils/classDiagramMetadata"

type DependencySourceDialogProps = {
  sources: SequenceDiagramSource[]
  onClose: () => void
  onSelect: (uuid: string) => void
}

export function DependencySourceDialog({
  sources,
  onClose,
  onSelect,
}: DependencySourceDialogProps) {
  if (sources.length === 0) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[420px] max-h-[80vh] overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 shadow-xl">
        <div className="px-5 py-4 border-b border-gray-700">
          <h2 className="text-base font-semibold text-gray-100">
            Derived from sequence diagrams
          </h2>
          <p className="mt-1 text-xs text-gray-400">
            Choose a sequence diagram to inspect the dependency source.
          </p>
        </div>

        <div className="px-5 py-4">
          <ul className="space-y-2">
            {sources.map((source) => (
              <li key={source.uuid}>
                <button
                  type="button"
                  className="w-full rounded border border-gray-700 px-3 py-2 text-left text-sm text-blue-300 hover:border-blue-500 hover:bg-blue-950/30"
                  onClick={() => onSelect(source.uuid)}
                >
                  {source.name}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="px-5 py-3 border-t border-gray-700 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-sm rounded border border-gray-600 text-gray-300 hover:bg-gray-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
