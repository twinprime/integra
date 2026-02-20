import MDEditor from "@uiw/react-md-editor"
import "@uiw/react-md-editor/markdown-editor.css"
import { useSystemStore } from "../../store/useSystemStore"
import { findNodeByPath } from "../../utils/nodeUtils"

// Renders markdown links as node-navigation links when href is a relative node path
const NodeLink = ({ href, children }: { href?: string; children?: React.ReactNode }) => {
  const rootComponent = useSystemStore((state) => state.rootComponent)
  const selectNode = useSystemStore((state) => state.selectNode)
  const isNodeLink = !!href && !href.includes("://") && !href.startsWith("#") && !href.startsWith("/")

  if (!isNodeLink) return <a href={href}>{children}</a>

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    const uuid = findNodeByPath(rootComponent, href!)
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
}: {
  value: string
  onChange: (val: string) => void
  onBlur?: () => void
  height?: number
  placeholder?: string
}) => (
  <div data-color-mode="dark">
    <MDEditor
      value={value}
      onChange={(v) => onChange(v ?? "")}
      preview="preview"
      height={height}
      textareaProps={{ placeholder, onBlur }}
      previewOptions={{ components: { a: NodeLink as any } }}
    />
  </div>
)
