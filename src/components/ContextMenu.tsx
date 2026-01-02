import { useEffect, useRef } from "react"

interface ContextMenuProps {
  x: number
  y: number
  onClose: () => void
  items: { label: string; onClick: () => void }[]
}

export const ContextMenu = ({ x, y, onClose, items }: ContextMenuProps) => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as any)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white border border-gray-200 rounded-md shadow-lg min-w-[160px] py-1"
      style={{ top: y, left: x }}
    >
      {items.map((item, index) => (
        <button
          key={index}
          className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 bg-transparent border-none cursor-pointer"
          onClick={() => {
            item.onClick()
            onClose()
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
