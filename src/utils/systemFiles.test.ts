/* eslint-disable @typescript-eslint/require-await */
import { describe, it, expect, vi } from "vitest"
import type { ComponentNode } from "../store/types"
import {
  rootFilename,
  descendantPath,
  flattenToFiles,
  serializeComponentYaml,
  assembleTree,
  saveToDirectory,
  loadFromDirectory,
} from "./systemFiles"
import yaml from "js-yaml"
import type { RawComponent } from "./systemFiles"

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeComp = (id: string, subs: ComponentNode[] = []): ComponentNode => ({
  uuid: `${id}-uuid`,
  id,
  name: id,
  type: "component",
  subComponents: subs,
  actors: [],
  useCaseDiagrams: [],
  interfaces: [],
})

const leaf1 = makeComp("auth")
const leaf2 = makeComp("orders")
const mid = makeComp("gateway", [leaf1, leaf2])
const root = makeComp("my-system", [mid])

// ─── rootFilename / descendantPath ────────────────────────────────────────────

describe("rootFilename", () => {
  it("returns <rootId>.yaml", () => {
    expect(rootFilename("my-system")).toBe("my-system.yaml")
  })
})

describe("descendantPath", () => {
  it("returns <rootId>/<parentId>-<selfId>.yaml", () => {
    expect(descendantPath("my-system", "gateway", "auth")).toBe("my-system/gateway-auth.yaml")
  })
})

// ─── flattenToFiles ───────────────────────────────────────────────────────────

describe("flattenToFiles", () => {
  it("produces one entry per component", () => {
    const entries = flattenToFiles(root)
    expect(entries).toHaveLength(4) // root, gateway, auth, orders
  })

  it("root entry has correct relativePath and childPaths", () => {
    const entries = flattenToFiles(root)
    const rootEntry = entries.find((e) => e.relativePath === "my-system.yaml")!
    expect(rootEntry).toBeDefined()
    expect(rootEntry.childPaths).toEqual(["my-system/my-system-gateway.yaml"])
  })

  it("mid-level entry has correct path and childPaths", () => {
    const entries = flattenToFiles(root)
    const gatewayEntry = entries.find((e) => e.relativePath === "my-system/my-system-gateway.yaml")!
    expect(gatewayEntry).toBeDefined()
    expect(gatewayEntry.childPaths).toEqual([
      "my-system/gateway-auth.yaml",
      "my-system/gateway-orders.yaml",
    ])
  })

  it("leaf entry has empty childPaths", () => {
    const entries = flattenToFiles(root)
    const authEntry = entries.find((e) => e.relativePath === "my-system/gateway-auth.yaml")!
    expect(authEntry).toBeDefined()
    expect(authEntry.childPaths).toEqual([])
  })

  it("works for a single-component (no children) tree", () => {
    const solo = makeComp("solo")
    const entries = flattenToFiles(solo)
    expect(entries).toHaveLength(1)
    expect(entries[0].relativePath).toBe("solo.yaml")
    expect(entries[0].childPaths).toEqual([])
  })
})

// ─── serializeComponentYaml ───────────────────────────────────────────────────

describe("serializeComponentYaml", () => {
  it("puts childPaths as subComponents list", () => {
    const content = serializeComponentYaml(leaf1, ["my-system/gateway-auth-child.yaml"])
    const parsed = yaml.load(content) as Record<string, unknown>
    expect(parsed.subComponents).toEqual(["my-system/gateway-auth-child.yaml"])
  })

  it("emits empty list when no children", () => {
    const content = serializeComponentYaml(leaf1, [])
    const parsed = yaml.load(content) as Record<string, unknown>
    expect(parsed.subComponents).toEqual([])
  })

  it("excludes derived keys", () => {
    const compWithDerived = {
      ...leaf1,
      ownerComponentUuid: "should-not-appear",
      referencedNodeIds: ["x"],
    } as unknown as ComponentNode
    const content = serializeComponentYaml(compWithDerived, [])
    expect(content).not.toContain("ownerComponentUuid")
    expect(content).not.toContain("referencedNodeIds")
  })

  it("includes uuid, id, name, type", () => {
    const content = serializeComponentYaml(leaf1, [])
    const parsed = yaml.load(content) as Record<string, unknown>
    expect(parsed.uuid).toBe("auth-uuid")
    expect(parsed.id).toBe("auth")
    expect(parsed.name).toBe("auth")
    expect(parsed.type).toBe("component")
  })
})

