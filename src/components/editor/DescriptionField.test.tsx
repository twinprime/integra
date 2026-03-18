import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DescriptionField } from './DescriptionField'

const markdownEditorSpy = vi.fn()

vi.mock('./MarkdownEditor', () => ({
    MarkdownEditor: (props: {
        value: string
        onChange: (value: string) => void
        onBlur?: () => void
        placeholder?: string
        previewOnly?: boolean
        onPreviewClick?: () => void
        className?: string
    }) => {
        markdownEditorSpy(props)
        return props.previewOnly ? (
            <button data-testid="markdown-preview" onClick={props.onPreviewClick}>
                {props.value || 'No Description'}
            </button>
        ) : (
            <textarea
                data-testid="markdown-editor"
                value={props.value}
                onChange={(event) => props.onChange(event.target.value)}
                onBlur={props.onBlur}
                placeholder={props.placeholder}
            />
        )
    },
}))

describe('DescriptionField', () => {
    it('does not apply full-height preview classes when showing an empty placeholder', () => {
        render(<DescriptionField value="" onChange={vi.fn()} className="flex-1 min-h-0" />)

        expect(screen.getByTestId('markdown-preview')).toHaveTextContent('No Description')
        expect(markdownEditorSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                previewOnly: true,
                className: undefined,
            })
        )
    })

    it('expands into the full editor styling after entering edit mode', async () => {
        const user = userEvent.setup()

        render(
            <DescriptionField
                value=""
                onChange={vi.fn()}
                className="flex-1 min-h-0"
                height="120px"
            />
        )

        await user.click(screen.getByTestId('markdown-preview'))

        expect(screen.getByTestId('markdown-editor')).toBeInTheDocument()
        expect(screen.getByTestId('markdown-editor').parentElement).toHaveClass('flex-1', 'min-h-0')
    })
})
