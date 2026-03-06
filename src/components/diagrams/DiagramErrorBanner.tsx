import { useState } from "react"

interface DiagramErrorBannerProps {
  error: string
  details: string
}

export const DiagramErrorBanner = ({ error, details }: DiagramErrorBannerProps) => {
  const [showTooltip, setShowTooltip] = useState(false)
  if (!error) return null
  return (
    <button
      type="button"
      className="relative w-full text-left text-red-500 p-2 text-sm cursor-help bg-transparent border-0"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onFocus={() => setShowTooltip(true)}
      onBlur={() => setShowTooltip(false)}
    >
      {error}
      {showTooltip && (
        <div className="absolute left-0 top-full mt-1 bg-gray-800 text-white text-xs p-2 rounded shadow-lg z-10 max-w-md whitespace-pre-wrap">
          {details}
        </div>
      )}
    </button>
  )
}
