type SequenceLinkTooltipProps = {
    info: { entityType: string; entityName: string } | null
    position: { x: number; y: number } | null
}

export function SequenceLinkTooltip({ info, position }: SequenceLinkTooltipProps) {
    if (!info || !position) return null

    return (
        <div
            className="fixed z-50 pointer-events-none rounded border border-gray-700 bg-gray-900/95 px-3 py-2 shadow-lg backdrop-blur-sm"
            style={{
                left: Math.min(position.x + 12, window.innerWidth - 220),
                top: Math.min(position.y + 12, window.innerHeight - 60),
                transform: 'translateY(-100%)',
            }}
        >
            <span className="text-xs text-gray-400">{info.entityType}</span>
            <span className="mx-1.5 text-gray-600">·</span>
            <span className="text-xs font-medium text-gray-100">{info.entityName}</span>
        </div>
    )
}
