import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FunctionUpdateDialog } from './FunctionUpdateDialog'
import type { FunctionMatch } from '../parser/sequenceDiagram/systemUpdater'
import type { Parameter } from '../store/types'

function makeParam(name: string, type = 'string'): Parameter {
    return { name, type, required: true }
}

function makeChangedMatch(overrides: Partial<FunctionMatch> = {}): FunctionMatch {
    return {
        kind: 'incompatible',
        interfaceId: 'UserService',
        functionId: 'getUser',
        functionUuid: 'fn-uuid-1',
        oldParams: [makeParam('id')],
        newParams: [makeParam('id'), makeParam('options', 'object')],
        affectedDiagramUuids: ['diag-uuid-1'],
        ...overrides,
    }
}

function makeRedundantMatch(overrides: Partial<FunctionMatch> = {}): FunctionMatch {
    return {
        kind: 'redundant',
        interfaceId: 'OrderService',
        functionId: 'createOrder',
        functionUuid: 'fn-uuid-2',
        oldParams: [makeParam('payload', 'object')],
        newParams: [makeParam('payload', 'object')],
        affectedDiagramUuids: ['diag-uuid-2'],
        ...overrides,
    }
}

function makeParentAddMatch(overrides: Partial<FunctionMatch> = {}): FunctionMatch {
    return {
        kind: 'parent-add-conflict',
        parentComponentUuid: 'parent-comp-uuid',
        parentInterfaceUuid: 'parent-iface-uuid',
        interfaceId: 'PaymentAPI',
        functionId: 'charge',
        newParams: [makeParam('amount', 'number'), makeParam('currency')],
        conflictingChildFunctions: [
            {
                componentUuid: 'child-comp-uuid',
                componentName: 'PaymentGateway',
                interfaceUuid: 'child-iface-uuid',
                interfaceId: 'PaymentAPI',
                functionUuid: 'child-fn-uuid',
                functionId: 'charge',
            },
        ],
        affectedDiagramUuids: ['diag-uuid-3'],
        ...overrides,
    }
}

const defaultSeqDiagrams = [
    { uuid: 'diag-uuid-1', name: 'User Flow' },
    { uuid: 'diag-uuid-2', name: 'Order Flow' },
    { uuid: 'diag-uuid-3', name: 'Payment Flow' },
]

beforeEach(() => {
    vi.clearAllMocks()
})

