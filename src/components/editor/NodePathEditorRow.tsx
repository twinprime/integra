import { Fragment, type ReactNode } from 'react'
import { useSystemStore } from '../../store/useSystemStore'
import { getNodeAbsolutePath, getNodeAbsolutePathSegments } from '../../utils/nodeUtils'

type NodePathEditorRowProps = {
    nodeUuid: string
    localId: string
    idError: string | null
    onIdChange: (value: string) => void
    onIdBlur: () => void
    trailingContent?: ReactNode
}

export const NodePathEditorRow = ({
    nodeUuid,
    localId,
    idError,
    onIdChange,
    onIdBlur,
    trailingContent,
}: NodePathEditorRowProps) => {
    const rootComponent = useSystemStore((state) => state.rootComponent)
    const selectNode = useSystemStore((state) => state.selectNode)
    const pathSegments = getNodeAbsolutePathSegments(rootComponent, nodeUuid)
    const fullPath = getNodeAbsolutePath(rootComponent, nodeUuid)

    return (
        <div className="mt-1">
            <div className="flex items-start gap-1.5">
                <div className="min-w-0 flex-1 flex items-start gap-1.5 flex-wrap">
                    <div
                        className="min-w-0 flex items-center gap-1 flex-wrap"
                        aria-label="Node path"
                        data-testid="node-path"
                        title={fullPath}
                    >
                        {pathSegments.slice(0, -1).map((segment) => (
                            <Fragment key={segment.uuid}>
                                <button
                                    type="button"
                                    className="font-mono text-sm text-blue-400 hover:text-blue-300 hover:underline focus:outline-none focus:text-blue-300"
                                    onClick={() => selectNode(segment.uuid)}
                                >
                                    {segment.id}
                                </button>
                                <span className="font-mono text-sm text-gray-500">/</span>
                            </Fragment>
                        ))}
                        <input
                            className={`font-mono text-sm bg-transparent border-b focus:outline-none ${
                                idError
                                    ? 'border-red-500 text-red-400'
                                    : 'border-transparent text-gray-400 hover:border-gray-600 focus:border-blue-400'
                            }`}
                            style={{ width: `${Math.max(localId.length, 4) + 1}ch` }}
                            value={localId}
                            onChange={(event) => onIdChange(event.target.value)}
                            onBlur={onIdBlur}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') event.currentTarget.blur()
                            }}
                            aria-label="Node ID"
                        />
                    </div>
                    {trailingContent}
                </div>
            </div>
            {idError && <p className="text-xs text-red-400 mt-0.5">{idError}</p>}
        </div>
    )
}
