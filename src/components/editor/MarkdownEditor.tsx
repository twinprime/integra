import MDEditor from "@uiw/react-md-editor"
import "@uiw/react-md-editor/markdown-editor.css"
import { useSystemStore } from "../../store/useSystemStore"
import { findNodeByPath } from "../../utils/nodeUtils"

// Renders markdown links as node-navigation links when href is a relative node path
const NodeLink = ({
  href,
  children,
  contextComponentUuid,
}: {
  href?: string
  children?: React.ReactNode
  contextComponentUuid?: string
}) => {
  const rootComponent = useSystemStore((state) => state.rootComponent)
  const selectNode = useSystemStore((state) => state.selectNode)
  const isNodeLink = !!href && !href.includes("://") && !href.startsWith("#") && !href.startsWith("/")

  if (!isNodeLink) return <a href={href}>{children}</a>

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const uuid = findNodeByPath(rootComponent, href, contextComponentUuid)
    if (uuid) selectNode(uuid)
  }

  return (
    <span
      className="text-blue-400 cursor-pointer hover:underline"
      onClick={handleClick}
      title={`Navigate to: ${href}`}
      role="link"
    >
      {children}
    </span>
  )
}

export const MarkdownEditor = ({
  value,
  onChange,
  onBlur,
  height = 100,
  placeholder,
  contextComponentUuid,
  className,
  previewOnly = false,
  onPreviewClick,
}: {
  value: string
  onChange: (val: string) => void
  onBlur?: () => void
  height?: number | string
  placeholder?: string
  contextComponentUuid?: string
  className?: string
  previewOnly?: boolean
  onPreviewClick?: () => void
}) => {
  const NodeLinkWithContext = ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <NodeLink href={href} contextComponentUuid={contextComponentUuid}>{children}</NodeLink>
  )

  if (previewOnly) {
    return (
      <div
        role="button"
        tabIndex={0}
        data-color-mode="dark"
        className={`min-h-0 flex-1 overflow-auto rounded-md border border-gray-700 bg-gray-950 p-3 cursor-text hover:border-gray-600 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400${className ? ` ${className}` : ""}`}
        onClick={(e) => {
          if (e.target instanceof Element && e.target.closest("a, [role='link']")) return
          onPreviewClick?.()
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onPreviewClick?.()
          }
        }}
        aria-label={value ? "Description preview — click to edit" : "No Description — click to edit"}
      >
        {value ? (
          <MDEditor.Markdown
            source={value}
            components={{ a: NodeLinkWithContext as React.ComponentType<React.HTMLProps<HTMLAnchorElement>> }}
            className="bg-transparent text-sm"
          />
        ) : (
          <div className="h-full min-h-24 flex items-center justify-center text-sm text-gray-500 italic">
            No Description
          </div>
        )}
      </div>
    )
  }

  return (
    <div data-color-mode="dark" className={`[&_.w-md-editor-preview]:overflow-y-auto${className ? ` ${className}` : ""}`}>
      <MDEditor
        value={value}
        onChange={(v) => onChange(v ?? "")}
        preview="edit"
        height={height}
        textareaProps={{ placeholder, onBlur }}
        previewOptions={{ components: { a: NodeLinkWithContext as React.ComponentType<React.HTMLProps<HTMLAnchorElement>> } }}
      />
    </div>
  )
}
