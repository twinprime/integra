# Flat Filesystem Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `<rootId>/` subdirectory from the component YAML file layout so all files are flat in the chosen directory, while keeping `${parentId}-${selfId}.yaml` filenames unchanged.

**Architecture:** `descendantPath` loses its `rootId` prefix and returns a bare filename. `saveToDirectory` writes all files directly to `dir`. `loadFromDirectory` reads files flat and detects the root by finding the unreferenced file. `loadFromUrl` resolves sub-component filenames relative to `${rootId}/` on the server.

**Tech Stack:** TypeScript, js-yaml, File System Access API, Vitest

---

### Task 1: Update `descendantPath` and `flattenToFiles`

**Files:**
- Modify: `src/utils/systemFiles.ts`
- Modify: `src/utils/systemFiles.test.ts`

- [ ] **Step 1: Update the `descendantPath` test to expect a bare filename**

In `src/utils/systemFiles.test.ts`, replace the `descendantPath` describe block:

```typescript
describe('descendantPath', () => {
    it('returns <parentId>-<selfId>.yaml', () => {
        expect(descendantPath('gateway', 'auth')).toBe('gateway-auth.yaml')
    })
})
```

- [ ] **Step 2: Update the `flattenToFiles` tests to expect bare filenames**

Replace the entire `flattenToFiles` describe block in `src/utils/systemFiles.test.ts`:

```typescript
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
        expect(gatewayEntry.childPaths).toEqual([
            'gateway-auth.yaml',
            'gateway-orders.yaml',
        ])
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
```

- [ ] **Step 3: Run the failing tests**

```bash
cd /home/app/dev/integra && npm run test:run -- src/utils/systemFiles.test.ts
```

Expected: FAIL — `descendantPath` and `flattenToFiles` tests fail because paths still include `my-system/` prefix.

- [ ] **Step 4: Update `descendantPath` and `flattenToFiles` in `src/utils/systemFiles.ts`**

Replace the file-path helpers section and the `flattenToFiles` function. Change the JSDoc comment block at the top of the file:

```typescript
/**
 * systemFiles.ts
 *
 * Utilities for saving and loading a ComponentNode tree as a directory of YAML files.
 *
 * File layout:
 *   <chosen-dir>/
 *     <root-id>.yaml              ← root component (entry point)
 *     <root-id>-<child-id>.yaml   ← direct children of root
 *     <parent-id>-<child-id>.yaml ← deeper descendants
 *
 * The `subComponents` field in each YAML holds a list of bare filenames
 * (relative to the chosen directory root), e.g.:
 *   subComponents:
 *     - my-system-auth.yaml
 *     - my-system-orders.yaml
 */
```

Replace `descendantPath`:

```typescript
/** Filename for a descendant YAML (flat in the chosen directory). */
export function descendantPath(parentId: string, selfId: string): string {
    return `${parentId}-${selfId}.yaml`
}
```

Replace `flattenToFiles`:

```typescript
export function flattenToFiles(root: ComponentNode): FileEntry[] {
    const entries: FileEntry[] = []

    function visit(comp: ComponentNode, parentId: string | null): void {
        const path =
            parentId === null ? rootFilename(root.id) : descendantPath(parentId, comp.id)

        const childPaths = comp.subComponents.map((child) =>
            descendantPath(comp.id, child.id)
        )

        entries.push({ relativePath: path, comp, childPaths })

        for (const child of comp.subComponents) {
            visit(child, comp.id)
        }
    }

    visit(root, null)
    return entries
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
cd /home/app/dev/integra && npm run test:run -- src/utils/systemFiles.test.ts
```

Expected: `descendantPath` and `flattenToFiles` tests PASS; other test suites may still fail (they will be fixed in subsequent tasks).

- [ ] **Step 6: Commit**

```bash
cd /home/app/dev/integra && git add src/utils/systemFiles.ts src/utils/systemFiles.test.ts && git commit -m "refactor: flatten descendantPath — remove rootId subdir prefix from filenames"
```

