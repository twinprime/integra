import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ComponentEditor } from './ComponentEditor'
import type { ComponentNode, InterfaceSpecification } from '../../store/types'
import type { SystemState } from '../../store/useSystemStore'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../store/useSystemStore', () => ({
    useSystemStore: vi.fn(),
}))

vi.mock('./MarkdownEditor', () => ({
    MarkdownEditor: ({
        value,
        onChange,
        onBlur,
        placeholder,
        previewOnly,
        onPreviewClick,
    }: {
        value: string
        onChange: (v: string) => void
        onBlur?: () => void
        placeholder?: string
        previewOnly?: boolean
        onPreviewClick?: () => void
    }) =>
        previewOnly ? (
            <button data-testid="markdown-preview" onClick={onPreviewClick}>
                {value || 'No Description'}
            </button>
        ) : (
            <textarea
                data-testid="markdown-editor"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur}
                placeholder={placeholder}
            />
        ),
}))

vi.mock('./NodeReferencesButton', () => ({
    NodeReferencesButton: () => null,
}))

// Stub InterfaceEditor to avoid deep rendering complexity
vi.mock('./InterfaceEditor', () => ({
    InterfaceEditor: ({ iface }: { iface: { uuid: string; name: string } }) => (
        <div data-testid={`interface-editor-${iface.uuid}`}>{iface.name}</div>
    ),
}))

vi.mock('../../nodes/nodeTree', () => ({
    getNodeSiblingIds: vi.fn(() => []),
    findParentNode: vi.fn(() => null),
    collectAllDiagrams: vi.fn(() => []),
}))

