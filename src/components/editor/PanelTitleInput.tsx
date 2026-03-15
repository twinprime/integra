type PanelTitleInputProps = {
  value: string
  nodeType: string
  onChange: (value: string) => void
  onBlur: () => void
}

export const PanelTitleInput = ({
  value,
  nodeType,
  onChange,
  onBlur,
}: PanelTitleInputProps) => {
  return (
    <h2 className="text-xl font-semibold text-gray-100 flex items-center gap-2">
      <input
        aria-label="Node name"
        className="min-w-0 flex-1 bg-transparent border border-transparent rounded px-1 -mx-1 text-gray-100 placeholder:text-gray-500 hover:border-gray-600 focus:border-blue-400 focus:outline-none"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
        placeholder="Name"
      />
      <span className="text-xs font-normal text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full border border-gray-700">
        {nodeType}
      </span>
    </h2>
  )
}