---

### Task 2: Update `saveToDirectory`

**Files:**
- Modify: `src/utils/systemFiles.ts`
- Modify: `src/utils/systemFiles.test.ts`
- Modify: `src/components/tree/TreeToolbar.tsx`

- [ ] **Step 1: Replace the `saveToDirectory` describe block in `src/utils/systemFiles.test.ts`**

Remove all existing `saveToDirectory` tests and replace with:

```typescript
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
```

- [ ] **Step 2: Run the failing tests**

```bash
cd /home/app/dev/integra && npm run test:run -- src/utils/systemFiles.test.ts
```

Expected: FAIL — `saveToDirectory` tests fail because implementation still uses subdirectory.

- [ ] **Step 3: Replace `saveToDirectory` in `src/utils/systemFiles.ts`**

Replace the entire `saveToDirectory` function:

```typescript
/**
 * Writes the entire component tree to a directory as individual YAML files.
 * All files are written flat — no subdirectory is created.
 * Removes stale *.yaml files in the directory before writing fresh ones.
 */
export async function saveToDirectory(
    dir: FileSystemDirectoryHandle,
    root: ComponentNode
): Promise<void> {
    const entries = flattenToFiles(root)
    const expectedFiles = new Set(entries.map(({ relativePath }) => relativePath))

    // Remove stale YAML files from the directory
    for await (const entry of dir.values()) {
        if (
            entry.kind === 'file' &&
            entry.name.endsWith('.yaml') &&
            !expectedFiles.has(entry.name)
        ) {
            await dir.removeEntry(entry.name)
        }
    }

    await runWithConcurrency(
        entries,
        DESCENDANT_WRITE_CONCURRENCY,
        async ({ relativePath, comp, childPaths }) => {
            await writeComponentFile(dir, relativePath, serializeComponentYaml(comp, childPaths))
        }
    )
}
```

- [ ] **Step 4: Update the `saveToDirectory` call in `src/components/tree/TreeToolbar.tsx`**

Remove `savedRootId` state and its usages, and drop the third argument from `saveToDirectory`:

In the state declarations (around line 78), remove:
```typescript
const [savedRootId, setSavedRootId] = useState<string | null>(null)
```

In `handleSave`, change:
```typescript
await saveToDirectory(handle, rootComponent, savedRootId ?? undefined)
setDirHandle(handle)
setSavedRootId(rootComponent.id)
```
to:
```typescript
await saveToDirectory(handle, rootComponent)
setDirHandle(handle)
```

In `handleLoad`, remove:
```typescript
setSavedRootId(loadedSystem.id)
```

In `handleClear`, remove:
```typescript
setSavedRootId(null)
```

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
cd /home/app/dev/integra && npm run test:run -- src/utils/systemFiles.test.ts src/components/tree/TreeToolbar.test.tsx
```

Expected: All `saveToDirectory` tests PASS; `TreeToolbar` tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/app/dev/integra && git add src/utils/systemFiles.ts src/utils/systemFiles.test.ts src/components/tree/TreeToolbar.tsx && git commit -m "refactor: flatten saveToDirectory — write all files directly to dir, remove previousRootId"
```

---

### Task 3: Update `loadFromDirectory`

**Files:**
- Modify: `src/utils/systemFiles.ts`
- Modify: `src/utils/systemFiles.test.ts`

- [ ] **Step 1: Update the `loadFromDirectory` describe block in `src/utils/systemFiles.test.ts`**

Replace the entire `loadFromDirectory` describe block:

```typescript
describe('loadFromDirectory', () => {
    it('loads and assembles a tree from flat directory files', async () => {
        const rootYaml = serializeComponentYaml(makeComp('my-system'), [
            'my-system-gateway.yaml',
        ])
        const gatewayYaml = serializeComponentYaml(makeComp('gateway'), [
            'gateway-auth.yaml',
        ])
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
})
```

- [ ] **Step 2: Run the failing tests**

