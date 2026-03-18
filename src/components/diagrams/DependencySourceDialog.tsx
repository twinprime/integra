import type { ClassDiagramRelationshipMetadata } from '../../utils/classDiagramMetadata'

type DependencySourceDialogProps = {
    relationship: ClassDiagramRelationshipMetadata | null
    position: { x: number; y: number } | null
    pinned: boolean
    onClose: () => void
    onSelect: (uuid: string) => void
    onMouseEnter: () => void
    onMouseLeave: () => void
}

export function DependencySourceDialog({
    relationship,
    position,
    pinned,
    onClose,
    onSelect,
    onMouseEnter,
    onMouseLeave,
}: DependencySourceDialogProps) {
    if (!relationship || !position) return null

    const isDependency = relationship.kind === 'dependency'
    const sources = relationship.sequenceDiagrams

    return (
        <div
            className="fixed z-50 w-[320px] max-h-[60vh] overflow-y-auto rounded-lg border border-gray-700 bg-gray-900/95 shadow-xl backdrop-blur-sm"
            style={{
                left: Math.min(position.x + 12, window.innerWidth - 340),
                top: Math.min(position.y + 12, window.innerHeight - 24),
                transform: 'translateY(-100%)',
            }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <div className="flex items-start justify-between gap-4 px-4 py-3 border-b border-gray-700">
                <div>
                    <h2 className="text-sm font-semibold text-gray-100">
                        {isDependency ? 'Derived from sequence diagrams' : 'Implementation details'}
                    </h2>
                    <p className="mt-1 text-xs text-gray-400">
                        {isDependency
                            ? 'Inspect the dependency endpoints or select a sequence diagram to trace it.'
                            : 'Inspect the component and interface linked by this implementation.'}
                    </p>
                </div>
                {pinned && (
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-xs rounded border border-gray-600 px-2 py-1 text-gray-300 hover:bg-gray-800"
                    >
                        Close
                    </button>
                )}
            </div>

            <p className="px-4 py-3 text-sm text-gray-100">
                <span className="text-gray-400">{isDependency ? 'Source' : 'Component'}:</span>{' '}
                <span>{relationship.sourceName}</span>
                <span className="mx-2 text-gray-500">→</span>
                <span className="text-gray-400">{isDependency ? 'Target' : 'Interface'}:</span>{' '}
                <span>{relationship.targetName}</span>
            </p>

            {isDependency && sources.length > 0 && (
                <ul className="space-y-2 p-3 pt-0">
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
            )}
        </div>
    )
}
