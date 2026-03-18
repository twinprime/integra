import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DescriptionField } from './DescriptionField'

const DescriptionFieldHarness = ({
    initialValue = 'Existing description',
    onBlur = vi.fn(),
}: {
    initialValue?: string
    onBlur?: () => void
}) => {
    const [value, setValue] = useState(initialValue)

    return (
        <div>
            <DescriptionField value={value} onChange={setValue} onBlur={onBlur} />
            <button type="button">Outside</button>
        </div>
    )
}

describe('DescriptionField blur behavior', () => {
    it('returns to preview mode when edit mode is opened and focus leaves immediately', async () => {
        const user = userEvent.setup()
        const handleBlur = vi.fn()

        render(<DescriptionFieldHarness onBlur={handleBlur} />)

        await user.click(
            screen.getByRole('button', { name: /description preview — click to edit/i })
        )
        expect(await screen.findByRole('textbox')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Outside' }))

        await waitFor(() => {
            expect(
                screen.getByRole('button', { name: /description preview — click to edit/i })
            ).toBeInTheDocument()
        })

        expect(handleBlur).toHaveBeenCalledTimes(1)
    })

    it('returns to preview mode when focus leaves the editor', async () => {
        const user = userEvent.setup()
        const handleBlur = vi.fn()

        render(<DescriptionFieldHarness onBlur={handleBlur} />)

        await user.click(
            screen.getByRole('button', { name: /description preview — click to edit/i })
        )

        const editor = await screen.findByRole('textbox')
        await user.click(editor)
        await user.type(editor, ' updated')

        await user.click(screen.getByRole('button', { name: 'Outside' }))

        await waitFor(() => {
            expect(
                screen.getByRole('button', { name: /description preview — click to edit/i })
            ).toBeInTheDocument()
        })

        expect(handleBlur).toHaveBeenCalledTimes(1)
        expect(screen.getByText('Existing description updated')).toBeInTheDocument()
    })
})