```bash
cd /home/app/dev/integra && npm run test:run -- src/utils/systemFiles.test.ts
```

Expected: FAIL — `loadFromDirectory` tests fail.

- [ ] **Step 3: Replace `loadFromDirectory` in `src/utils/systemFiles.ts`**

Replace the entire `loadFromDirectory` function:

```typescript
/**
 * Loads a component tree from a directory.
 * All component YAML files are expected to be flat in the directory (no subdirectories).
 * The root component is the file not referenced as a sub-component by any other file.
 */
export async function loadFromDirectory(dir: FileSystemDirectoryHandle): Promise<ComponentNode> {
    const fileMap = new Map<string, RawComponent>()

    for await (const entry of dir.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.yaml')) {
            const file = await entry.getFile()
            const text = await file.text()
            const parsed = yaml.load(text) as RawComponent | null
            if (parsed && typeof parsed === 'object' && parsed.type === 'component') {
                fileMap.set(entry.name, parsed)
            }
        }
    }

    if (fileMap.size === 0) throw new Error('No component files found in directory')

    const referencedFiles = new Set<string>()
    for (const raw of fileMap.values()) {
        for (const childPath of raw.subComponents) {
            referencedFiles.add(childPath)
        }
    }

    const rootFiles = [...fileMap.keys()].filter((name) => !referencedFiles.has(name))

    if (rootFiles.length > 1) {
        throw new Error(
            `The selected folder contains ${rootFiles.length} root component YAML files ` +
                `(${rootFiles.join(', ')}). Select a folder with exactly one root component YAML file.`
        )
    }

    const rootRaw = fileMap.get(rootFiles[0])!
    return parseComponentNode(assembleTree(rootRaw, fileMap))
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
cd /home/app/dev/integra && npm run test:run -- src/utils/systemFiles.test.ts
```

