# Flat Filesystem Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flatten the saved model directory structure to a single directory with bare filenames (`root.yaml`, `root-<child>.yaml`, etc.), removing all subdirectory logic, and align URL loading paths to the same scheme.

**Architecture:** All changes are confined to `src/utils/systemFiles.ts` and its test file. Path helpers (`rootFilename`, `descendantPath`) drive naming; `flattenToFiles` carries a full ancestor array during DFS; `saveToDirectory` writes flat to `dir` with no `getDirectoryHandle`; `loadFromDirectory` reads `root.yaml` as entry point; `loadFromUrl` threads `rootId` to build fetch URLs from bare filenames. Static demo model files under `public/models/demo-system/` are renamed to the new scheme.

**Tech Stack:** TypeScript, js-yaml, Vitest, File System Access API (browser)

---

## Files Modified

- Modify: `src/utils/systemFiles.ts`
- Modify: `src/utils/systemFiles.test.ts`
- Modify: `public/models/demo-system/demo-system.yaml` → rename to `root.yaml`
- Rename: `public/models/demo-system/demo-system-auth-service.yaml` → `root-auth-service.yaml`
- Rename: `public/models/demo-system/demo-system-order-service.yaml` → `root-order-service.yaml`

---

### Task 1: Path helpers — `rootFilename` and `descendantPath`

**Files:**
- Modify: `src/utils/systemFiles.ts` (functions `rootFilename`, `descendantPath`)
- Modify: `src/utils/systemFiles.test.ts` (tests for `rootFilename`, `descendantPath`, and the path example in `serializeComponentYaml`)

- [ ] **Step 1: Update `rootFilename` and `descendantPath` tests to expect new behaviour**

In `src/utils/systemFiles.test.ts`, replace the `rootFilename` and `descendantPath` describe blocks:

```typescript
describe('rootFilename', () => {
    it('always returns root.yaml', () => {
        expect(rootFilename()).toBe('root.yaml')
    })
})

describe('descendantPath', () => {
    it('returns root-<selfId>.yaml for a direct child of root', () => {
        expect(descendantPath([], 'auth')).toBe('root-auth.yaml')
    })
    it('returns root-<ancestor>-<selfId>.yaml for deeper descendants', () => {
        expect(descendantPath(['gateway'], 'auth')).toBe('root-gateway-auth.yaml')
    })
    it('handles multiple ancestors', () => {
        expect(descendantPath(['gateway', 'sub'], 'leaf')).toBe('root-gateway-sub-leaf.yaml')
    })
})
```

Also update the path example in the `serializeComponentYaml` describe block (first test only):

```typescript
it('puts childPaths as subComponents list', () => {
    const content = serializeComponentYaml(leaf1, ['root-gateway-auth-child.yaml'])
    const parsed = yaml.load(content) as Record<string, unknown>
    expect(parsed.subComponents).toEqual(['root-gateway-auth-child.yaml'])
})
```

- [ ] **Step 2: Run tests to confirm failures**

```bash
npx vitest run src/utils/systemFiles.test.ts
```

Expected: TypeScript compile error on `rootFilename('my-system')` call sites, and failures on `descendantPath` signature mismatch. The test file itself will show type errors until the implementation is updated.

- [ ] **Step 3: Update `rootFilename` and `descendantPath` in `src/utils/systemFiles.ts`**

Replace the file-path helpers section (lines 28–38):

```typescript
// ── File path helpers ─────────────────────────────────────────────────────────

/** Filename for the root component YAML. Always 'root.yaml'. */
export function rootFilename(): string {
    return 'root.yaml'
}

/**
 * Filename for a descendant YAML.
 * `ancestors` is the list of component IDs from root's direct child down to
 * the immediate parent (not including the root itself or self).
 */
export function descendantPath(ancestors: string[], selfId: string): string {
    return `root-${[...ancestors, selfId].join('-')}.yaml`
}
```

- [ ] **Step 4: Run tests to confirm Task 1 tests pass**

```bash
npx vitest run src/utils/systemFiles.test.ts
```

Expected: `rootFilename` and `descendantPath` describe blocks PASS. `flattenToFiles`, `saveToDirectory`, `loadFromDirectory`, `assembleTree`, and `loadFromUrl` tests will still fail because they reference old paths — that is expected at this point.

- [ ] **Step 5: Run lint**

```bash
npm run lint:fix
```

- [ ] **Step 6: Commit**

```bash
git add src/utils/systemFiles.ts src/utils/systemFiles.test.ts
git commit -m "feat: update rootFilename and descendantPath to flat naming scheme [2026-04-07-flat-filesystem-layout.md:Task 1]"
```

