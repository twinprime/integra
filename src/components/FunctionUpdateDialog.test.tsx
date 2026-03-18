import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FunctionUpdateDialog } from './FunctionUpdateDialog'
import type { FunctionMatch } from '../parser/sequenceDiagram/systemUpdater'
import type { Parameter } from '../store/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeParam(name: string, type = 'string'): Parameter {
    return { name, type, required: true }
}

function makeCompatibleMatch(overrides: Partial<FunctionMatch> = {}): FunctionMatch {
    return {
        kind: 'compatible',
        interfaceId: 'UserService',
        functionId: 'getUser',
        functionUuid: 'fn-uuid-1',
        oldParams: [makeParam('id')],
        newParams: [makeParam('id'), makeParam('options', 'object')],
        affectedDiagramUuids: ['diag-uuid-1'],
        ...overrides,
    }
}

function makeIncompatibleMatch(overrides: Partial<FunctionMatch> = {}): FunctionMatch {
    return {
        kind: 'incompatible',
        interfaceId: 'OrderService',
        functionId: 'createOrder',
        functionUuid: 'fn-uuid-2',
        oldParams: [makeParam('amount', 'number')],
        newParams: [makeParam('payload', 'object')],
        affectedDiagramUuids: ['diag-uuid-2'],
        ...overrides,
    }
}

const defaultSeqDiagrams = [
    { uuid: 'diag-uuid-1', name: 'User Flow' },
    { uuid: 'diag-uuid-2', name: 'Order Flow' },
]

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    vi.clearAllMocks()
})

