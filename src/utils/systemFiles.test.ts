/* eslint-disable @typescript-eslint/require-await */
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { ComponentNode } from '../store/types'
import {
    rootFilename,
    descendantPath,
    flattenToFiles,
    serializeComponentYaml,
    assembleTree,
    saveToDirectory,
    loadFromDirectory,
    loadFromUrl,
    NotFoundError,
} from './systemFiles'
import yaml from 'js-yaml'
import type { RawComponent } from './systemFiles'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeComp = (id: string, subs: ComponentNode[] = []): ComponentNode => ({
    uuid: `${id}-uuid`,
    id,
    name: id,
    type: 'component',
    subComponents: subs,
    actors: [],
    useCaseDiagrams: [],
    interfaces: [],
})

const leaf1 = makeComp('auth')
const leaf2 = makeComp('orders')
const mid = makeComp('gateway', [leaf1, leaf2])
const root = makeComp('my-system', [mid])

// ─── rootFilename / descendantPath ────────────────────────────────────────────

describe('rootFilename', () => {
    it('returns <rootId>.yaml', () => {
        expect(rootFilename('my-system')).toBe('my-system.yaml')
    })
})

describe('descendantPath', () => {
    it('returns <parentId>-<selfId>.yaml', () => {
        expect(descendantPath('gateway', 'auth')).toBe('gateway-auth.yaml')
    })
})

// ─── flattenToFiles ───────────────────────────────────────────────────────────

describe('flattenToFiles', () => {
    it('produces one entry per component', () => {
        const entries = flattenToFiles(root)
        expect(entries).toHaveLength(4) // root, gateway, auth, orders
    })

    it('root entry has correct relativePath and childPaths', () => {
        const entries = flattenToFiles(root)
        const rootEntry = entries.find((e) => e.relativePath === 'my-system.yaml')!
        expect(rootEntry).toBeDefined()
        expect(rootEntry.childPaths).toEqual(['my-system-gateway.yaml'])
    })

    it('mid-level entry has correct path and childPaths', () => {
        const entries = flattenToFiles(root)
        const gatewayEntry = entries.find((e) => e.relativePath === 'my-system-gateway.yaml')!
        expect(gatewayEntry).toBeDefined()
        expect(gatewayEntry.childPaths).toEqual(['gateway-auth.yaml', 'gateway-orders.yaml'])
    })

    it('leaf entry has empty childPaths', () => {
        const entries = flattenToFiles(root)
        const authEntry = entries.find((e) => e.relativePath === 'gateway-auth.yaml')!
        expect(authEntry).toBeDefined()
        expect(authEntry.childPaths).toEqual([])
    })

    it('works for a single-component (no children) tree', () => {
        const solo = makeComp('solo')
        const entries = flattenToFiles(solo)
        expect(entries).toHaveLength(1)
        expect(entries[0].relativePath).toBe('solo.yaml')
        expect(entries[0].childPaths).toEqual([])
    })
})

// ─── serializeComponentYaml ───────────────────────────────────────────────────

describe('serializeComponentYaml', () => {
    it('puts childPaths as subComponents list', () => {
        const content = serializeComponentYaml(leaf1, ['my-system/gateway-auth-child.yaml'])
        const parsed = yaml.load(content) as Record<string, unknown>
        expect(parsed.subComponents).toEqual(['my-system/gateway-auth-child.yaml'])
    })

    it('emits empty list when no children', () => {
        const content = serializeComponentYaml(leaf1, [])
        const parsed = yaml.load(content) as Record<string, unknown>
        expect(parsed.subComponents).toEqual([])
    })

    it('excludes derived keys', () => {
        const compWithDerived = {
            ...leaf1,
            ownerComponentUuid: 'should-not-appear',
            referencedNodeIds: ['x'],
        } as unknown as ComponentNode
        const content = serializeComponentYaml(compWithDerived, [])
        expect(content).not.toContain('ownerComponentUuid')
        expect(content).not.toContain('referencedNodeIds')
    })

    it('includes uuid, id, name, type', () => {
        const content = serializeComponentYaml(leaf1, [])
        const parsed = yaml.load(content) as Record<string, unknown>
        expect(parsed.uuid).toBe('auth-uuid')
        expect(parsed.id).toBe('auth')
        expect(parsed.name).toBe('auth')
        expect(parsed.type).toBe('component')
    })
})