---

### Task 2: `flattenToFiles` and `assembleTree` tests

**Files:**
- Modify: `src/utils/systemFiles.ts` (function `flattenToFiles`)
- Modify: `src/utils/systemFiles.test.ts` (tests for `flattenToFiles` and `assembleTree`)

The fixtures (`root`, `mid`, `leaf1`, `leaf2`) in the test file do not change. With the tree `my-system → gateway → [auth, orders]`, the new expected paths are:

| Component | Old path | New path |
|---|---|---|
| my-system | `my-system.yaml` | `root.yaml` |
| gateway | `my-system/my-system-gateway.yaml` | `root-gateway.yaml` |
| auth | `my-system/gateway-auth.yaml` | `root-gateway-auth.yaml` |
| orders | `my-system/gateway-orders.yaml` | `root-gateway-orders.yaml` |

- [ ] **Step 1: Update `flattenToFiles` tests**

Replace the `flattenToFiles` describe block in `src/utils/systemFiles.test.ts`:

```typescript
describe('flattenToFiles', () => {
    it('produces one entry per component', () => {
        const entries = flattenToFiles(root)
        expect(entries).toHaveLength(4) // root, gateway, auth, orders
    })

    it('root entry has relativePath root.yaml and correct childPaths', () => {
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
```

- [ ] **Step 2: Update `assembleTree` tests**

Replace the `assembleTree` describe block in `src/utils/systemFiles.test.ts`:

```typescript
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
        const rawRoot: RawComponent = {
            ...makeComp('root'),
            subComponents: ['root-missing.yaml'],
        }
        const fileMap = new Map<string, RawComponent>([['root.yaml', rawRoot]])
        expect(() => assembleTree(rawRoot, fileMap)).toThrow('Missing component file')
    })
})
```

- [ ] **Step 3: Run tests to confirm failures**

```bash
npx vitest run src/utils/systemFiles.test.ts
```

Expected: `flattenToFiles` and `assembleTree` tests FAIL (old paths still produced by implementation). `rootFilename` and `descendantPath` tests still PASS.

- [ ] **Step 4: Update `flattenToFiles` in `src/utils/systemFiles.ts`**

Replace the `flattenToFiles` function (the `visit` inner function and call):

```typescript
export function flattenToFiles(root: ComponentNode): FileEntry[] {
    const entries: FileEntry[] = []

    function visit(comp: ComponentNode, ancestors: string[] | null): void {
        const path = ancestors === null ? rootFilename() : descendantPath(ancestors, comp.id)
        const childAncestors = ancestors === null ? [] : [...ancestors, comp.id]

        const childPaths = comp.subComponents.map((child) =>
            descendantPath(childAncestors, child.id)
        )

        entries.push({ relativePath: path, comp, childPaths })

        for (const child of comp.subComponents) {
            visit(child, childAncestors)
        }
    }

    visit(root, null)
    return entries
}
```

- [ ] **Step 5: Run tests to confirm Task 2 tests pass**

```bash
npx vitest run src/utils/systemFiles.test.ts
```

Expected: `rootFilename`, `descendantPath`, `flattenToFiles`, `serializeComponentYaml`, and `assembleTree` describe blocks all PASS. `saveToDirectory`, `loadFromDirectory`, and `loadFromUrl` still fail — expected.

- [ ] **Step 6: Run lint**

```bash
npm run lint:fix
```

- [ ] **Step 7: Commit**

```bash
git add src/utils/systemFiles.ts src/utils/systemFiles.test.ts
git commit -m "feat: update flattenToFiles to track full ancestor chain for flat filenames [2026-04-07-flat-filesystem-layout.md:Task 2]"
```

---

### Task 3: `saveToDirectory` — flat writes, no subdirectory, no `previousRootId`

**Files:**
- Modify: `src/utils/systemFiles.ts` (function `saveToDirectory`)
- Modify: `src/utils/systemFiles.test.ts` (all `saveToDirectory` tests)

Key changes:
- Remove `previousRootId` parameter.
- Remove `getDirectoryHandle` / subdir creation.
- All files written directly to `dir`.
- Stale cleanup: iterate `dir`, remove `*.yaml` files that start with `root` and are not in the expected write set.
- Remove 4 `previousRootId`-related tests.

- [ ] **Step 1: Replace all `saveToDirectory` tests**

Replace the entire `saveToDirectory` describe block in `src/utils/systemFiles.test.ts`:

