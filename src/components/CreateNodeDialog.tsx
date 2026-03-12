import { useEffect, useRef, useState } from "react"
import { deriveNameFromId } from "../utils/nameUtils"

const ID_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/

type Props = {
  title: string
  placeholder: string
  onConfirm: (id: string, name: string) => void
  onCancel: () => void
}

export function CreateNodeDialog({ title, placeholder, onConfirm, onCancel }: Props) {
  const [id, setId] = useState("")
  const [name, setName] = useState("")
  const [nameTouched, setNameTouched] = useState(false)
  const [idError, setIdError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const idInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    idInputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onCancel])

  const handleIdChange = (value: string) => {
    setId(value)
    if (!nameTouched) {
      setName(deriveNameFromId(value))
    }
    if (idError) setIdError(null)
  }

  const handleNameChange = (value: string) => {
    setName(value)
    setNameTouched(true)
    if (nameError) setNameError(null)
  }

  const handleSubmit = () => {
    let valid = true

    if (!id.trim()) {
      setIdError("ID is required.")
      valid = false
    } else if (!ID_REGEX.test(id.trim())) {
      setIdError("Must start with a letter or _ and contain only letters, digits, or _.")
      valid = false
    } else {
      setIdError(null)
    }

    if (!name.trim()) {
      setNameError("Name is required.")
      valid = false
    } else {
      setNameError(null)
    }

    if (valid) {
      onConfirm(id.trim(), name.trim())
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[400px] rounded-lg border border-gray-700 bg-gray-900 shadow-xl">
        <div className="px-5 py-4 border-b border-gray-700">
          <h2 className="text-base font-semibold text-gray-100">{title}</h2>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-400">ID</label>
            <input
              ref={idInputRef}
              type="text"
              value={id}
              placeholder={placeholder}
              onChange={(e) => handleIdChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="w-full rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
            {idError && <p className="text-xs text-red-400">{idError}</p>}
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-400">Name</label>
            <input
              type="text"
              value={name}
              placeholder="Display name"
              onChange={(e) => handleNameChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="w-full rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
            {nameError && <p className="text-xs text-red-400">{nameError}</p>}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-700">
          <button
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
