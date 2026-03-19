import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NodeTodoPopup } from './NodeTodoPopup'

const todos = [
    {
        id: 'todo-1',
        text: 'Review popup position',
        definingNodeUuid: 'node-1',
        definingNodeName: 'Top Node',
        source: 'description' as const,
    },
]

describe('NodeTodoPopup', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        Object.defineProperty(window, 'innerHeight', {
            configurable: true,
            writable: true,
            value: 800,
        })
    })

    it('keeps the popup inside the viewport when opened near the top edge', async () => {
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
            configurable: true,
            get() {
                return this instanceof HTMLElement && this.dataset.testid === 'node-todo-popup'
                    ? 220
                    : 0
            },
        })

        render(<NodeTodoPopup todos={todos} position={{ x: 20, y: 12 }} onSelect={vi.fn()} />)

        await waitFor(() => {
            const popup = screen.getByTestId('node-todo-popup')
            expect(popup.style.top).toBe('12px')
            expect(popup.style.transform).toBe('')
        })
    })
})