Expected: All `loadFromDirectory` tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/app/dev/integra && git add src/utils/systemFiles.ts src/utils/systemFiles.test.ts && git commit -m "refactor: flatten loadFromDirectory — read all files flat, detect root by unreferenced file"
```

---

### Task 4: Update `loadFromUrl`

**Files:**
- Modify: `src/utils/systemFiles.ts`
- Modify: `src/utils/systemFiles.test.ts`

- [ ] **Step 1: Update the `loadFromUrl` describe block in `src/utils/systemFiles.test.ts`**

Replace the entire `loadFromUrl` describe block:

```typescript
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
            'my-system-auth.yaml',
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
            'sys-a.yaml',
            'sys-b.yaml',
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
            makeFetchMock({
                '/models/missing/missing.yaml': { status: 404, body: 'Not Found' },
            })
        )

        await expect(loadFromUrl('missing')).rejects.toBeInstanceOf(NotFoundError)
    })

    it('throws NotFoundError when a sub-component returns 404', async () => {
        const rootYaml = serializeComponentYaml(makeComp('sys'), ['sys-ghost.yaml'])
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
```

- [ ] **Step 2: Run the failing tests**

```bash
cd /home/app/dev/integra && npm run test:run -- src/utils/systemFiles.test.ts
```

Expected: FAIL — `loadFromUrl` tests fail because fetch URLs and fileMap keys still use old paths.

- [ ] **Step 3: Replace `fetchComponentTree` and `loadFromUrl` in `src/utils/systemFiles.ts`**

Replace both functions in the URL-based loading section:

```typescript
async function fetchComponentTree(
    relativePath: string,
    fileMap: Map<string, RawComponent>,
    rootId: string
): Promise<void> {
    if (fileMap.has(relativePath)) return
    const raw = await fetchRawComponent(`${MODELS_BASE_PATH}/${rootId}/${relativePath}`)
    fileMap.set(relativePath, raw)
    await Promise.all(
        raw.subComponents.map((childPath) => fetchComponentTree(childPath, fileMap, rootId))
    )
}

/**
 * Loads a component tree from the web server at /models/<rootId>/<rootId>.yaml,
 * recursively fetching all referenced sub-components from the same /models/<rootId>/ directory.
 */
export async function loadFromUrl(rootId: string): Promise<ComponentNode> {
    const rootPath = `${rootId}.yaml`
    const fileMap = new Map<string, RawComponent>()
    await fetchComponentTree(rootPath, fileMap, rootId)
    const rootRaw = fileMap.get(rootPath)
    if (!rootRaw) throw new Error(`Root component not found for id: ${rootId}`)
    return parseComponentNode(assembleTree(rootRaw, fileMap))
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
cd /home/app/dev/integra && npm run test:run -- src/utils/systemFiles.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/app/dev/integra && git add src/utils/systemFiles.ts src/utils/systemFiles.test.ts && git commit -m "refactor: flatten loadFromUrl — resolve sub-components relative to rootId directory"
```

---

### Task 5: Update `assembleTree` tests and demo YAML

**Files:**
- Modify: `src/utils/systemFiles.test.ts`
- Modify: `public/models/demo-system/demo-system.yaml`

- [ ] **Step 1: Update the `assembleTree` describe block in `src/utils/systemFiles.test.ts`**

Replace the entire `assembleTree` describe block:

```typescript
describe('assembleTree', () => {
    it('assembles a 3-level tree correctly', () => {
        const rawRoot: RawComponent = {
            ...makeComp('my-system'),
            subComponents: ['my-system-gateway.yaml'],
        }
        const rawGateway: RawComponent = {
            ...makeComp('gateway'),
            subComponents: ['gateway-auth.yaml'],
        }
        const rawAuth: RawComponent = { ...makeComp('auth'), subComponents: [] }
        const fileMap = new Map<string, RawComponent>([
            ['my-system.yaml', rawRoot],
            ['my-system-gateway.yaml', rawGateway],
            ['gateway-auth.yaml', rawAuth],
        ])
        const assembled = assembleTree(rawRoot, fileMap)
        expect(assembled.id).toBe('my-system')
        expect(assembled.subComponents).toHaveLength(1)
        expect(assembled.subComponents[0].id).toBe('gateway')
        expect(assembled.subComponents[0].subComponents[0].id).toBe('auth')
    })

    it('throws if a referenced file is missing', () => {
        const rawRoot: RawComponent = { ...makeComp('root'), subComponents: ['missing.yaml'] }
        const fileMap = new Map<string, RawComponent>([['root.yaml', rawRoot]])
        expect(() => assembleTree(rawRoot, fileMap)).toThrow('Missing component file')
    })
})
```

- [ ] **Step 2: Run the tests to confirm they pass**

```bash
cd /home/app/dev/integra && npm run test:run -- src/utils/systemFiles.test.ts
```

Expected: All tests PASS.

- [ ] **Step 3: Update `subComponents` in `public/models/demo-system/demo-system.yaml`**

Change the `subComponents` field from:

```yaml
subComponents:
  - demo-system/demo-system-auth-service.yaml
  - demo-system/demo-system-order-service.yaml
```

to:

```yaml
subComponents:
  - demo-system-auth-service.yaml
  - demo-system-order-service.yaml
```

- [ ] **Step 4: Commit**

```bash
cd /home/app/dev/integra && git add src/utils/systemFiles.test.ts public/models/demo-system/demo-system.yaml && git commit -m "fix: update assembleTree tests and demo YAML to use flat sub-component paths"
```

---

### Task 6: Lint and final check

**Files:**
- No new files

- [ ] **Step 1: Run the full test suite**

```bash
cd /home/app/dev/integra && npm run test:run
```

Expected: All tests PASS.

- [ ] **Step 2: Run the linter**

```bash
cd /home/app/dev/integra && npm run lint:fix
```

Expected: No errors reported.

- [ ] **Step 3: Commit if lint made any changes**

```bash
cd /home/app/dev/integra && git diff --quiet || git add -p && git commit -m "chore: lint fixes"
```
