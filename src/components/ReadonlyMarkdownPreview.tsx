import type { ComponentProps } from 'react'
import MDEditor from '@uiw/react-md-editor'
import '@uiw/react-md-editor/markdown-editor.css'

type MarkdownComponents = ComponentProps<typeof MDEditor.Markdown>['components']

interface ReadonlyMarkdownPreviewProps {
    source: string
    className?: string
    components?: MarkdownComponents
}

export const ReadonlyMarkdownPreview = ({
    source,
    className,
    components,
}: ReadonlyMarkdownPreviewProps) => (
    <div data-color-mode="dark" className={className}>
        <MDEditor.Markdown
            source={source}
            components={components}
            className="bg-transparent text-sm"
        />
    </div>
)
