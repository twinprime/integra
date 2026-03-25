import userGuideMarkdown from '../../docs/user-guide.md?raw'
import { ReadonlyMarkdownPreview } from './ReadonlyMarkdownPreview'

function getAppHref() {
    const url = new URL(window.location.href)
    url.searchParams.delete('view')
    return `${url.pathname}${url.search}${url.hash}`
}

export function UserGuidePage() {
    return (
        <div className="min-h-screen bg-gray-950 text-gray-100">
            <header className="border-b border-gray-800 bg-gray-900/90 px-6 py-4 backdrop-blur-sm">
                <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
                    <div>
                        <h1 className="text-lg font-semibold text-gray-100">User Guide</h1>
                        <p className="text-sm text-gray-400">
                            Read-only documentation packaged with the app.
                        </p>
                    </div>
                    <a
                        href={getAppHref()}
                        className="rounded border border-gray-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:bg-gray-800 hover:text-gray-100"
                    >
                        Open app
                    </a>
                </div>
            </header>

            <main className="mx-auto max-w-5xl px-6 py-8">
                <ReadonlyMarkdownPreview
                    source={userGuideMarkdown}
                    className="rounded-lg border border-gray-800 bg-gray-900/60 p-6 shadow-lg"
                />
            </main>
        </div>
    )
}
