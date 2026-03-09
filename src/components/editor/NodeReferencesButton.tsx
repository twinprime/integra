import { useState } from "react"
import { Link } from "lucide-react"
import { useSystemStore } from "../../store/useSystemStore"

export const NodeReferencesButton = ({
  refs,
  title = "Show referencing diagrams",
}: {
  refs: Array<{ uuid: string; name: string }>
  title?: string
}) => {
  const [open, setOpen] = useState(false)
  const { selectNode } = useSystemStore()

  if (refs.length === 0) return null

  return (
    <div>
      <button
        type="button"
        className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border transition-colors ${
          open
            ? "bg-blue-900/40 border-blue-600 text-blue-300"
            : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-300"
        }`}
        title={title}
        onClick={() => setOpen((v) => !v)}
      >
        <Link size={10} />
        <span>{refs.length}</span>
      </button>
      {open && (
        <div className="mt-1 rounded border border-blue-900/50 bg-blue-950/20 px-2 py-1.5">
          <p className="text-[0.65rem] font-medium text-gray-500 mb-1 uppercase tracking-wide">
            Referenced in
          </p>
          <ul className="space-y-0.5">
            {refs.map((ref) => (
              <li key={ref.uuid}>
                <button
                  type="button"
                  className="text-xs text-blue-400 hover:text-blue-300 hover:underline text-left w-full"
                  onClick={() => {
                    selectNode(ref.uuid)
                    setOpen(false)
                  }}
                >
                  {ref.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