// ─── assembleTree ─────────────────────────────────────────────────────────────

describe("assembleTree", () => {
  it("assembles a 3-level tree correctly", () => {
    const rawRoot: RawComponent = { ...makeComp("my-system"), subComponents: ["my-system/my-system-gateway.yaml"] }
    const rawGateway: RawComponent = { ...makeComp("gateway"), subComponents: ["my-system/gateway-auth.yaml"] }
    const rawAuth: RawComponent = { ...makeComp("auth"), subComponents: [] }
    const fileMap = new Map<string, RawComponent>([
      ["my-system.yaml", rawRoot],
      ["my-system/my-system-gateway.yaml", rawGateway],
      ["my-system/gateway-auth.yaml", rawAuth],
    ])
    const assembled = assembleTree(rawRoot, fileMap)
    expect(assembled.id).toBe("my-system")
    expect(assembled.subComponents).toHaveLength(1)
    expect(assembled.subComponents[0].id).toBe("gateway")
    expect(assembled.subComponents[0].subComponents[0].id).toBe("auth")
  })

  it("throws if a referenced file is missing", () => {
    const rawRoot: RawComponent = { ...makeComp("root"), subComponents: ["root/missing.yaml"] }
    const fileMap = new Map<string, RawComponent>([["root.yaml", rawRoot]])
    expect(() => assembleTree(rawRoot, fileMap)).toThrow("Missing component file")
  })
})

// ─── saveToDirectory / loadFromDirectory ─────────────────────────────────────

function makeWritable() {
  return { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) }
}

function makeFSDirectoryHandle(
  files: Map<string, string>,
  subdirs: Map<string, Map<string, string>> = new Map(),
): FileSystemDirectoryHandle {
  async function* yieldEntries(
    fileMap: Map<string, string>,
    subdirMap: Map<string, Map<string, string>> = new Map(),
  ): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle> {
    for (const [name, content] of fileMap) {
      yield {
        kind: "file",
        name,
        getFile: async () => ({ text: async () => content } as unknown as File),
        createWritable: async () => makeWritable() as unknown as FileSystemWritableFileStream,
      } as unknown as FileSystemFileHandle
    }
    for (const [dirName, dirFiles] of subdirMap) {
      yield {
        kind: "directory",
        name: dirName,
        values: () => yieldEntries(dirFiles),
        getFileHandle: vi.fn().mockImplementation(async (name: string, _opts?: { create?: boolean }) => {
          return {
            kind: "file",
            name,
            getFile: async () => ({ text: async () => dirFiles.get(name) ?? "" } as unknown as File),
            createWritable: async () => makeWritable() as unknown as FileSystemWritableFileStream,
          }
        }),
        removeEntry: vi.fn().mockResolvedValue(undefined),
      } as unknown as FileSystemDirectoryHandle
    }
  }

  const writables = new Map<string, ReturnType<typeof makeWritable>>()
  const handle: FileSystemDirectoryHandle = {
    kind: "directory",
    name: "test-dir",
    values: () => yieldEntries(files, subdirs),
    getFileHandle: vi.fn().mockImplementation(async (name: string) => {
      const writable = makeWritable()
      writables.set(name, writable)
      return {
        kind: "file",
        name,
        getFile: async () => ({ text: async () => files.get(name) ?? "" } as unknown as File),
        createWritable: async () => writable as unknown as FileSystemWritableFileStream,
      }
    }),
    getDirectoryHandle: vi.fn().mockImplementation(async (name: string) => {
      const subdirFiles = subdirs.get(name) ?? new Map<string, string>()
      subdirs.set(name, subdirFiles)
      const subdirWritables = new Map<string, ReturnType<typeof makeWritable>>()
      return {
        kind: "directory",
        name,
        values: () => yieldEntries(subdirFiles),
        getFileHandle: vi.fn().mockImplementation(async (fname: string) => {
          const w = makeWritable()
          subdirWritables.set(fname, w)
          return {
            kind: "file",
            name: fname,
            getFile: async () => ({ text: async () => subdirFiles.get(fname) ?? "" } as unknown as File),
            createWritable: async () => w as unknown as FileSystemWritableFileStream,
          }
        }),
        removeEntry: vi.fn().mockResolvedValue(undefined),
      } as unknown as FileSystemDirectoryHandle
    }),
    removeEntry: vi.fn().mockResolvedValue(undefined),
  } as unknown as FileSystemDirectoryHandle

  return handle
}

