import { useEffect, useState } from 'react'
import { MainLayout } from '../layouts/MainLayout'
import { TreeView } from './TreeView'
import { EditorPanel } from './EditorPanel'
import { DiagramPanel } from './DiagramPanel'
import { useSystemStore } from '../store/useSystemStore'
import { loadFromUrl, NotFoundError, getModelRouteComponentId } from '../utils/systemFiles'

type LoadState =
    | { status: 'loading' }
    | { status: 'not-found'; componentId: string }
    | { status: 'error'; message: string }
    | { status: 'ready' }

function FullScreenMessage({ children }: { children: React.ReactNode }) {
    return (
        <div className="h-screen w-screen bg-gray-950 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-center max-w-md px-6">
                {children}
                <a
                    href="/"
                    className="mt-2 rounded border border-gray-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:bg-gray-800 hover:text-gray-100"
                >
                    Go to app
                </a>
            </div>
        </div>
    )
}

export function ModelPage() {
    const componentId = getModelRouteComponentId()
    const setSystem = useSystemStore((s) => s.setSystem)
    const setUiMode = useSystemStore((s) => s.setUiMode)
    const setBrowseLocked = useSystemStore((s) => s.setBrowseLocked)

    const [loadState, setLoadState] = useState<LoadState>(() =>
        componentId ? { status: 'loading' } : { status: 'not-found', componentId: '' }
    )

    useEffect(() => {
        if (!componentId) return
        let cancelled = false
        void loadFromUrl(componentId)
            .then((tree) => {
                if (cancelled) return
                setSystem(tree)
                setUiMode('browse')
                setBrowseLocked(true)
                setLoadState({ status: 'ready' })
            })
            .catch((err: unknown) => {
                if (cancelled) return
                if (err instanceof NotFoundError) {
                    setLoadState({ status: 'not-found', componentId: componentId ?? '' })
                } else {
                    setLoadState({
                        status: 'error',
                        message: err instanceof Error ? err.message : 'Unknown error',
                    })
                }
            })
        return () => {
            cancelled = true
        }
    }, [componentId, setSystem, setUiMode, setBrowseLocked])

    if (loadState.status === 'loading') {
        return (
            <div className="h-screen w-screen bg-gray-950 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-gray-400">
                    <div className="w-8 h-8 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
                    <p className="text-sm">Loading model…</p>
                </div>
            </div>
        )
    }

    if (loadState.status === 'not-found') {
        return (
            <FullScreenMessage>
                <p className="text-6xl font-bold text-gray-700">404</p>
                <p className="text-lg font-medium text-gray-300">Model not found</p>
                {loadState.componentId && (
                    <p className="text-sm text-gray-500 font-mono">{loadState.componentId}</p>
                )}
            </FullScreenMessage>
        )
    }

    if (loadState.status === 'error') {
        return (
            <FullScreenMessage>
                <p className="text-lg font-medium text-red-400">Failed to load model</p>
                <p className="text-sm text-gray-500 font-mono break-all">{loadState.message}</p>
            </FullScreenMessage>
        )
    }

    return (
        <MainLayout
            leftPanel={<TreeView />}
            rightPanel={<EditorPanel />}
            bottomPanel={<DiagramPanel />}
        />
    )
}