```typescript
describe('saveToDirectory', () => {
    it('writes root file and all descendant files to the flat directory', async () => {
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

        expect(writtenFiles['root.yaml']).toBeDefined()
        const rootParsed = yaml.load(writtenFiles['root.yaml']) as Record<string, unknown>
        expect(rootParsed.id).toBe('my-system')
        expect(rootParsed.subComponents).toEqual(['root-gateway.yaml'])

        expect(writtenFiles['root-gateway.yaml']).toBeDefined()
        expect(writtenFiles['root-gateway-auth.yaml']).toBeDefined()
        expect(writtenFiles['root-gateway-orders.yaml']).toBeDefined()
    })

    it('removes stale root-prefixed yaml files but leaves unrelated files', async () => {
        const removeEntry = vi.fn().mockResolvedValue(undefined)

        const mockDir: FileSystemDirectoryHandle = {
            kind: 'directory',
            name: 'test',
            values: async function* () {
                // 'root-gateway.yaml' is expected — should NOT be removed
                yield {
                    kind: 'file',
                    name: 'root-gateway.yaml',
                    getFile: vi.fn(),
                } as unknown as FileSystemFileHandle
                // 'root-obsolete.yaml' is stale — should be removed
                yield {
                    kind: 'file',
                    name: 'root-obsolete.yaml',
                    getFile: vi.fn(),
                } as unknown as FileSystemFileHandle
                // 'notes.txt' is not a yaml — should NOT be removed
                yield {
                    kind: 'file',
                    name: 'notes.txt',
                    getFile: vi.fn(),
                } as unknown as FileSystemFileHandle
                // 'unrelated.yaml' does not start with 'root' — should NOT be removed
                yield {
                    kind: 'file',
                    name: 'unrelated.yaml',
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
        expect(removeEntry).toHaveBeenCalledWith('root-obsolete.yaml')
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
            getFileHandle: vi.fn().mockImplementation(async (name: string) => {
                if (name === 'root.yaml') {
                    return { createWritable: async () => rootWritable }
                }
                return {
                    createWritable: async () => ({
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
                    }),
                }
            }),
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
```

- [ ] **Step 2: Run tests to confirm failures**

```bash
npx vitest run src/utils/systemFiles.test.ts
```

Expected: `saveToDirectory` tests FAIL (old implementation still uses `getDirectoryHandle` and `previousRootId`).

- [ ] **Step 3: Replace `saveToDirectory` in `src/utils/systemFiles.ts`**

Replace the entire `saveToDirectory` function:

```typescript
/**
 * Writes the entire component tree to a directory as individual YAML files.
 * All files are written flat (no subdirectories).
 * Removes stale root.yaml / root-*.yaml files not in the expected write set.
 */
export async function saveToDirectory(
    dir: FileSystemDirectoryHandle,
    root: ComponentNode
): Promise<void> {
    const entries = flattenToFiles(root)
    const expectedFiles = new Set(entries.map(({ relativePath }) => relativePath))

    for await (const entry of dir.values()) {
        if (
            entry.kind === 'file' &&
            entry.name.endsWith('.yaml') &&
            (entry.name === 'root.yaml' || entry.name.startsWith('root-')) &&
            !expectedFiles.has(entry.name)
        ) {
            await dir.removeEntry(entry.name)
        }
    }

    const rootEntry = entries.find(({ relativePath }) => relativePath === 'root.yaml')!
    await writeComponentFile(
        dir,
        'root.yaml',
        serializeComponentYaml(rootEntry.comp, rootEntry.childPaths)
    )

    const descendantJobs = entries
        .filter(({ relativePath }) => relativePath !== 'root.yaml')
        .map(({ relativePath, comp, childPaths }) => ({
            filename: relativePath,
            content: serializeComponentYaml(comp, childPaths),
        }))

    await runWithConcurrency(
        descendantJobs,
        DESCENDANT_WRITE_CONCURRENCY,
        async ({ filename, content }) => {
            await writeComponentFile(dir, filename, content)
        }
    )
}
```

- [ ] **Step 4: Run tests to confirm Task 3 tests pass**

```bash
npx vitest run src/utils/systemFiles.test.ts
```

Expected: `rootFilename`, `descendantPath`, `flattenToFiles`, `serializeComponentYaml`, `assembleTree`, and `saveToDirectory` all PASS. `loadFromDirectory` and `loadFromUrl` still fail.

- [ ] **Step 5: Run lint**

```bash
npm run lint:fix
```

- [ ] **Step 6: Commit**