describe("saveToDirectory", () => {
  it("writes root file and descendant files", async () => {
    const writtenFiles: Record<string, string> = {}
    const subdirWritten: Record<string, string> = {}

    const mockSubdir: FileSystemDirectoryHandle = {
      kind: "directory",
      name: "my-system",
      values: async function* () {},
      getFileHandle: vi.fn().mockImplementation(async (name: string) => ({
        createWritable: async () => ({
          write: vi.fn().mockImplementation(async (content: string) => { subdirWritten[name] = content }),
          close: vi.fn().mockResolvedValue(undefined),
        }),
      })),
      removeEntry: vi.fn().mockResolvedValue(undefined),
    } as unknown as FileSystemDirectoryHandle

    const mockDir: FileSystemDirectoryHandle = {
      kind: "directory",
      name: "test",
      values: async function* () {},
      getFileHandle: vi.fn().mockImplementation(async (name: string) => ({
        createWritable: async () => ({
          write: vi.fn().mockImplementation(async (content: string) => { writtenFiles[name] = content }),
          close: vi.fn().mockResolvedValue(undefined),
        }),
      })),
      getDirectoryHandle: vi.fn().mockResolvedValue(mockSubdir),
      removeEntry: vi.fn().mockResolvedValue(undefined),
    } as unknown as FileSystemDirectoryHandle

    await saveToDirectory(mockDir, root)

    expect(writtenFiles["my-system.yaml"]).toBeDefined()
    const rootParsed = yaml.load(writtenFiles["my-system.yaml"]) as Record<string, unknown>
    expect(rootParsed.id).toBe("my-system")
    expect(rootParsed.subComponents).toEqual(["my-system/my-system-gateway.yaml"])

    expect(subdirWritten["my-system-gateway.yaml"]).toBeDefined()
    expect(subdirWritten["gateway-auth.yaml"]).toBeDefined()
    expect(subdirWritten["gateway-orders.yaml"]).toBeDefined()
  })
})

describe("loadFromDirectory", () => {
  it("loads and assembles a tree from directory files", async () => {
    const rootYaml = serializeComponentYaml(makeComp("my-system"), ["my-system/my-system-gateway.yaml"])
    const gatewayYaml = serializeComponentYaml(makeComp("gateway"), ["my-system/gateway-auth.yaml"])
    const authYaml = serializeComponentYaml(makeComp("auth"), [])

    const subdirFiles = new Map([
      ["my-system-gateway.yaml", gatewayYaml],
      ["gateway-auth.yaml", authYaml],
    ])
    const topFiles = new Map([["my-system.yaml", rootYaml]])
    const handle = makeFSDirectoryHandle(topFiles, new Map([["my-system", subdirFiles]]))

    const loaded = await loadFromDirectory(handle)
    expect(loaded.id).toBe("my-system")
    expect(loaded.subComponents).toHaveLength(1)
    expect(loaded.subComponents[0].id).toBe("gateway")
    expect(loaded.subComponents[0].subComponents[0].id).toBe("auth")
  })

  it("throws if no component files found", async () => {
    const handle = makeFSDirectoryHandle(new Map())
    await expect(loadFromDirectory(handle)).rejects.toThrow("No component files found")
  })
})