// ─── assembleTree ─────────────────────────────────────────────────────────────

describe('assembleTree', () => {
    it('assembles a 3-level tree correctly', () => {
        const rawRoot: RawComponent = {
            ...makeComp('my-system'),
            subComponents: ['my-system/my-system-gateway.yaml'],
        }
        const rawGateway: RawComponent = {
            ...makeComp('gateway'),
            subComponents: ['my-system/gateway-auth.yaml'],
        }
        const rawAuth: RawComponent = { ...makeComp('auth'), subComponents: [] }
        const fileMap = new Map<string, RawComponent>([
            ['my-system.yaml', rawRoot],
            ['my-system/my-system-gateway.yaml', rawGateway],
            ['my-system/gateway-auth.yaml', rawAuth],
        ])
        const assembled = assembleTree(rawRoot, fileMap)
        expect(assembled.id).toBe('my-system')
        expect(assembled.subComponents).toHaveLength(1)
        expect(assembled.subComponents[0].id).toBe('gateway')
        expect(assembled.subComponents[0].subComponents[0].id).toBe('auth')
    })

    it('throws if a referenced file is missing', () => {
        const rawRoot: RawComponent = { ...makeComp('root'), subComponents: ['root/missing.yaml'] }
        const fileMap = new Map<string, RawComponent>([['root.yaml', rawRoot]])
        expect(() => assembleTree(rawRoot, fileMap)).toThrow('Missing component file')
    })
})

// ─── saveToDirectory / loadFromDirectory ─────────────────────────────────────

function makeWritable() {
    return {
        write: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
    }
}