```bash
git add src/utils/systemFiles.ts src/utils/systemFiles.test.ts
git commit -m "feat: rewrite saveToDirectory to flat layout, remove subdirectory and previousRootId logic [2026-04-07-flat-filesystem-layout.md:Task 3]"
```

---

### Task 4: `loadFromDirectory` — flat reads, `root.yaml` as entry point

**Files:**
- Modify: `src/utils/systemFiles.ts` (function `loadFromDirectory`)
- Modify: `src/utils/systemFiles.test.ts` (`makeFSDirectoryHandle` helper + `loadFromDirectory` tests)

The `makeFSDirectoryHandle` helper is only used by `loadFromDirectory` tests. Simplify it to a flat file map (remove the `subdirs` parameter). The `loadFromDirectory` implementation no longer iterates subdirectories.

- [ ] **Step 1: Replace `makeFSDirectoryHandle` and the `loadFromDirectory` tests**

In `src/utils/systemFiles.test.ts`, replace the `makeFSDirectoryHandle` function and the `loadFromDirectory` describe block:

```typescript
function makeFSDirectoryHandle(files: Map<string, string>): FileSystemDirectoryHandle {
    async function* yieldEntries(): AsyncIterableIterator<FileSystemFileHandle> {
        for (const [name, content] of files) {
            yield {
                kind: 'file',
                name,
                getFile: async () => ({ text: async () => content }) as unknown as File,
            } as unknown as FileSystemFileHandle
        }
    }

    return {
        kind: 'directory',
        name: 'test-dir',
        values: yieldEntries,
        getFileHandle: vi.fn(),
        removeEntry: vi.fn(),
    } as unknown as FileSystemDirectoryHandle
}
```

```typescript
describe('loadFromDirectory', () => {
    it('loads and assembles a tree from flat directory files', async () => {
        const rootYaml = serializeComponentYaml(makeComp('my-system'), ['root-gateway.yaml'])
        const gatewayYaml = serializeComponentYaml(makeComp('gateway'), [
            'root-gateway-auth.yaml',
        ])
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

    it('throws if root.yaml is not found in the directory', async () => {
        const handle = makeFSDirectoryHandle(new Map())
        await expect(loadFromDirectory(handle)).rejects.toThrow('No component files found')
    })

    it('ignores non-root yaml files and non-yaml files', async () => {
        const rootYaml = serializeComponentYaml(makeComp('my-system'), [])
        const handle = makeFSDirectoryHandle(
            new Map([
                ['root.yaml', rootYaml],
                ['unrelated.yaml', 'type: something-else\n'],
                ['notes.txt', 'ignore me'],
            ])
        )
        const loaded = await loadFromDirectory(handle)
        expect(loaded.id).toBe('my-system')
    })
})
```

- [ ] **Step 2: Run tests to confirm failures**

```bash
npx vitest run src/utils/systemFiles.test.ts
```

Expected: `loadFromDirectory` tests FAIL (old implementation still traverses subdirectories and looks for top-level `<rootId>.yaml`).

- [ ] **Step 3: Replace `loadFromDirectory` in `src/utils/systemFiles.ts`**

Replace the entire `loadFromDirectory` function:

```typescript
/**
 * Loads a component tree from a flat directory.
 * Expects root.yaml as the entry point; descendant files are referenced by
 * bare filename in each component's subComponents list.
 */
export async function loadFromDirectory(dir: FileSystemDirectoryHandle): Promise<ComponentNode> {
    const fileMap = new Map<string, RawComponent>()

    for await (const entry of dir.values()) {
        if (
            entry.kind === 'file' &&
            entry.name.endsWith('.yaml') &&
            (entry.name === 'root.yaml' || entry.name.startsWith('root-'))
        ) {
            const file = await entry.getFile()
            const text = await file.text()
            const parsed = yaml.load(text) as RawComponent | null
            if (parsed && typeof parsed === 'object' && parsed.type === 'component') {
                fileMap.set(entry.name, parsed)
            }
        }
    }

    const rootRaw = fileMap.get('root.yaml')
    if (!rootRaw) throw new Error('No component files found in directory')
    return parseComponentNode(assembleTree(rootRaw, fileMap))
}
```

- [ ] **Step 4: Run tests to confirm Task 4 tests pass**

```bash
npx vitest run src/utils/systemFiles.test.ts
```

Expected: all describe blocks up to and including `loadFromDirectory` PASS. Only `loadFromUrl` still fails.

- [ ] **Step 5: Run lint**

```bash
npm run lint:fix
```

- [ ] **Step 6: Commit**

