import type { InterfaceInheritanceMergeProblem } from '../utils/interfaceFunctions'
import { formatFunctionSignature } from '../utils/interfaceFunctions'

type Props = {
    title: string
    description: string
    confirmLabel?: string
    problems?: ReadonlyArray<InterfaceInheritanceMergeProblem>
    onClose: () => void
    onConfirm?: () => void
}

export function InterfaceInheritanceDialog({
    title,
    description,
    confirmLabel,
    problems = [],
    onClose,
    onConfirm,
}: Props) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="w-[520px] max-h-[80vh] overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 shadow-xl">
                <div className="border-b border-gray-700 px-5 py-4">
                    <h2 className="text-base font-semibold text-gray-100">{title}</h2>
                    <p className="mt-1 text-xs text-gray-400">{description}</p>
                </div>

                {problems.length > 0 && (
                    <div className="px-5 py-4 text-xs text-gray-300">
                        <p className="font-medium text-gray-200">Blocking function conflicts:</p>
                        <ul className="mt-2 ml-3 list-disc list-inside space-y-3 text-gray-400">
                            {problems.map((problem) => (
                                <li key={problem.localFunction.uuid}>
                                    <div className="font-medium text-gray-300">
                                        {problem.functionId}
                                    </div>
                                    <div>
                                        Existing:{' '}
                                        {formatFunctionSignature(
                                            problem.localFunction.id,
                                            problem.localFunction.parameters
                                        )}
                                    </div>
                                    <div>
                                        Inherited:{' '}
                                        {formatFunctionSignature(
                                            problem.inheritedFunction.id,
                                            problem.inheritedFunction.parameters
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="flex justify-end gap-3 border-t border-gray-700 px-5 py-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded border border-gray-600 px-4 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
                    >
                        {onConfirm ? 'Cancel' : 'Close'}
                    </button>
                    {onConfirm && confirmLabel && (
                        <button
                            type="button"
                            onClick={onConfirm}
                            className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-500"
                        >
                            {confirmLabel}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