function makeFSDirectoryHandle(
    files: Map<string, string>,
    subdirs: Map<string, Map<string, string>> = new Map()
): FileSystemDirectoryHandle {
    async function* yieldEntries(
        fileMap: Map<string, string>,
        subdirMap: Map<string, Map<string, string>> = new Map()
    ): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle> {
        for (const [name, content] of fileMap) {
            yield {
                kind: 'file',
                name,
                getFile: async () => ({ text: async () => content }) as unknown as File,
                createWritable: async () =>
                    makeWritable() as unknown as FileSystemWritableFileStream,
            } as unknown as FileSystemFileHandle
        }
        for (const [dirName, dirFiles] of subdirMap) {
            yield {
                kind: 'directory',
                name: dirName,
                values: () => yieldEntries(dirFiles),
                getFileHandle: vi
                    .fn()
                    .mockImplementation(async (name: string, _opts?: { create?: boolean }) => {
                        return {
                            kind: 'file',
                            name,
                            getFile: async () =>
                                ({ text: async () => dirFiles.get(name) ?? '' }) as unknown as File,
                            createWritable: async () =>
                                makeWritable() as unknown as FileSystemWritableFileStream,
                        }
                    }),
                removeEntry: vi.fn().mockResolvedValue(undefined),
            } as unknown as FileSystemDirectoryHandle
        }
    }

    const writables = new Map<string, ReturnType<typeof makeWritable>>()
    const handle: FileSystemDirectoryHandle = {
        kind: 'directory',
        name: 'test-dir',
        values: () => yieldEntries(files, subdirs),
        getFileHandle: vi.fn().mockImplementation(async (name: string) => {
            const writable = makeWritable()
            writables.set(name, writable)
            return {
                kind: 'file',
                name,
                getFile: async () =>
                    ({ text: async () => files.get(name) ?? '' }) as unknown as File,
                createWritable: async () => writable as unknown as FileSystemWritableFileStream,
            }
        }),
        getDirectoryHandle: vi.fn().mockImplementation(async (name: string) => {
            const subdirFiles = subdirs.get(name) ?? new Map<string, string>()
            subdirs.set(name, subdirFiles)
            const subdirWritables = new Map<string, ReturnType<typeof makeWritable>>()
            return {
                kind: 'directory',
                name,
                values: () => yieldEntries(subdirFiles),
                getFileHandle: vi.fn().mockImplementation(async (fname: string) => {
                    const w = makeWritable()
                    subdirWritables.set(fname, w)
                    return {
                        kind: 'file',
                        name: fname,
                        getFile: async () =>
                            ({ text: async () => subdirFiles.get(fname) ?? '' }) as unknown as File,
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

describe('saveToDirectory', () => {
    it('writes root file and all descendant files flat to dir', async () => {
        const writtenFiles: Record<string, string> = {}

        const mockDir: FileSystemDirectoryHandle = {
            kind: 'directory',
            name: 'test',
            values: async function* () {},
            getFileHandle: vi.fn().mockImplementation(async (name: string) => ({
                createWritable: async () => ({
                    write: vi.fn().mockImplementation(async (content: string) => {
                        writtenFiles[name] = content
                    }),
                    close: vi.fn().mockResolvedValue(undefined),
                }),
            })),
            removeEntry: vi.fn().mockResolvedValue(undefined),
        } as unknown as FileSystemDirectoryHandle

        await saveToDirectory(mockDir, root)

        expect(writtenFiles['my-system.yaml']).toBeDefined()
        const rootParsed = yaml.load(writtenFiles['my-system.yaml']) as Record<string, unknown>
        expect(rootParsed.id).toBe('my-system')
        expect(rootParsed.subComponents).toEqual(['my-system-gateway.yaml'])

        expect(writtenFiles['my-system-gateway.yaml']).toBeDefined()
        expect(writtenFiles['gateway-auth.yaml']).toBeDefined()
        expect(writtenFiles['gateway-orders.yaml']).toBeDefined()
    })

    it('removes only stale yaml files without reading or parsing existing files', async () => {
        const staleGetFile = vi.fn()
        const expectedGetFile = vi.fn()
        const removeEntry = vi.fn().mockResolvedValue(undefined)

        const mockDir: FileSystemDirectoryHandle = {
            kind: 'directory',
            name: 'test',
            values: async function* () {
                yield {
                    kind: 'file',
                    name: 'my-system-gateway.yaml',
                    getFile: expectedGetFile,
                } as unknown as FileSystemFileHandle
                yield {
                    kind: 'file',
                    name: 'obsolete.yaml',
                    getFile: staleGetFile,
                } as unknown as FileSystemFileHandle
                yield {
                    kind: 'file',
                    name: 'notes.txt',
                    getFile: vi.fn(),
                } as unknown as FileSystemFileHandle
            },
            getFileHandle: vi.fn().mockImplementation(async (_name: string) => ({
                createWritable: async () => ({
                    write: vi.fn().mockResolvedValue(undefined),
                    close: vi.fn().mockResolvedValue(undefined),
                }),
            })),
            removeEntry,
        } as unknown as FileSystemDirectoryHandle

        await saveToDirectory(mockDir, root)

        expect(removeEntry).toHaveBeenCalledTimes(1)
        expect(removeEntry).toHaveBeenCalledWith('obsolete.yaml')
        expect(expectedGetFile).not.toHaveBeenCalled()
        expect(staleGetFile).not.toHaveBeenCalled()
    })

    it('overlaps writes instead of forcing them to run sequentially', async () => {
        const releaseWrites: Array<() => void> = []
        let activeWrites = 0
        let maxActiveWrites = 0
        const writtenFiles = new Map<string, string>()

        const mockDir: FileSystemDirectoryHandle = {
            kind: 'directory',
            name: 'test',
            values: async function* () {},
            getFileHandle: vi.fn().mockImplementation(async (name: string) => ({
                createWritable: async () => ({
                    write: vi.fn().mockImplementation(async (content: string) => {
                        writtenFiles.set(name, content)
                        activeWrites += 1
                        maxActiveWrites = Math.max(maxActiveWrites, activeWrites)
                        await new Promise<void>((resolve) => {
                            releaseWrites.push(() => {
                                activeWrites -= 1
                                resolve()
                            })
                        })
                    }),
                    close: vi.fn().mockResolvedValue(undefined),
                }),
            })),
            removeEntry: vi.fn().mockResolvedValue(undefined),
        } as unknown as FileSystemDirectoryHandle

        const savePromise = saveToDirectory(mockDir, root)

        for (let attempt = 0; attempt < 20 && releaseWrites.length < 4; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 0))
        }

        expect(releaseWrites).toHaveLength(4)
        expect(maxActiveWrites).toBeGreaterThan(1)

        for (const release of releaseWrites) release()
        await savePromise

        expect(writtenFiles.has('my-system.yaml')).toBe(true)
        expect(writtenFiles.has('my-system-gateway.yaml')).toBe(true)
        expect(writtenFiles.has('gateway-auth.yaml')).toBe(true)
        expect(writtenFiles.has('gateway-orders.yaml')).toBe(true)
    })

    it('rejects when a concurrent write fails', async () => {
        const writeError = new Error('disk full')

        const mockDir: FileSystemDirectoryHandle = {
            kind: 'directory',
            name: 'test',
            values: async function* () {},
            getFileHandle: vi.fn().mockImplementation(async (name: string) => ({
                createWritable: async () => ({
                    write: vi.fn().mockImplementation(async () => {
                        if (name === 'gateway-auth.yaml') throw writeError
                    }),
                    close: vi.fn().mockResolvedValue(undefined),
                }),
            })),
            removeEntry: vi.fn().mockResolvedValue(undefined),
        } as unknown as FileSystemDirectoryHandle

        await expect(saveToDirectory(mockDir, root)).rejects.toThrow('disk full')
    })
})

describe('loadFromDirectory', () => {
    it('loads and assembles a tree from flat directory files', async () => {
        const rootYaml = serializeComponentYaml(makeComp('my-system'), ['my-system-gateway.yaml'])
        const gatewayYaml = serializeComponentYaml(makeComp('gateway'), ['gateway-auth.yaml'])
        const authYaml = serializeComponentYaml(makeComp('auth'), [])

        const topFiles = new Map([
            ['my-system.yaml', rootYaml],
            ['my-system-gateway.yaml', gatewayYaml],
            ['gateway-auth.yaml', authYaml],
        ])
        const handle = makeFSDirectoryHandle(topFiles)

        const loaded = await loadFromDirectory(handle)
        expect(loaded.id).toBe('my-system')
        expect(loaded.subComponents).toHaveLength(1)
        expect(loaded.subComponents[0].id).toBe('gateway')
        expect(loaded.subComponents[0].subComponents[0].id).toBe('auth')
    })

    it('throws if no component files found', async () => {
        const handle = makeFSDirectoryHandle(new Map())
        await expect(loadFromDirectory(handle)).rejects.toThrow('No component files found')
    })

    it('throws when the directory contains multiple root component YAML files', async () => {
        const yaml1 = serializeComponentYaml(makeComp('system-a'), [])
        const yaml2 = serializeComponentYaml(makeComp('system-b'), [])
        const handle = makeFSDirectoryHandle(
            new Map([
                ['system-a.yaml', yaml1],
                ['system-b.yaml', yaml2],
            ])
        )
        await expect(loadFromDirectory(handle)).rejects.toThrow(
            'contains 2 root component YAML files'
        )
    })

    it('throws if no unreferenced root file exists', async () => {
        const yaml1 = serializeComponentYaml(makeComp('system-a'), ['system-b.yaml'])
        const yaml2 = serializeComponentYaml(makeComp('system-b'), ['system-a.yaml'])
        const handle = makeFSDirectoryHandle(
            new Map([
                ['system-a.yaml', yaml1],
                ['system-b.yaml', yaml2],
            ])
        )
        await expect(loadFromDirectory(handle)).rejects.toThrow('No root component found')
    })
})

// ─── loadFromUrl ─────────────────────────────────────────────────────────────

function makeFetchMock(responses: Record<string, { status: number; body: string }>) {
    return vi.fn((url: string) => {
        const entry = responses[url]
        if (!entry)
            return Promise.resolve({
                ok: false,
                status: 404,
                statusText: 'Not Found',
                text: () => Promise.resolve(''),
            })
        return Promise.resolve({
            ok: entry.status >= 200 && entry.status < 300,
            status: entry.status,
            statusText: entry.status === 200 ? 'OK' : 'Error',
            text: () => Promise.resolve(entry.body),
        })
    })
}

describe('loadFromUrl', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('loads a root component with no sub-components', async () => {
        const rootYaml = serializeComponentYaml(makeComp('my-system'), [])
        vi.stubGlobal(
            'fetch',
            makeFetchMock({ '/models/my-system/my-system.yaml': { status: 200, body: rootYaml } })
        )

        const result = await loadFromUrl('my-system')
        expect(result.id).toBe('my-system')
        expect(result.subComponents).toHaveLength(0)
    })

    it('recursively fetches sub-components', async () => {
        const rootYaml = serializeComponentYaml(makeComp('my-system'), [
            'my-system/my-system-auth.yaml',
        ])
        const authYaml = serializeComponentYaml(makeComp('auth'), [])
        vi.stubGlobal(
            'fetch',
            makeFetchMock({
                '/models/my-system/my-system.yaml': { status: 200, body: rootYaml },
                '/models/my-system/my-system-auth.yaml': { status: 200, body: authYaml },
            })
        )

        const result = await loadFromUrl('my-system')
        expect(result.id).toBe('my-system')
        expect(result.subComponents).toHaveLength(1)
        expect(result.subComponents[0].id).toBe('auth')
    })

    it('fetches sibling sub-components in parallel (each URL fetched once)', async () => {
        const rootYaml = serializeComponentYaml(makeComp('sys'), [
            'sys/sys-a.yaml',
            'sys/sys-b.yaml',
        ])
        const aYaml = serializeComponentYaml(makeComp('a'), [])
        const bYaml = serializeComponentYaml(makeComp('b'), [])
        const fetchMock = makeFetchMock({
            '/models/sys/sys.yaml': { status: 200, body: rootYaml },
            '/models/sys/sys-a.yaml': { status: 200, body: aYaml },
            '/models/sys/sys-b.yaml': { status: 200, body: bYaml },
        })
        vi.stubGlobal('fetch', fetchMock)

        await loadFromUrl('sys')
        expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('throws NotFoundError when root YAML returns 404', async () => {
        vi.stubGlobal(
            'fetch',
            makeFetchMock({ '/models/missing/missing.yaml': { status: 404, body: 'Not Found' } })
        )

        await expect(loadFromUrl('missing')).rejects.toBeInstanceOf(NotFoundError)
    })

    it('throws NotFoundError when a sub-component returns 404', async () => {
        const rootYaml = serializeComponentYaml(makeComp('sys'), ['sys/sys-ghost.yaml'])
        vi.stubGlobal(
            'fetch',
            makeFetchMock({
                '/models/sys/sys.yaml': { status: 200, body: rootYaml },
                '/models/sys/sys-ghost.yaml': { status: 404, body: 'Not Found' },
            })
        )

        await expect(loadFromUrl('sys')).rejects.toBeInstanceOf(NotFoundError)
    })

    it('throws a generic Error for non-404 server errors', async () => {
        vi.stubGlobal(
            'fetch',
            makeFetchMock({
                '/models/sys/sys.yaml': { status: 500, body: 'Internal Server Error' },
            })
        )

        await expect(loadFromUrl('sys')).rejects.toThrow('Failed to fetch')
        await expect(loadFromUrl('sys')).rejects.not.toBeInstanceOf(NotFoundError)
    })

    it('throws if the fetched YAML is not a valid component', async () => {
        vi.stubGlobal(
            'fetch',
            makeFetchMock({
                '/models/bad/bad.yaml': { status: 200, body: 'type: not-a-component\nid: bad' },
            })
        )

        await expect(loadFromUrl('bad')).rejects.toThrow('Invalid component YAML')
    })
})