```bash
git add src/utils/systemFiles.ts src/utils/systemFiles.test.ts
git commit -m "feat: rewrite loadFromDirectory to flat layout with root.yaml entry point [2026-04-07-flat-filesystem-layout.md:Task 4]"
```

---

### Task 5: `loadFromUrl` — thread `rootId` for URL building

**Files:**
- Modify: `src/utils/systemFiles.ts` (internal `fetchComponentTree`, exported `loadFromUrl`)
- Modify: `src/utils/systemFiles.test.ts` (`loadFromUrl` tests)

`fetchComponentTree` gains a `rootId` parameter to build full fetch URLs from bare filenames. `loadFromUrl` passes `'root.yaml'` as the entry filename.

- [ ] **Step 1: Update all `loadFromUrl` tests**

Replace the `loadFromUrl` describe block in `src/utils/systemFiles.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to confirm failures**

```bash
npx vitest run src/utils/systemFiles.test.ts
```

Expected: `loadFromUrl` tests FAIL (old implementation fetches `<rootId>/<rootId>.yaml` and passes full paths in subComponents).

- [ ] **Step 3: Replace `fetchComponentTree` and `loadFromUrl` in `src/utils/systemFiles.ts`**

Replace the two functions in the URL-based loading section:

```typescript
async function fetchComponentTree(
    filename: string,
    rootId: string,
    fileMap: Map<string, RawComponent>
): Promise<void> {
    if (fileMap.has(filename)) return
    const raw = await fetchRawComponent(`${MODELS_BASE_PATH}/${rootId}/${filename}`)
    fileMap.set(filename, raw)
    await Promise.all(
        raw.subComponents.map((childFilename) =>
            fetchComponentTree(childFilename, rootId, fileMap)
        )
    )
}

/**
 * Loads a component tree from the web server at /models/<rootId>/root.yaml,
 * recursively fetching all referenced sub-components by bare filename.
 */
export async function loadFromUrl(rootId: string): Promise<ComponentNode> {
    const fileMap = new Map<string, RawComponent>()
    await fetchComponentTree('root.yaml', rootId, fileMap)
    const rootRaw = fileMap.get('root.yaml')
    if (!rootRaw) throw new Error(`Root component not found for id: ${rootId}`)
    return parseComponentNode(assembleTree(rootRaw, fileMap))
}
```

- [ ] **Step 4: Run all tests to confirm everything passes**

```bash
npx vitest run src/utils/systemFiles.test.ts
```

Expected: ALL tests PASS.

- [ ] **Step 5: Run lint**

```bash
npm run lint:fix
```

- [ ] **Step 6: Commit**

```bash
git add src/utils/systemFiles.ts src/utils/systemFiles.test.ts
git commit -m "feat: update loadFromUrl to fetch root.yaml and thread rootId for bare filename resolution [2026-04-07-flat-filesystem-layout.md:Task 5]"
```

---

### Task 6: Update demo model static files

**Files:**
- Rename: `public/models/demo-system/demo-system.yaml` → `public/models/demo-system/root.yaml`
- Rename: `public/models/demo-system/demo-system-auth-service.yaml` → `public/models/demo-system/root-auth-service.yaml`
- Rename: `public/models/demo-system/demo-system-order-service.yaml` → `public/models/demo-system/root-order-service.yaml`
- Update `subComponents` references in `root.yaml`

No TDD for static assets — verify by running the full test suite.

- [ ] **Step 1: Rename the files**

```bash
git mv public/models/demo-system/demo-system.yaml public/models/demo-system/root.yaml
git mv public/models/demo-system/demo-system-auth-service.yaml public/models/demo-system/root-auth-service.yaml
git mv public/models/demo-system/demo-system-order-service.yaml public/models/demo-system/root-order-service.yaml
```

- [ ] **Step 2: Update `subComponents` in `root.yaml`**

In `public/models/demo-system/root.yaml`, change the `subComponents` list from:

```yaml
subComponents:
  - demo-system/demo-system-auth-service.yaml
  - demo-system/demo-system-order-service.yaml
```

to:

```yaml
subComponents:
  - root-auth-service.yaml
  - root-order-service.yaml
```

- [ ] **Step 3: Run the full test suite to confirm no regressions**

```bash
npx vitest run
```

Expected: ALL tests PASS.

- [ ] **Step 4: Run lint**

```bash
npm run lint:fix
```

- [ ] **Step 5: Commit**

```bash
git add public/models/demo-system/
git commit -m "chore: rename demo model files to flat naming scheme [2026-04-07-flat-filesystem-layout.md:Task 6]"
```
