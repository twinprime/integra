type VisualizationViewOption = {
    id: string
    label: string
}

interface VisualizationViewControlsProps {
    views: VisualizationViewOption[]
    activeViewId: string
    onChange: (viewId: string) => void
}

export const VisualizationViewControls = ({
    views,
    activeViewId,
    onChange,
}: VisualizationViewControlsProps) => {
    if (views.length < 2) return null

    return (
        <div
            className="mr-2 flex items-center gap-1 rounded border border-gray-200 bg-white/90 p-1 shadow-sm"
            data-testid="visualization-view-controls"
        >
            {views.map((view) => {
                const isActive = view.id === activeViewId
                return (
                    <button
                        key={view.id}
                        type="button"
                        onClick={() => onChange(view.id)}
                        aria-pressed={isActive}
                        className={
                            isActive
                                ? 'rounded px-2 py-1 text-xs font-medium bg-gray-900 text-white'
                                : 'rounded px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100'
                        }
                    >
                        {view.label}
                    </button>
                )
            })}
        </div>
    )
}
