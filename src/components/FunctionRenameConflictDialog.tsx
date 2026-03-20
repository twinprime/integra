import type { InheritedChildFunctionConflict } from '../utils/interfaceFunctions'

type Props = {
    title: string
    description: string
    conflictingChildren?: ReadonlyArray<InheritedChildFunctionConflict>
    confirmLabel: string
    onConfirm: () => void
    onCancel: () => void
}

export function FunctionRenameConflictDialog({
    title,
    description,
    conflictingChildren = [],
    confirmLabel,
    onConfirm,
    onCancel,
}: Props) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="w-[480px] max-h-[80vh] overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 shadow-xl">
                <div className="px-5 py-4 border-b border-gray-700">
                    <h2 className="text-base font-semibold text-gray-100">{title}</h2>
                    <p className="mt-1 text-xs text-gray-400">{description}</p>
                </div>

                {conflictingChildren.length > 0 && (
                    <div className="px-5 py-4 text-xs text-gray-400">
                        <p className="font-medium text-gray-300">
                            Conflicting child-added functions:
                        </p>
                        <ul className="mt-2 ml-3 list-disc list-inside space-y-1">
                            {conflictingChildren.map((conflict) => (
                                <li key={conflict.functionUuid}>
                                    {conflict.componentName} · {conflict.interfaceId}:
                                    {conflict.functionId}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="px-5 py-3 border-t border-gray-700 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-1.5 text-sm rounded border border-gray-600 text-gray-300 hover:bg-gray-800"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className="px-4 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-500"
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}
