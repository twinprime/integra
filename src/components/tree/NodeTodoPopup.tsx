import type { DerivedNodeTodo } from '../../utils/nodeTodos'

type NodeTodoPopupProps = {
    todos: ReadonlyArray<DerivedNodeTodo>
    position: { x: number; y: number } | null
    onSelect: (nodeUuid: string) => void
}

const VIEWPORT_PADDING = 12
const MAX_HEIGHT_RATIO = 0.6

function getPopupTop(positionY: number): number {
    const maxPopupHeight = Math.floor(window.innerHeight * MAX_HEIGHT_RATIO)
    const preferredTop = positionY + 12 - maxPopupHeight
    const maxTop = Math.max(
        VIEWPORT_PADDING,
        window.innerHeight - maxPopupHeight - VIEWPORT_PADDING
    )
    return Math.min(Math.max(preferredTop, VIEWPORT_PADDING), maxTop)
}

export function NodeTodoPopup({ todos, position, onSelect }: NodeTodoPopupProps) {
    if (!position || todos.length === 0) return null

    return (
        <div
            data-testid="node-todo-popup"
            className="fixed z-50 w-[320px] max-h-[60vh] overflow-y-auto rounded-lg border border-gray-700 bg-gray-900/95 shadow-xl backdrop-blur-sm"
            style={{
                left: Math.min(position.x + 12, window.innerWidth - 340),
                top: getPopupTop(position.y),
            }}
        >
            <div className="border-b border-gray-700 px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-100">TODOs</h2>
            </div>
            <ul className="space-y-2 p-3">
                {todos.map((todo) => (
                    <li key={todo.id}>
                        <button
                            type="button"
                            className="w-full rounded border border-gray-700 px-3 py-2 text-left hover:border-blue-500 hover:bg-blue-950/30"
                            onClick={() => onSelect(todo.definingNodeUuid)}
                        >
                            <div className="text-sm text-blue-300">{todo.text}</div>
                            <div className="mt-1 text-xs text-gray-400">
                                {todo.definingNodeName}
                                <span className="mx-1 text-gray-600">•</span>
                                {todo.source === 'description' ? 'Description' : 'Diagram'}
                            </div>
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    )
}
