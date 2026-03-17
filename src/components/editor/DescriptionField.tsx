import { useState } from "react"
import { MarkdownEditor } from "./MarkdownEditor"

type DescriptionFieldProps = {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  placeholder?: string
  contextComponentUuid?: string
  height?: number | string
  className?: string
}

export const DescriptionField = ({
  value,
  onChange,
  onBlur,
  placeholder,
  contextComponentUuid,
  height = "100%",
  className,
}: DescriptionFieldProps) => {
  const [isEditing, setIsEditing] = useState(false)
  const hasDescription = value.trim().length > 0

  if (isEditing) {
    return (
      <div className={`border border-blue-400 rounded-md overflow-hidden min-h-0 bg-gray-950 ${className ?? ""}`}>
        <MarkdownEditor
          value={value}
          onChange={onChange}
          onBlur={() => {
            onBlur?.()
            setIsEditing(false)
          }}
          height={height}
          placeholder={placeholder}
          contextComponentUuid={contextComponentUuid}
        />
      </div>
    )
  }

  return (
    <MarkdownEditor
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      height={height}
      placeholder={placeholder}
      contextComponentUuid={contextComponentUuid}
      className={hasDescription ? className : undefined}
      previewOnly={true}
      onPreviewClick={() => setIsEditing(true)}
    />
  )
}