describe('FunctionUpdateDialog', () => {
    describe('rendering', () => {
        it('renders the dialog title', () => {
            render(
                <FunctionUpdateDialog
                    matches={[makeCompatibleMatch()]}
                    seqDiagrams={defaultSeqDiagrams}
                    onResolve={vi.fn()}
                    onCancel={vi.fn()}
                />
            )
            expect(screen.getByText('Function Definition Conflict')).toBeInTheDocument()
        })

        it('shows the interface and function ids for a compatible match', () => {
            render(
                <FunctionUpdateDialog
                    matches={[makeCompatibleMatch()]}
                    seqDiagrams={defaultSeqDiagrams}
                    onResolve={vi.fn()}
                    onCancel={vi.fn()}
                />
            )
            expect(screen.getByText('UserService:getUser')).toBeInTheDocument()
        })

        it('shows the interface and function ids for an incompatible match', () => {
            render(
                <FunctionUpdateDialog
                    matches={[makeIncompatibleMatch()]}
                    seqDiagrams={defaultSeqDiagrams}
                    onResolve={vi.fn()}
                    onCancel={vi.fn()}
                />
            )
            expect(screen.getByText('OrderService:createOrder')).toBeInTheDocument()
        })

        it('renders the old signature with strikethrough styling', () => {
            render(
                <FunctionUpdateDialog
                    matches={[makeCompatibleMatch()]}
                    seqDiagrams={defaultSeqDiagrams}
                    onResolve={vi.fn()}
                    onCancel={vi.fn()}
                />
            )
            // paramsToString uses "name: type" format
            const oldSig = screen.getByText(/UserService:getUser\(id: string\)/)
            expect(oldSig).toHaveClass('line-through')
        })

        it('renders the new signature without strikethrough', () => {
            render(
                <FunctionUpdateDialog
                    matches={[makeCompatibleMatch()]}
                    seqDiagrams={defaultSeqDiagrams}
                    onResolve={vi.fn()}
                    onCancel={vi.fn()}
                />
            )
            // new signature has additional options param
            const newSig = screen.getByText(/UserService:getUser\(id: string, options: object\)/)
            expect(newSig).not.toHaveClass('line-through')
        })

        it("shows affected diagram names for compatible match when 'update existing' is chosen", async () => {
            const user = userEvent.setup()
            render(
                <FunctionUpdateDialog
                    matches={[makeCompatibleMatch()]}
                    seqDiagrams={defaultSeqDiagrams}
                    onResolve={vi.fn()}
                    onCancel={vi.fn()}
                />
            )
            // Select "Update existing" radio to reveal affected diagrams
            await user.click(screen.getByLabelText('Update existing'))
            expect(screen.getByText('User Flow')).toBeInTheDocument()
        })

        it('always shows affected diagrams for incompatible matches', () => {
            render(
                <FunctionUpdateDialog
                    matches={[makeIncompatibleMatch()]}
                    seqDiagrams={defaultSeqDiagrams}
                    onResolve={vi.fn()}
                    onCancel={vi.fn()}
                />
            )
            expect(screen.getByText('Order Flow')).toBeInTheDocument()
        })

        it('renders both compatible and incompatible matches together', () => {
            render(
                <FunctionUpdateDialog
                    matches={[makeCompatibleMatch(), makeIncompatibleMatch()]}
                    seqDiagrams={defaultSeqDiagrams}
                    onResolve={vi.fn()}
                    onCancel={vi.fn()}
                />
            )
            expect(screen.getByText('UserService:getUser')).toBeInTheDocument()
            expect(screen.getByText('OrderService:createOrder')).toBeInTheDocument()
        })
    })

    describe('Cancel button', () => {
        it('calls onCancel when Cancel is clicked', async () => {
            const user = userEvent.setup()
            const onCancel = vi.fn()
            render(
                <FunctionUpdateDialog
                    matches={[makeCompatibleMatch()]}
                    seqDiagrams={defaultSeqDiagrams}
                    onResolve={vi.fn()}
                    onCancel={onCancel}
                />
            )
            await user.click(screen.getByText('Cancel'))
            expect(onCancel).toHaveBeenCalledTimes(1)
        })

        it('does not call onResolve when Cancel is clicked', async () => {
            const user = userEvent.setup()
            const onResolve = vi.fn()
            render(
                <FunctionUpdateDialog
                    matches={[makeCompatibleMatch()]}
                    seqDiagrams={defaultSeqDiagrams}
                    onResolve={onResolve}
                    onCancel={vi.fn()}
                />
            )
            await user.click(screen.getByText('Cancel'))
            expect(onResolve).not.toHaveBeenCalled()
        })
    })

    describe('Apply button', () => {
        it('calls onResolve when Apply is clicked', async () => {
            const user = userEvent.setup()
            const onResolve = vi.fn()
            render(
                <FunctionUpdateDialog
                    matches={[makeCompatibleMatch()]}
                    seqDiagrams={defaultSeqDiagrams}
                    onResolve={onResolve}
                    onCancel={vi.fn()}
                />
            )
            await user.click(screen.getByText('Apply'))
            expect(onResolve).toHaveBeenCalledTimes(1)
        })

        it("resolves compatible match with default 'add-new' action", async () => {
            const user = userEvent.setup()
            const onResolve = vi.fn()
            const match = makeCompatibleMatch()
            render(
                <FunctionUpdateDialog
                    matches={[match]}
                    seqDiagrams={defaultSeqDiagrams}
                    onResolve={onResolve}
                    onCancel={vi.fn()}
                />
            )
            await user.click(screen.getByText('Apply'))
            expect(onResolve).toHaveBeenCalledWith([
                expect.objectContaining({ action: 'add-new', functionId: 'getUser' }),
            ])
        })

        it("resolves compatible match with 'update-existing' action when selected", async () => {
            const user = userEvent.setup()
            const onResolve = vi.fn()
            const match = makeCompatibleMatch()
            render(
                <FunctionUpdateDialog
                    matches={[match]}
                    seqDiagrams={defaultSeqDiagrams}
                    onResolve={onResolve}
                    onCancel={vi.fn()}
                />
            )
            await user.click(screen.getByLabelText('Update existing'))
            await user.click(screen.getByText('Apply'))
            expect(onResolve).toHaveBeenCalledWith([
                expect.objectContaining({ action: 'update-existing', functionId: 'getUser' }),
            ])
        })

        it("resolves incompatible match with 'update-all' action", async () => {
            const user = userEvent.setup()
            const onResolve = vi.fn()
            const match = makeIncompatibleMatch()
            render(
                <FunctionUpdateDialog
                    matches={[match]}
                    seqDiagrams={defaultSeqDiagrams}
                    onResolve={onResolve}
                    onCancel={vi.fn()}
                />
            )
            await user.click(screen.getByText('Apply'))
            expect(onResolve).toHaveBeenCalledWith([
                expect.objectContaining({ action: 'update-all', functionId: 'createOrder' }),
            ])
        })

        it('resolves mixed matches with their respective actions', async () => {
            const user = userEvent.setup()
            const onResolve = vi.fn()
            render(
                <FunctionUpdateDialog
                    matches={[makeCompatibleMatch(), makeIncompatibleMatch()]}
                    seqDiagrams={defaultSeqDiagrams}
                    onResolve={onResolve}
                    onCancel={vi.fn()}
                />
            )
            await user.click(screen.getByText('Apply'))
            const decisions = onResolve.mock.calls[0][0] as Array<{
                action: string
                functionId: string
            }>
            expect(decisions).toHaveLength(2)
            expect(decisions.find((d) => d.functionId === 'getUser')?.action).toBe('add-new')
            expect(decisions.find((d) => d.functionId === 'createOrder')?.action).toBe('update-all')
        })
    })

    describe('radio buttons for compatible matches', () => {
        it('renders Add new definition and Update existing radio options', () => {
            render(
                <FunctionUpdateDialog
                    matches={[makeCompatibleMatch()]}
                    seqDiagrams={defaultSeqDiagrams}
                    onResolve={vi.fn()}
                    onCancel={vi.fn()}
                />
            )
            expect(screen.getByLabelText('Add new definition')).toBeInTheDocument()
            expect(screen.getByLabelText('Update existing')).toBeInTheDocument()
        })

        it("'Add new definition' is checked by default", () => {
            render(
                <FunctionUpdateDialog
                    matches={[makeCompatibleMatch()]}
                    seqDiagrams={defaultSeqDiagrams}
                    onResolve={vi.fn()}
                    onCancel={vi.fn()}
                />
            )
            expect(screen.getByLabelText('Add new definition')).toBeChecked()
            expect(screen.getByLabelText('Update existing')).not.toBeChecked()
        })

        it("clicking 'Update existing' checks it and unchecks 'Add new'", async () => {
            const user = userEvent.setup()
            render(
                <FunctionUpdateDialog
                    matches={[makeCompatibleMatch()]}
                    seqDiagrams={defaultSeqDiagrams}
                    onResolve={vi.fn()}
                    onCancel={vi.fn()}
                />
            )
            await user.click(screen.getByLabelText('Update existing'))
            expect(screen.getByLabelText('Update existing')).toBeChecked()
            expect(screen.getByLabelText('Add new definition')).not.toBeChecked()
        })
    })
})