vi.mock('../../utils/nodeUtils', () => ({
    findReferencingDiagrams: vi.fn(() => []),
    getNodeAbsolutePath: vi.fn(() => ''),
    getNodeAbsolutePathSegments: vi.fn(() => []),
    findNearestComponentAncestor: vi.fn(() => null),
    getComponentAbsolutePath: vi.fn(() => ''),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

import { useSystemStore } from '../../store/useSystemStore'
import { getNodeAbsolutePath, getNodeAbsolutePathSegments } from '../../utils/nodeUtils'
import { findParentNode } from '../../nodes/nodeTree'

const mockRenameNodeId = vi.fn()
const mockSelectNode = vi.fn()
const mockSelectInterface = vi.fn()
const makeOnUpdate = () => vi.fn<(updates: Partial<ComponentNode>) => void>()

const mockRootComponent: ComponentNode = {
    uuid: 'root-uuid',
    id: 'root',
    name: 'Root',
    type: 'component',
    subComponents: [],
    actors: [],
    useCaseDiagrams: [],
    interfaces: [],
}

function setupStoreMock(selectedInterfaceUuid: string | null = null) {
    const state = {
        rootComponent: mockRootComponent,
        renameNodeId: mockRenameNodeId,
        selectNode: mockSelectNode,
        selectedInterfaceUuid,
        selectInterface: mockSelectInterface,
    }
    vi.mocked(useSystemStore).mockImplementation((selector: (s: SystemState) => unknown) =>
        selector(state as unknown as SystemState)
    )
}

function makeInterface(
    id: string,
    name: string,
    overrides: Partial<InterfaceSpecification> = {}
): InterfaceSpecification {
    if ('parentInterfaceUuid' in overrides && overrides.parentInterfaceUuid) {
        return {
            uuid: `iface-uuid-${id}`,
            id,
            name,
            type: 'rest',
            kind: 'inherited',
            parentInterfaceUuid: overrides.parentInterfaceUuid,
            functions: [],
            description: overrides.description,
        }
    }
    const localOverrides = overrides as Partial<Extract<InterfaceSpecification, { kind?: 'local' }>>
    return {
        uuid: `iface-uuid-${id}`,
        id,
        name,
        type: 'rest',
        kind: 'local',
        functions: [],
        ...localOverrides,
    }
}

function makeFunction(
    id: string,
    parameters: Array<{ name: string; type?: string; required?: boolean }>
) {
    return {
        uuid: `fn-uuid-${id}-${parameters.map((param) => param.name).join('-') || 'none'}`,
        id,
        parameters: parameters.map((param) => ({
            name: param.name,
            type: param.type ?? 'string',
            required: param.required ?? true,
        })),
    }
}

function makeComponentNode(overrides: Partial<ComponentNode> = {}): ComponentNode {
    return {
        uuid: 'comp-uuid-1',
        id: 'myComp',
        name: 'My Component',
        type: 'component',
        subComponents: [],
        actors: [],
        useCaseDiagrams: [],
        interfaces: [],
        description: '',
        ...overrides,
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    vi.clearAllMocks()
    setupStoreMock()
    vi.mocked(findParentNode).mockReturnValue(null)
})

describe('ComponentEditor', () => {
    describe('rendering', () => {
        it('renders the component name in the panel title editor', () => {
            const node = makeComponentNode({ name: 'My Component' })
            render(<ComponentEditor node={node} onUpdate={vi.fn()} />)
            expect(screen.getByLabelText('Node name')).toHaveValue('My Component')
        })

        it('renders the component name as an inline panel title editor without a separate Name field', () => {
            const node = makeComponentNode({ name: 'Service A' })
            render(<ComponentEditor node={node} onUpdate={vi.fn()} />)

            expect(screen.getByLabelText('Node name')).toHaveValue('Service A')
            expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
        })

        it('renders the node type badge', () => {
            const node = makeComponentNode()
            render(<ComponentEditor node={node} onUpdate={vi.fn()} />)
            expect(screen.getByText('component')).toBeInTheDocument()
        })

        it('renders the panel title editor pre-filled', () => {
            const node = makeComponentNode({ name: 'Service A' })
            render(<ComponentEditor node={node} onUpdate={vi.fn()} />)
            expect(screen.getByLabelText('Node name')).toHaveValue('Service A')
        })

        it('renders the ID input pre-filled', () => {
            const node = makeComponentNode({ id: 'serviceA' })
            render(<ComponentEditor node={node} onUpdate={vi.fn()} />)
            expect(screen.getByDisplayValue('serviceA')).toBeInTheDocument()
        })

        it('renders ancestor path segments for components', async () => {
            const user = userEvent.setup()
            vi.mocked(getNodeAbsolutePath).mockReturnValue('System/AuthService')
            vi.mocked(getNodeAbsolutePathSegments).mockReturnValue([
                { uuid: 'root-uuid', id: 'System' },
                { uuid: 'comp-uuid-1', id: 'AuthService' },
            ])

            render(
                <ComponentEditor
                    node={makeComponentNode({ id: 'AuthService' })}
                    onUpdate={vi.fn()}
                />
            )

            expect(screen.getByTestId('node-path')).toHaveAttribute('title', 'System/AuthService')
            await user.click(screen.getByRole('button', { name: 'System' }))
            expect(mockSelectNode).toHaveBeenCalledWith('root-uuid')
        })

        it('shows description in preview mode initially without a label', () => {
            const node = makeComponentNode({ description: 'Component description' })
            render(<ComponentEditor node={node} onUpdate={vi.fn()} />)

            expect(screen.getByTestId('markdown-preview')).toHaveTextContent(
                'Component description'
            )
            expect(screen.queryByTestId('markdown-editor')).not.toBeInTheDocument()
            expect(screen.queryByText('Description')).not.toBeInTheDocument()
        })
    })

    describe('interface tabs', () => {
        it('renders a tab for each interface', () => {
            const node = makeComponentNode({
                interfaces: [makeInterface('api', 'API'), makeInterface('events', 'Events')],
            })
            render(<ComponentEditor node={node} onUpdate={vi.fn()} />)
            expect(screen.getByTestId('interface-tab-api')).toBeInTheDocument()
            expect(screen.getByTestId('interface-tab-events')).toBeInTheDocument()
        })

        it('renders the first interface panel by default', () => {
            const node = makeComponentNode({
                interfaces: [makeInterface('api', 'API'), makeInterface('events', 'Events')],
            })
            render(<ComponentEditor node={node} onUpdate={vi.fn()} />)
            // The first tab panel should be visible
            expect(screen.getByTestId('interface-editor-iface-uuid-api')).toBeInTheDocument()
        })

        it('clicking a tab switches to that interface panel', async () => {
            const user = userEvent.setup()
            const node = makeComponentNode({
                interfaces: [makeInterface('api', 'API'), makeInterface('events', 'Events')],
            })
            render(<ComponentEditor node={node} onUpdate={vi.fn()} />)

            await user.click(screen.getByTestId('interface-tab-events'))

            expect(screen.getByTestId('interface-editor-iface-uuid-events')).toBeInTheDocument()
            expect(screen.queryByTestId('interface-editor-iface-uuid-api')).not.toBeInTheDocument()
        })

        it('shows interface count badge', () => {
            const node = makeComponentNode({
                interfaces: [makeInterface('a', 'A'), makeInterface('b', 'B')],
            })
            render(<ComponentEditor node={node} onUpdate={vi.fn()} />)
            expect(screen.getByText('2')).toBeInTheDocument()
        })

        it('shows strikethrough in the tab label for deletable interfaces', () => {
            const node = makeComponentNode({
                interfaces: [makeInterface('api', 'API', { functions: [] })],
            })

            render(<ComponentEditor node={node} onUpdate={vi.fn()} />)

            expect(screen.getByTestId('interface-tab-label-api')).toHaveClass('line-through')
        })

        it('renders nothing when interfaces list is empty', () => {
            const node = makeComponentNode({ interfaces: [] })
            render(<ComponentEditor node={node} onUpdate={vi.fn()} />)
            expect(screen.queryByText('Interface Specifications')).not.toBeInTheDocument()
        })
    })

    describe('name editing', () => {
        it('calls onUpdate with new name on blur', async () => {
            const user = userEvent.setup()
            const onUpdate = vi.fn()
            const node = makeComponentNode({ name: 'Old Name' })
            render(<ComponentEditor node={node} onUpdate={onUpdate} />)

            const nameInput = screen.getByDisplayValue('Old Name')
            await user.clear(nameInput)
            await user.type(nameInput, 'New Name')
            await user.tab()

            expect(onUpdate).toHaveBeenCalledWith({ name: 'New Name' })
        })

        it('reverts to original name when empty name is blurred', async () => {
            const user = userEvent.setup()
            const onUpdate = vi.fn()
            const node = makeComponentNode({ name: 'My Component' })
            render(<ComponentEditor node={node} onUpdate={onUpdate} />)

            const nameInput = screen.getByDisplayValue('My Component')
            await user.clear(nameInput)
            await user.tab()

            expect(onUpdate).not.toHaveBeenCalled()
            expect(screen.getByDisplayValue('My Component')).toBeInTheDocument()
        })
    })

    describe('inherit parent interface selector', () => {
        it('does not render the inherit selector for a root component (no parent)', () => {
            vi.mocked(findParentNode).mockReturnValue(null)
            const node = makeComponentNode()
            render(<ComponentEditor node={node} onUpdate={vi.fn()} />)
            expect(screen.queryByTestId('inherit-parent-select')).not.toBeInTheDocument()
        })

        it('renders the inherit selector when parent has uninherited interfaces', () => {
            const parentIface = makeInterface('parentApi', 'Parent API')
            const parentNode = makeComponentNode({
                uuid: 'parent-uuid',
                id: 'parent',
                name: 'Parent',
                interfaces: [parentIface],
            })
            vi.mocked(findParentNode).mockReturnValue(parentNode)

            // child has no interfaces, so parentApi is uninherited
            const childNode = makeComponentNode({ interfaces: [] })
            render(<ComponentEditor node={childNode} onUpdate={vi.fn()} />)

            expect(screen.getByTestId('inherit-parent-select')).toBeInTheDocument()
            expect(screen.getByText('Parent API')).toBeInTheDocument()
        })

        it('hides the inherit selector in read-only mode', () => {
            const parentIface = makeInterface('parentApi', 'Parent API')
            const parentNode = makeComponentNode({
                uuid: 'parent-uuid',
                id: 'parent',
                name: 'Parent',
                interfaces: [parentIface],
            })
            vi.mocked(findParentNode).mockReturnValue(parentNode)

            render(
                <ComponentEditor node={makeComponentNode()} onUpdate={vi.fn()} readOnly={true} />
            )

            expect(screen.queryByTestId('inherit-parent-select')).not.toBeInTheDocument()
        })

        it('does not render the inherit selector when all parent interfaces are already inherited', () => {
            const parentIface = makeInterface('parentApi', 'Parent API')
            const parentNode = makeComponentNode({
                uuid: 'parent-uuid',
                id: 'parent',
                name: 'Parent',
                interfaces: [parentIface],
            })
            vi.mocked(findParentNode).mockReturnValue(parentNode)

            // child already inherits parentApi
            const childNode = makeComponentNode({
                interfaces: [
                    makeInterface('parentApi', 'Parent API', {
                        parentInterfaceUuid: parentIface.uuid,
                    }),
                ],
            })
            render(<ComponentEditor node={childNode} onUpdate={vi.fn()} />)

            expect(screen.queryByTestId('inherit-parent-select')).not.toBeInTheDocument()
        })

        it('calls onUpdate with new inherited interface when selector changes', async () => {
            const user = userEvent.setup()
            const onUpdate = makeOnUpdate()
            const parentIface = makeInterface('parentApi', 'Parent API')
            const parentNode = makeComponentNode({
                uuid: 'parent-uuid',
                id: 'parent',
                name: 'Parent',
                interfaces: [parentIface],
            })
            vi.mocked(findParentNode).mockReturnValue(parentNode)

            const childNode = makeComponentNode({ interfaces: [] })
            render(<ComponentEditor node={childNode} onUpdate={onUpdate} />)

            await user.selectOptions(screen.getByTestId('inherit-parent-select'), parentIface.uuid)

            expect(onUpdate).toHaveBeenCalledTimes(1)
            const [updates] = onUpdate.mock.calls[0]
            expect(updates.interfaces).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        parentInterfaceUuid: parentIface.uuid,
                        id: 'parentApi',
                    }),
                ])
            )
        })

        it('prompts before merging when a same-id child interface already exists', async () => {
            const user = userEvent.setup()
            const onUpdate = makeOnUpdate()
            const parentIface = makeInterface('parentApi', 'Parent API')
            const parentNode = makeComponentNode({
                uuid: 'parent-uuid',
                id: 'parent',
                name: 'Parent',
                interfaces: [parentIface],
            })
            vi.mocked(findParentNode).mockReturnValue(parentNode)

            const childNode = makeComponentNode({
                interfaces: [
                    makeInterface('parentApi', 'Existing Parent API', {
                        functions: [makeFunction('keepLocal', [{ name: 'id' }])],
                    }),
                ],
            })
            render(<ComponentEditor node={childNode} onUpdate={onUpdate} />)

            await user.selectOptions(screen.getByTestId('inherit-parent-select'), parentIface.uuid)

            expect(onUpdate).not.toHaveBeenCalled()
            expect(screen.getByText('Merge with existing interface?')).toBeInTheDocument()
        })

        it('merges into the existing interface when confirmed and keeps only non-matching child functions', async () => {
            const user = userEvent.setup()
            const onUpdate = makeOnUpdate()
            const parentIface = makeInterface('parentApi', 'Parent API', {
                functions: [makeFunction('syncUser', [{ name: 'userId', type: 'string' }])],
            })
            const parentNode = makeComponentNode({
                uuid: 'parent-uuid',
                id: 'parent',
                name: 'Parent',
                interfaces: [parentIface],
            })
            vi.mocked(findParentNode).mockReturnValue(parentNode)

            const existingInterface = makeInterface('parentApi', 'Existing Parent API', {
                functions: [
                    makeFunction('syncUser', [{ name: 'userId', type: 'string' }]),
                    makeFunction('keepLocal', [{ name: 'id', type: 'string' }]),
                ],
            })
            const childNode = makeComponentNode({
                interfaces: [existingInterface],
            })
            render(<ComponentEditor node={childNode} onUpdate={onUpdate} />)

            await user.selectOptions(screen.getByTestId('inherit-parent-select'), parentIface.uuid)
            await user.click(screen.getByText('Merge interface'))

            expect(onUpdate).toHaveBeenCalledTimes(1)
            const [updates] = onUpdate.mock.calls[0]
            expect(updates.interfaces).toEqual([
                expect.objectContaining({
                    uuid: existingInterface.uuid,
                    kind: 'inherited',
                    id: 'parentApi',
                    name: 'Parent API',
                    parentInterfaceUuid: parentIface.uuid,
                    functions: [
                        expect.objectContaining({
                            id: 'keepLocal',
                        }),
                    ],
                }),
            ])
        })

        it('shows an error prompt and cancels inheritance when existing functions are incompatible', async () => {
            const user = userEvent.setup()
            const onUpdate = makeOnUpdate()
            const parentIface = makeInterface('parentApi', 'Parent API', {
                functions: [makeFunction('syncUser', [{ name: 'userId', type: 'string' }])],
            })
            const parentNode = makeComponentNode({
                uuid: 'parent-uuid',
                id: 'parent',
                name: 'Parent',
                interfaces: [parentIface],
            })
            vi.mocked(findParentNode).mockReturnValue(parentNode)

            const childNode = makeComponentNode({
                interfaces: [
                    makeInterface('parentApi', 'Existing Parent API', {
                        functions: [makeFunction('syncUser', [{ name: 'id', type: 'string' }])],
                    }),
                ],
            })
            render(<ComponentEditor node={childNode} onUpdate={onUpdate} />)

            await user.selectOptions(screen.getByTestId('inherit-parent-select'), parentIface.uuid)

            expect(onUpdate).not.toHaveBeenCalled()
            expect(screen.getByText('Cannot inherit interface')).toBeInTheDocument()
            expect(screen.getByText('Existing: syncUser(id: string)')).toBeInTheDocument()
            expect(screen.getByText('Inherited: syncUser(userId: string)')).toBeInTheDocument()
        })
    })

    describe('ID editing', () => {
        it('shows error for invalid ID format while typing', async () => {
            const user = userEvent.setup()
            const node = makeComponentNode({ id: 'validId' })
            render(<ComponentEditor node={node} onUpdate={vi.fn()} />)

            const idInput = screen.getByLabelText('Node ID')
            await user.clear(idInput)
            await user.type(idInput, '1invalid')
            // Error shown during typing; blur will revert and clear it
            expect(
                screen.getByText(
                    'ID must start with a letter or _ and contain only letters, digits, or _'
                )
            ).toBeInTheDocument()
        })

        it('calls renameNodeId on valid ID blur', async () => {
            const user = userEvent.setup()
            const node = makeComponentNode({ id: 'oldId' })
            render(<ComponentEditor node={node} onUpdate={vi.fn()} />)

            const idInput = screen.getByLabelText('Node ID')
            await user.clear(idInput)
            await user.type(idInput, 'newId')
            await user.tab()

            expect(mockRenameNodeId).toHaveBeenCalledWith('comp-uuid-1', 'newId')
        })
    })
})
