import type { DerivedNodeTodo } from '../../utils/nodeTodos'

type NodeTodoPopupProps = {
    todos: ReadonlyArray<DerivedNodeTodo>
    position: { x: number; y: number } | null
    onSelect: (nodeUuid: string) => void
}

export function NodeTodoPopup({ todos, position, onSelect }: NodeTodoPopupProps) {
    if (!position || todos.length === 0) return null

    return (
        <div
            className="fixed z-50 w-[320px] max-h-[60vh] overflow-y-auto rounded-lg border border-gray-700 bg-gray-900/95 shadow-xl backdrop-blur-sm"
            style={{
                left: Math.min(position.x + 12, window.innerWidth - 340),
                top: Math.min(position.y + 12, window.innerHeight - 24),
                transform: 'translateY(-100%)',
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
