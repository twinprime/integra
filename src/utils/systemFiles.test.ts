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
    it('accepts no arguments', () => {
        expect(rootFilename.length).toBe(0)
    })

    it('always returns root.yaml', () => {
        expect(rootFilename()).toBe('root.yaml')
        expect(rootFilename()).toBe('root.yaml')
    })
})

describe('descendantPath', () => {
    it('returns a flat root-prefixed filename from the ancestor chain', () => {
        expect(descendantPath(['gateway'], 'auth')).toBe('root-gateway-auth.yaml')
        expect(descendantPath(['gateway', 'auth'], 'token')).toBe('root-gateway-auth-token.yaml')
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
        const rootEntry = entries.find((e) => e.relativePath === 'root.yaml')!
        expect(rootEntry).toBeDefined()
        expect(rootEntry.childPaths).toEqual(['root-gateway.yaml'])
    })

    it('mid-level entry has correct path and childPaths', () => {
        const entries = flattenToFiles(root)
        const gatewayEntry = entries.find((e) => e.relativePath === 'root-gateway.yaml')!
        expect(gatewayEntry).toBeDefined()
        expect(gatewayEntry.childPaths).toEqual([
            'root-gateway-auth.yaml',
            'root-gateway-orders.yaml',
        ])
    })

    it('supports depth-3 descendant paths', () => {
        const deepRoot = makeComp('deep-root', [
            makeComp('gateway', [makeComp('auth', [makeComp('token')])]),
        ])

        const entries = flattenToFiles(deepRoot)
        const authEntry = entries.find((e) => e.relativePath === 'root-gateway-auth.yaml')!
        expect(authEntry.childPaths).toEqual(['root-gateway-auth-token.yaml'])
    })

    it('leaf entry has empty childPaths', () => {
        const entries = flattenToFiles(root)
        const authEntry = entries.find((e) => e.relativePath === 'root-gateway-auth.yaml')!
        expect(authEntry).toBeDefined()
        expect(authEntry.childPaths).toEqual([])
    })

    it('works for a single-component (no children) tree', () => {
        const solo = makeComp('solo')
        const entries = flattenToFiles(solo)
        expect(entries).toHaveLength(1)
        expect(entries[0].relativePath).toBe('root.yaml')
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
            subComponents: ['root-gateway.yaml'],
        }
        const rawGateway: RawComponent = {
            ...makeComp('gateway'),
            subComponents: ['root-gateway-auth.yaml'],
        }
        const rawAuth: RawComponent = { ...makeComp('auth'), subComponents: [] }
        const fileMap = new Map<string, RawComponent>([
            ['root.yaml', rawRoot],
            ['root-gateway.yaml', rawGateway],
            ['root-gateway-auth.yaml', rawAuth],
        ])
        const assembled = assembleTree(rawRoot, fileMap)
        expect(assembled.id).toBe('my-system')
        expect(assembled.subComponents).toHaveLength(1)
        expect(assembled.subComponents[0].id).toBe('gateway')
        expect(assembled.subComponents[0].subComponents[0].id).toBe('auth')
    })

    it('throws if a referenced file is missing', () => {
        const rawRoot: RawComponent = { ...makeComp('root'), subComponents: ['root-missing.yaml'] }
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

function makeFSDirectoryHandle(files: Map<string, string>): FileSystemDirectoryHandle {
    async function* yieldEntries(
        fileMap: Map<string, string>
    ): AsyncIterableIterator<FileSystemFileHandle> {
        for (const [name, content] of fileMap) {
            yield {
                kind: 'file',
                name,
                getFile: async () => ({ text: async () => content }) as unknown as File,
                createWritable: async () =>
                    makeWritable() as unknown as FileSystemWritableFileStream,
            } as unknown as FileSystemFileHandle
        }
    }

    const writables = new Map<string, ReturnType<typeof makeWritable>>()
    const handle: FileSystemDirectoryHandle = {
        kind: 'directory',
        name: 'test-dir',
        values: () => yieldEntries(files),
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
        removeEntry: vi.fn().mockResolvedValue(undefined),
    } as unknown as FileSystemDirectoryHandle

    return handle
}

describe('saveToDirectory', () => {
    it('writes root and descendants as top-level yaml files', async () => {
        const writtenFiles: Record<string, string> = {}
        const getDirectoryHandle = vi.fn()

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
            getDirectoryHandle,
            removeEntry: vi.fn().mockResolvedValue(undefined),
        } as unknown as FileSystemDirectoryHandle

        await saveToDirectory(mockDir, root)

        expect(getDirectoryHandle).not.toHaveBeenCalled()
        expect(writtenFiles['root.yaml']).toContain('id: my-system')
        expect(writtenFiles['root-gateway.yaml']).toContain('id: gateway')
        expect(writtenFiles['root-gateway-auth.yaml']).toContain('id: auth')
        expect(writtenFiles['root-gateway-orders.yaml']).toContain('id: orders')
    })

    it('removes stale top-level yaml files that are no longer expected', async () => {
        const oldRootYaml = serializeComponentYaml(makeComp('my-system'), ['root-obsolete.yaml'])
        const oldChildYaml = serializeComponentYaml(makeComp('obsolete'), [])
        const configYaml = 'services:\n  api:\n    image: test\n'
        const removeEntry = vi.fn().mockResolvedValue(undefined)
        const handle: FileSystemDirectoryHandle = {
            kind: 'directory',
            name: 'test-dir',
            values: async function* () {
                yield {
                    kind: 'file',
                    name: 'root.yaml',
                    getFile: async () => ({ text: async () => oldRootYaml }) as unknown as File,
                } as unknown as FileSystemFileHandle
                yield {
                    kind: 'file',
                    name: 'root-obsolete.yaml',
                    getFile: async () => ({ text: async () => oldChildYaml }) as unknown as File,
                } as unknown as FileSystemFileHandle
                yield {
                    kind: 'file',
                    name: 'config.yaml',
                    getFile: async () => ({ text: async () => configYaml }) as unknown as File,
                } as unknown as FileSystemFileHandle
                yield {
                    kind: 'file',
                    name: 'notes.txt',
                    getFile: async () => ({ text: async () => 'ignore me' }) as unknown as File,
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

        await saveToDirectory(handle, root)

        expect(removeEntry).toHaveBeenCalledTimes(2)
        expect(removeEntry).toHaveBeenCalledWith('root-obsolete.yaml')
        expect(removeEntry).toHaveBeenCalledWith('config.yaml')
    })

    it('removes all stale top-level yaml files found during iteration before deleting any', async () => {
        const entries = [
            {
                kind: 'file',
                name: 'root.yaml',
                getFile: async () => ({ text: async () => 'expected' }) as unknown as File,
            },
            {
                kind: 'file',
                name: 'stale-a.yaml',
                getFile: async () => ({ text: async () => 'stale-a' }) as unknown as File,
            },
            {
                kind: 'file',
                name: 'stale-b.yaml',
                getFile: async () => ({ text: async () => 'stale-b' }) as unknown as File,
            },
        ]
        const removedNames: string[] = []
        const removeEntry = vi.fn().mockImplementation(async (name: string) => {
            removedNames.push(name)
            const index = entries.findIndex((entry) => entry.name === name)
            if (index >= 0) {
                entries.splice(index, 1)
            }
        })

        const handle: FileSystemDirectoryHandle = {
            kind: 'directory',
            name: 'test-dir',
            values: async function* () {
                let index = 0
                while (index < entries.length) {
                    yield entries[index] as unknown as FileSystemFileHandle
                    index += 1
                }
            },
            getFileHandle: vi.fn().mockImplementation(async () => ({
                createWritable: async () => ({
                    write: vi.fn().mockResolvedValue(undefined),
                    close: vi.fn().mockResolvedValue(undefined),
                }),
            })),
            removeEntry,
        } as unknown as FileSystemDirectoryHandle

        await saveToDirectory(handle, root)

        expect(removedNames).toEqual(['stale-a.yaml', 'stale-b.yaml'])
    })

    it('continues saving when stale top-level yaml removal races with another deletion', async () => {
        const writtenFiles: Record<string, string> = {}
        const removeEntry = vi
            .fn()
            .mockRejectedValueOnce(new DOMException('Not found', 'NotFoundError'))

        const handle: FileSystemDirectoryHandle = {
            kind: 'directory',
            name: 'test-dir',
            values: async function* () {
                yield {
                    kind: 'file',
                    name: 'root-obsolete.yaml',
                    getFile: async () => ({ text: async () => 'stale' }) as unknown as File,
                } as unknown as FileSystemFileHandle
            },
            getFileHandle: vi.fn().mockImplementation(async (name: string) => ({
                createWritable: async () => ({
                    write: vi.fn().mockImplementation(async (content: string) => {
                        writtenFiles[name] = content
                    }),
                    close: vi.fn().mockResolvedValue(undefined),
                }),
            })),
            removeEntry,
        } as unknown as FileSystemDirectoryHandle

        await expect(saveToDirectory(handle, root)).resolves.toBeUndefined()

        expect(removeEntry).toHaveBeenCalledWith('root-obsolete.yaml')
        expect(writtenFiles['root.yaml']).toContain('id: my-system')
        expect(writtenFiles['root-gateway.yaml']).toContain('id: gateway')
        expect(writtenFiles['root-gateway-auth.yaml']).toContain('id: auth')
        expect(writtenFiles['root-gateway-orders.yaml']).toContain('id: orders')
    })

    it('overlaps descendant writes instead of forcing them to run sequentially', async () => {
        const releaseWrites: Array<() => void> = []
        let activeWrites = 0
        let maxActiveWrites = 0

        const rootWritable = {
            write: vi.fn().mockResolvedValue(undefined),
            close: vi.fn().mockResolvedValue(undefined),
        }
        const descendantWrites = new Map<string, string>()

        const mockDir: FileSystemDirectoryHandle = {
            kind: 'directory',
            name: 'test',
            values: async function* () {},
            getFileHandle: vi.fn().mockImplementation(async (name: string) => ({
                createWritable: async () =>
                    name === 'root.yaml'
                        ? rootWritable
                        : {
                              write: vi.fn().mockImplementation(async (content: string) => {
                                  descendantWrites.set(name, content)
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
                          },
            })),
            removeEntry: vi.fn().mockResolvedValue(undefined),
        } as unknown as FileSystemDirectoryHandle

        const savePromise = saveToDirectory(mockDir, root)

        for (let attempt = 0; attempt < 20 && releaseWrites.length < 3; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 0))
        }

        expect(rootWritable.write).toHaveBeenCalledOnce()
        expect(releaseWrites).toHaveLength(3)
        expect(maxActiveWrites).toBeGreaterThan(1)

        for (const release of releaseWrites) release()
        await savePromise

        expect(descendantWrites.has('root-gateway.yaml')).toBe(true)
        expect(descendantWrites.has('root-gateway-auth.yaml')).toBe(true)
        expect(descendantWrites.has('root-gateway-orders.yaml')).toBe(true)
    })

    it('does not remove expected top-level yaml files', async () => {
        const expectedFiles = flattenToFiles(root)
        const removeEntry = vi.fn().mockResolvedValue(undefined)
        const handle: FileSystemDirectoryHandle = {
            kind: 'directory',
            name: 'test-dir',
            values: async function* () {
                for (const { relativePath, comp, childPaths } of expectedFiles) {
                    yield {
                        kind: 'file',
                        name: relativePath,
                        getFile: async () =>
                            ({
                                text: async () => serializeComponentYaml(comp, childPaths),
                            }) as unknown as File,
                    } as unknown as FileSystemFileHandle
                }
            },
            getFileHandle: vi.fn().mockImplementation(async () => ({
                createWritable: async () => ({
                    write: vi.fn().mockResolvedValue(undefined),
                    close: vi.fn().mockResolvedValue(undefined),
                }),
            })),
            removeEntry,
        } as unknown as FileSystemDirectoryHandle

        await saveToDirectory(handle, root)

        expect(removeEntry).not.toHaveBeenCalled()
    })

    it('does not attempt stale cleanup when no top-level yaml files are present', async () => {
        const removeEntry = vi.fn().mockResolvedValue(undefined)
        const mockDir: FileSystemDirectoryHandle = {
            kind: 'directory',
            name: 'test',
            values: async function* () {},
            getFileHandle: vi.fn().mockImplementation(async () => ({
                createWritable: async () => ({
                    write: vi.fn().mockResolvedValue(undefined),
                    close: vi.fn().mockResolvedValue(undefined),
                }),
            })),
            removeEntry,
        } as unknown as FileSystemDirectoryHandle

        await saveToDirectory(mockDir, root)

        expect(removeEntry).not.toHaveBeenCalled()
    })

    it('rejects when stale top-level yaml removal fails', async () => {
        const removeEntry = vi.fn().mockRejectedValue(new Error('permission denied'))
        const mockDir: FileSystemDirectoryHandle = {
            kind: 'directory',
            name: 'test',
            values: async function* () {
                yield {
                    kind: 'file',
                    name: 'root-obsolete.yaml',
                    getFile: async () => ({ text: async () => 'stale' }) as unknown as File,
                } as unknown as FileSystemFileHandle
            },
            getFileHandle: vi.fn().mockImplementation(async () => ({
                createWritable: async () => ({
                    write: vi.fn().mockResolvedValue(undefined),
                    close: vi.fn().mockResolvedValue(undefined),
                }),
            })),
            removeEntry,
        } as unknown as FileSystemDirectoryHandle

        await expect(saveToDirectory(mockDir, root)).rejects.toThrow('permission denied')
    })

    it('rejects when a concurrent descendant write fails', async () => {
        const writeError = new Error('disk full')

        const mockDir: FileSystemDirectoryHandle = {
            kind: 'directory',
            name: 'test',
            values: async function* () {},
            getFileHandle: vi.fn().mockImplementation(async (name: string) => ({
                createWritable: async () => ({
                    write: vi.fn().mockImplementation(async () => {
                        if (name === 'root-gateway-auth.yaml') throw writeError
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
        const rootYaml = serializeComponentYaml(makeComp('my-system'), ['root-gateway.yaml'])
        const gatewayYaml = serializeComponentYaml(makeComp('gateway'), ['root-gateway-auth.yaml'])
        const authYaml = serializeComponentYaml(makeComp('auth'), [])

        const handle = makeFSDirectoryHandle(
            new Map([
                ['root.yaml', rootYaml],
                ['root-gateway.yaml', gatewayYaml],
                ['root-gateway-auth.yaml', authYaml],
            ])
        )

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

    it('throws when root.yaml is missing', async () => {
        const gatewayYaml = serializeComponentYaml(makeComp('gateway'), ['root-gateway-auth.yaml'])
        const authYaml = serializeComponentYaml(makeComp('auth'), [])
        const handle = makeFSDirectoryHandle(
            new Map([
                ['root-gateway.yaml', gatewayYaml],
                ['root-gateway-auth.yaml', authYaml],
            ])
        )
        await expect(loadFromDirectory(handle)).rejects.toThrow(
            'The selected folder must contain root.yaml'
        )
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
            makeFetchMock({ '/models/my-system/root.yaml': { status: 200, body: rootYaml } })
        )

        const result = await loadFromUrl('my-system')
        expect(result.id).toBe('my-system')
        expect(result.subComponents).toHaveLength(0)
    })

    it('recursively fetches sub-components', async () => {
        const rootYaml = serializeComponentYaml(makeComp('my-system'), ['root-auth.yaml'])
        const authYaml = serializeComponentYaml(makeComp('auth'), [])
        vi.stubGlobal(
            'fetch',
            makeFetchMock({
                '/models/my-system/root.yaml': { status: 200, body: rootYaml },
                '/models/my-system/root-auth.yaml': { status: 200, body: authYaml },
            })
        )

        const result = await loadFromUrl('my-system')
        expect(result.id).toBe('my-system')
        expect(result.subComponents).toHaveLength(1)
        expect(result.subComponents[0].id).toBe('auth')
    })

    it('fetches sibling sub-components in parallel (each URL fetched once)', async () => {
        const rootYaml = serializeComponentYaml(makeComp('sys'), ['root-a.yaml', 'root-b.yaml'])
        const aYaml = serializeComponentYaml(makeComp('a'), [])
        const bYaml = serializeComponentYaml(makeComp('b'), [])
        const fetchMock = makeFetchMock({
            '/models/sys/root.yaml': { status: 200, body: rootYaml },
            '/models/sys/root-a.yaml': { status: 200, body: aYaml },
            '/models/sys/root-b.yaml': { status: 200, body: bYaml },
        })
        vi.stubGlobal('fetch', fetchMock)

        await loadFromUrl('sys')
        expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('throws NotFoundError when root YAML returns 404', async () => {
        vi.stubGlobal(
            'fetch',
            makeFetchMock({ '/models/missing/root.yaml': { status: 404, body: 'Not Found' } })
        )

        await expect(loadFromUrl('missing')).rejects.toBeInstanceOf(NotFoundError)
    })

    it('throws NotFoundError when a sub-component returns 404', async () => {
        const rootYaml = serializeComponentYaml(makeComp('sys'), ['root-ghost.yaml'])
        vi.stubGlobal(
            'fetch',
            makeFetchMock({
                '/models/sys/root.yaml': { status: 200, body: rootYaml },
                '/models/sys/root-ghost.yaml': { status: 404, body: 'Not Found' },
            })
        )

        await expect(loadFromUrl('sys')).rejects.toBeInstanceOf(NotFoundError)
    })

    it('throws a generic Error for non-404 server errors', async () => {
        vi.stubGlobal(
            'fetch',
            makeFetchMock({
                '/models/sys/root.yaml': { status: 500, body: 'Internal Server Error' },
            })
        )

        await expect(loadFromUrl('sys')).rejects.toThrow('Failed to fetch')
        await expect(loadFromUrl('sys')).rejects.not.toBeInstanceOf(NotFoundError)
    })

    it('throws if the fetched YAML is not a valid component', async () => {
        vi.stubGlobal(
            'fetch',
            makeFetchMock({
                '/models/bad/root.yaml': { status: 200, body: 'type: not-a-component\nid: bad' },
            })
        )

        await expect(loadFromUrl('bad')).rejects.toThrow('Invalid component YAML')
    })
})
