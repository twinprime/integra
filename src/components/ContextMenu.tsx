import { useEffect, useRef } from "react"

interface ContextMenuProps {
  x: number
  y: number
  onClose: () => void
  items: {
    label: string
    onClick: () => void
    icon?: React.ReactNode
    className?: string
  }[]
}

export const ContextMenu = ({ x, y, onClose, items }: ContextMenuProps) => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose()
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-gray-800 border border-gray-700 rounded-md shadow-lg min-w-[160px] py-1"
      style={{ top: y, left: x }}
    >
      {items.map((item, index) => (
        <button
          key={index}
          className={`flex items-center gap-2 w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 hover:text-gray-100 bg-transparent border-none cursor-pointer ${
            item.className || ""
          }`}
          onClick={() => {
            item.onClick()
            onClose()
          }}
        >
          {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>
  )
}
