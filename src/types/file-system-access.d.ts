// Minimal type declarations for the File System Access API
// https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API

interface FileSystemFileHandle {
  readonly kind: "file"
  readonly name: string
  getFile(): Promise<File>
  createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>
}

interface FileSystemWritableFileStream {
  write(data: string | BufferSource | Blob): Promise<void>
  close(): Promise<void>
}

interface OpenFilePickerOptions {
  types?: Array<{ description?: string; accept: Record<string, string[]> }>
  multiple?: boolean
  excludeAcceptAllOption?: boolean
}

interface SaveFilePickerOptions {
  types?: Array<{ description?: string; accept: Record<string, string[]> }>
  suggestedName?: string
  excludeAcceptAllOption?: boolean
}

interface Window {
  showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>
  showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>
}