describe('FunctionUpdateDialog', () => {
    it('renders changed function signatures and affected diagrams', () => {
        render(
            <FunctionUpdateDialog
                matches={[makeChangedMatch()]}
                seqDiagrams={defaultSeqDiagrams}
                onResolve={vi.fn()}
                onCancel={vi.fn()}
            />
        )

        expect(screen.getByText('Function Definition Conflict')).toBeInTheDocument()
        expect(screen.getByText('UserService:getUser')).toBeInTheDocument()
        expect(screen.getByText('User Flow')).toBeInTheDocument()
        expect(screen.queryByLabelText('Add new definition')).not.toBeInTheDocument()
        expect(screen.queryByLabelText('Update existing')).not.toBeInTheDocument()
    })

    it('renders redundant inherited matches', () => {
        render(
            <FunctionUpdateDialog
                matches={[makeRedundantMatch()]}
                seqDiagrams={defaultSeqDiagrams}
                onResolve={vi.fn()}
                onCancel={vi.fn()}
            />
        )

        expect(screen.getByText(/now matches an inherited parent function/i)).toBeInTheDocument()
        expect(screen.getByText('Order Flow')).toBeInTheDocument()
    })

    it('calls onCancel when Cancel is clicked', async () => {
        const user = userEvent.setup()
        const onCancel = vi.fn()
        render(
            <FunctionUpdateDialog
                matches={[makeChangedMatch()]}
                seqDiagrams={defaultSeqDiagrams}
                onResolve={vi.fn()}
                onCancel={onCancel}
            />
        )

        await user.click(screen.getByText('Cancel'))

        expect(onCancel).toHaveBeenCalledTimes(1)
    })

    it('resolves changed matches with update-existing', async () => {
        const user = userEvent.setup()
        const onResolve = vi.fn()
        render(
            <FunctionUpdateDialog
                matches={[makeChangedMatch()]}
                seqDiagrams={defaultSeqDiagrams}
                onResolve={onResolve}
                onCancel={vi.fn()}
            />
        )

        await user.click(screen.getByText('Apply'))

        expect(onResolve).toHaveBeenCalledWith([
            expect.objectContaining({ action: 'update-existing', functionId: 'getUser' }),
        ])
    })

    it('resolves redundant matches with remove-redundant', async () => {
        const user = userEvent.setup()
        const onResolve = vi.fn()
        render(
            <FunctionUpdateDialog
                matches={[makeRedundantMatch()]}
                seqDiagrams={defaultSeqDiagrams}
                onResolve={onResolve}
                onCancel={vi.fn()}
            />
        )

        await user.click(screen.getByText('Apply'))

        expect(onResolve).toHaveBeenCalledWith([
            expect.objectContaining({ action: 'remove-redundant', functionId: 'createOrder' }),
        ])
    })

    it('renders parent-add-conflict matches with new signature and conflicting child list', () => {
        render(
            <FunctionUpdateDialog
                matches={[makeParentAddMatch()]}
                seqDiagrams={defaultSeqDiagrams}
                onResolve={vi.fn()}
                onCancel={vi.fn()}
            />
        )

        expect(screen.getByText('Function Definition Conflict')).toBeInTheDocument()
        expect(screen.getByText('PaymentAPI:charge')).toBeInTheDocument()
        expect(screen.getByText(/will be added to the parent interface/i)).toBeInTheDocument()
        // New signature shown
        expect(
            screen.getByText(/PaymentAPI:charge\(amount: number, currency: string\)/)
        ).toBeInTheDocument()
        // Conflicting child interface listed
        expect(screen.getByText(/PaymentGateway/)).toBeInTheDocument()
        // Affected diagram listed
        expect(screen.getByText('Payment Flow')).toBeInTheDocument()
    })

    it('resolves parent-add-conflict matches with apply-parent-add action', async () => {
        const user = userEvent.setup()
        const onResolve = vi.fn()
        render(
            <FunctionUpdateDialog
                matches={[makeParentAddMatch()]}
                seqDiagrams={defaultSeqDiagrams}
                onResolve={onResolve}
                onCancel={vi.fn()}
            />
        )

        await user.click(screen.getByText('Apply'))

        expect(onResolve).toHaveBeenCalledWith([
            expect.objectContaining({ action: 'apply-parent-add', functionId: 'charge' }),
        ])
    })

    it('calls onCancel without emitting decisions for parent-add-conflict when Cancel is clicked', async () => {
        const user = userEvent.setup()
        const onCancel = vi.fn()
        const onResolve = vi.fn()
        render(
            <FunctionUpdateDialog
                matches={[makeParentAddMatch()]}
                seqDiagrams={defaultSeqDiagrams}
                onResolve={onResolve}
                onCancel={onCancel}
            />
        )

        await user.click(screen.getByText('Cancel'))

        expect(onCancel).toHaveBeenCalledTimes(1)
        expect(onResolve).not.toHaveBeenCalled()
    })

    it('resolves mixed matches with their respective actions', async () => {
        const user = userEvent.setup()
        const onResolve = vi.fn()
        render(
            <FunctionUpdateDialog
                matches={[makeChangedMatch(), makeRedundantMatch()]}
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
        expect(decisions.find((d) => d.functionId === 'getUser')?.action).toBe('update-existing')
        expect(decisions.find((d) => d.functionId === 'createOrder')?.action).toBe(
            'remove-redundant'
        )
    })
})
