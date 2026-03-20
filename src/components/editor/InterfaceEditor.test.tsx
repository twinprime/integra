// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ResolvedInterface } from '../../utils/interfaceFunctions'
import { InterfaceEditor } from './InterfaceEditor'

vi.mock('../../store/useSystemStore', () => ({
    useSystemStore: vi.fn(() => ({
        rootComponent: {
            uuid: 'root-uuid',
            id: 'root',
            name: 'Root',
            type: 'component',
            subComponents: [],
            actors: [],
            useCaseDiagrams: [],
            interfaces: [],
        },
        renameNodeId: vi.fn(),
    })),
    getSequenceDiagrams: vi.fn(() => []),
}))

vi.mock('./DescriptionField', () => ({
    DescriptionField: ({
        value,
        onChange,
        readOnly,
    }: {
        value: string
        onChange: (value: string) => void
        readOnly?: boolean
    }) => (
        <textarea
            aria-label="Description"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            readOnly={readOnly}
        />
    ),
}))

vi.mock('./NodeReferencesButton', () => ({
    NodeReferencesButton: () => null,
}))

const noop = vi.fn()

function buildInheritedInterface(): ResolvedInterface {
    return {
        uuid: 'child-api-iface-uuid',
        id: 'API',
        name: 'API',
        type: 'rest',
        kind: 'inherited',
        parentInterfaceUuid: 'parent-api-iface-uuid',
        description: '',
        functions: [
            {
                uuid: 'child-fn-uuid',
                id: 'childOnly',
                parameters: [],
            },
        ],
        localFunctions: [
            {
                uuid: 'child-fn-uuid',
                id: 'childOnly',
                parameters: [],
            },
        ],
        inheritedFunctions: [
            {
                uuid: 'parent-fn-uuid',
                id: 'doThing',
                parameters: [],
            },
        ],
        effectiveFunctions: [
            {
                uuid: 'child-fn-uuid',
                id: 'childOnly',
                parameters: [],
            },
            {
                uuid: 'parent-fn-uuid',
                id: 'doThing',
                parameters: [],
            },
        ],
        inheritedFrom: {
            uuid: 'parent-api-iface-uuid',
            id: 'API',
            name: 'API',
            type: 'rest',
            kind: 'local',
            functions: [
                {
                    uuid: 'parent-fn-uuid',
                    id: 'doThing',
                    parameters: [],
                },
            ],
        },
        isDangling: false,
    }
}

describe('InterfaceEditor', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('renders inherited functions as read-only and child-added functions as editable', () => {
        render(
            <InterfaceEditor
                iface={buildInheritedInterface()}
                ifaceIdx={0}
                referencedFunctionUuids={new Set()}
                siblingInterfaceIds={[]}
                onInterfaceUpdate={noop}
                onFunctionUpdate={noop}
                onDeleteFunction={noop}
                onFunctionRenameAttempt={noop}
                onParamDescriptionUpdate={noop}
            />
        )

        expect(screen.getByText('Inherited functions (1)')).toBeInTheDocument()
        expect(screen.getByText('Child-added functions (1)')).toBeInTheDocument()
        expect(screen.getByText('doThing')).toBeInTheDocument()

        const editableInputs = screen.getAllByLabelText('Function ID')
        expect(editableInputs).toHaveLength(1)
        expect(editableInputs[0]).toHaveValue('childOnly')
    })
})
