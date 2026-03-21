import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommonEditor } from './CommonEditor'
import type { ActorNode } from '../../store/types'
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

vi.mock('../../nodes/nodeTree', () => ({
    getNodeSiblingIds: vi.fn(() => []),
}))

vi.mock('../../utils/nodeUtils', () => ({
    findReferencingDiagrams: vi.fn(() => []),
    getNodeAbsolutePath: vi.fn(() => ''),
    getNodeAbsolutePathSegments: vi.fn(() => []),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

import { useSystemStore } from '../../store/useSystemStore'
import { getNodeAbsolutePath, getNodeAbsolutePathSegments } from '../../utils/nodeUtils'

const mockRenameNodeId = vi.fn()
const mockSelectNode = vi.fn()

const mockRootComponent = {
    uuid: 'root-uuid',
    id: 'root',
    name: 'Root',
    type: 'component' as const,
    subComponents: [],
    actors: [],
    useCaseDiagrams: [],
    interfaces: [],
}

function setupStoreMock() {
    const state = {
        rootComponent: mockRootComponent,
        renameNodeId: mockRenameNodeId,
        selectNode: mockSelectNode,
    }
    vi.mocked(useSystemStore).mockImplementation((selector: (s: SystemState) => unknown) =>
        selector(state as unknown as SystemState)
    )
}

function makeActorNode(overrides: Partial<ActorNode> = {}): ActorNode {
    return {
        uuid: 'actor-uuid-1',
        id: 'myActor',
        name: 'My Actor',
        type: 'actor',
        description: 'Actor description',
        ...overrides,
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    vi.clearAllMocks()
    setupStoreMock()
})

describe('CommonEditor', () => {
    describe('rendering', () => {
        it('renders the node name in the panel title editor', () => {
            const node = makeActorNode()
            render(<CommonEditor node={node} onUpdate={vi.fn()} />)
            expect(screen.getByLabelText('Node name')).toHaveValue('My Actor')
        })

        it('renders the node name as an inline panel title editor without a separate Name field', () => {
            const node = makeActorNode({ name: 'Test Actor' })
            render(<CommonEditor node={node} onUpdate={vi.fn()} />)

            expect(screen.getByLabelText('Node name')).toHaveValue('Test Actor')
            expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
        })

        it('renders the node type badge', () => {
            const node = makeActorNode()
            render(<CommonEditor node={node} onUpdate={vi.fn()} />)
            expect(screen.getByText('actor')).toBeInTheDocument()
        })

        it('renders the panel title editor pre-filled with node.name', () => {
            const node = makeActorNode({ name: 'Test Actor' })
            render(<CommonEditor node={node} onUpdate={vi.fn()} />)
            expect(screen.getByLabelText('Node name')).toHaveValue('Test Actor')
        })

        it('renders the ID input pre-filled with node.id', () => {
            const node = makeActorNode({ id: 'test_actor' })
            render(<CommonEditor node={node} onUpdate={vi.fn()} />)
            expect(screen.getByDisplayValue('test_actor')).toBeInTheDocument()
        })

        it('renders the absolute node path and allows ancestor selection', async () => {
            const user = userEvent.setup()
            vi.mocked(getNodeAbsolutePath).mockReturnValue('System/User')
            vi.mocked(getNodeAbsolutePathSegments).mockReturnValue([
                { uuid: 'root-uuid', id: 'System' },
                { uuid: 'actor-uuid-1', id: 'User' },
            ])

            render(<CommonEditor node={makeActorNode({ id: 'User' })} onUpdate={vi.fn()} />)

            expect(screen.getByTestId('node-path')).toHaveAttribute('title', 'System/User')
            await user.click(screen.getByRole('button', { name: 'System' }))
            expect(mockSelectNode).toHaveBeenCalledWith('root-uuid')
        })

        it('renders the description in preview mode initially', () => {
            const node = makeActorNode({ description: 'Some desc' })
            render(<CommonEditor node={node} onUpdate={vi.fn()} />)
            expect(screen.getByTestId('markdown-preview')).toHaveTextContent('Some desc')
            expect(screen.queryByTestId('markdown-editor')).not.toBeInTheDocument()
        })

        it('shows No Description placeholder when description is empty', () => {
            const node = makeActorNode({ description: '' })
            render(<CommonEditor node={node} onUpdate={vi.fn()} />)
            expect(screen.getByTestId('markdown-preview')).toHaveTextContent('No Description')
        })

        it('hides an empty description in read-only mode', () => {
            const node = makeActorNode({ description: '' })
            render(<CommonEditor node={node} onUpdate={vi.fn()} readOnly={true} />)

            expect(screen.queryByTestId('markdown-preview')).not.toBeInTheDocument()
        })

        it('does not render a Description label', () => {
            render(<CommonEditor node={makeActorNode()} onUpdate={vi.fn()} />)
            expect(screen.queryByText('Description')).not.toBeInTheDocument()
        })
    })

    describe('read-only mode', () => {
        it('renders name and id as non-editable text', () => {
            render(<CommonEditor node={makeActorNode()} onUpdate={vi.fn()} readOnly={true} />)

            expect(screen.queryByLabelText('Node name')).not.toBeInTheDocument()
            expect(screen.queryByLabelText('Node ID')).not.toBeInTheDocument()
            expect(screen.getByText('My Actor')).toBeInTheDocument()
            expect(screen.getByText('myActor')).toBeInTheDocument()
        })
    })

    describe('name editing', () => {
        it('calls onUpdate with new name on blur', async () => {
            const user = userEvent.setup()
            const onUpdate = vi.fn()
            const node = makeActorNode({ name: 'Old Name' })
            render(<CommonEditor node={node} onUpdate={onUpdate} />)

            const nameInput = screen.getByDisplayValue('Old Name')
            await user.clear(nameInput)
            await user.type(nameInput, 'New Name')
            await user.tab()

            expect(onUpdate).toHaveBeenCalledWith({ name: 'New Name' })
        })

        it('pressing Enter on the panel title saves the new name', async () => {
            const user = userEvent.setup()
            const onUpdate = vi.fn()
            const node = makeActorNode({ name: 'Old Name' })
            render(<CommonEditor node={node} onUpdate={onUpdate} />)

            const nameInput = screen.getByLabelText('Node name')
            await user.clear(nameInput)
            await user.type(nameInput, 'Renamed Actor')
            await user.keyboard('{Enter}')

            expect(onUpdate).toHaveBeenCalledWith({ name: 'Renamed Actor' })
        })

        it('trims the name before saving', async () => {
            const user = userEvent.setup()
            const onUpdate = vi.fn()
            const node = makeActorNode({ name: 'Old' })
            render(<CommonEditor node={node} onUpdate={onUpdate} />)

            const nameInput = screen.getByDisplayValue('Old')
            await user.clear(nameInput)
            await user.type(nameInput, '  Trimmed  ')
            await user.tab()

            expect(onUpdate).toHaveBeenCalledWith({ name: 'Trimmed' })
        })

        it('does not call onUpdate when name is unchanged', async () => {
            const user = userEvent.setup()
            const onUpdate = vi.fn()
            const node = makeActorNode({ name: 'Same Name' })
            render(<CommonEditor node={node} onUpdate={onUpdate} />)

            const nameInput = screen.getByDisplayValue('Same Name')
            await user.click(nameInput)
            await user.tab()

            expect(onUpdate).not.toHaveBeenCalled()
        })

        it('reverts to original name when empty name is blurred', async () => {
            const user = userEvent.setup()
            const onUpdate = vi.fn()
            const node = makeActorNode({ name: 'My Actor' })
            render(<CommonEditor node={node} onUpdate={onUpdate} />)

            const nameInput = screen.getByDisplayValue('My Actor')
            await user.clear(nameInput)
            await user.tab()

            expect(onUpdate).not.toHaveBeenCalled()
            expect(screen.getByDisplayValue('My Actor')).toBeInTheDocument()
        })
    })

    describe('description editing', () => {
        it('clicking the preview switches description into edit mode', async () => {
            const user = userEvent.setup()
            render(
                <CommonEditor
                    node={makeActorNode({ description: 'Existing desc' })}
                    onUpdate={vi.fn()}
                />
            )

            await user.click(screen.getByTestId('markdown-preview'))

            expect(screen.getByTestId('markdown-editor')).toBeInTheDocument()
            expect(screen.queryByTestId('markdown-preview')).not.toBeInTheDocument()
        })

        it('calls onUpdate with new description on blur', async () => {
            const user = userEvent.setup()
            const onUpdate = vi.fn()
            const node = makeActorNode({ description: '' })
            render(<CommonEditor node={node} onUpdate={onUpdate} />)

            await user.click(screen.getByTestId('markdown-preview'))
            const editor = screen.getByTestId('markdown-editor')
            await user.type(editor, 'New description')
            await user.tab()

            expect(onUpdate).toHaveBeenCalledWith({ description: 'New description' })
        })

        it('does not call onUpdate when description is unchanged', async () => {
            const user = userEvent.setup()
            const onUpdate = vi.fn()
            const node = makeActorNode({ description: 'Existing desc' })
            render(<CommonEditor node={node} onUpdate={onUpdate} />)

            await user.click(screen.getByTestId('markdown-preview'))
            await user.tab()

            expect(onUpdate).not.toHaveBeenCalled()
        })
    })

    describe('ID editing', () => {
        it('shows an error while typing an empty ID', async () => {
            const user = userEvent.setup()
            const node = makeActorNode({ id: 'myActor' })
            render(<CommonEditor node={node} onUpdate={vi.fn()} />)

            const idInput = screen.getByLabelText('Node ID')
            await user.clear(idInput)
            // Error is shown during typing (onChange); blur clears it by reverting to original
            expect(screen.getByText('ID cannot be empty')).toBeInTheDocument()
        })

        it('shows an error while typing an invalid ID format', async () => {
            const user = userEvent.setup()
            const node = makeActorNode({ id: 'myActor' })
            render(<CommonEditor node={node} onUpdate={vi.fn()} />)

            const idInput = screen.getByLabelText('Node ID')
            await user.clear(idInput)
            await user.type(idInput, '123bad')
            // Error is shown during typing (onChange); blur reverts and clears it
            expect(
                screen.getByText(
                    'ID must start with a letter or _ and contain only letters, digits, or _'
                )
            ).toBeInTheDocument()
        })

        it('calls renameNodeId with new valid ID on blur', async () => {
            const user = userEvent.setup()
            const node = makeActorNode({ id: 'oldId' })
            render(<CommonEditor node={node} onUpdate={vi.fn()} />)

            const idInput = screen.getByLabelText('Node ID')
            await user.clear(idInput)
            await user.type(idInput, 'newId')
            await user.tab()

            expect(mockRenameNodeId).toHaveBeenCalledWith('actor-uuid-1', 'newId')
        })

        it('pressing Enter on ID field triggers rename', async () => {
            const user = userEvent.setup()
            const node = makeActorNode({ id: 'oldId' })
            render(<CommonEditor node={node} onUpdate={vi.fn()} />)

            const idInput = screen.getByLabelText('Node ID')
            await user.clear(idInput)
            await user.type(idInput, 'validId')
            await user.keyboard('{Enter}')

            expect(mockRenameNodeId).toHaveBeenCalledWith('actor-uuid-1', 'validId')
        })
    })
})
