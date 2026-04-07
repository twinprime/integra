# Flat Model Paths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the nested component YAML layout with a flat `root.yaml`-based layout and make `/models/<modelId>` load the exact same relative paths.

**Architecture:** Keep the change centered in `src/utils/systemFiles.ts`, where path generation, directory save/load, and URL loading already live. Introduce one flat-path helper flow shared by serialization and URL fetching, remove subdirectory-specific logic entirely, and update tests/fixtures so the new layout is enforced from unit tests through e2e.

**Tech Stack:** TypeScript, Vitest, Playwright, Vite, js-yaml, File System Access API mocks

---

## File map

- Modify: `src/utils/systemFiles.ts` — replace nested path helpers, flatten save/load behavior, and align `/models` URL loading.
- Modify: `src/utils/systemFiles.test.ts` — update helper, flattening, directory save/load, and URL-loading tests to the new path rules.
- Modify: `e2e/model-route.spec.ts` — update mocked `/models` responses to `root.yaml` and flat descendant names.
- Modify: `public/models/demo-system/demo-system.yaml`
- Modify: `public/models/demo-system/demo-system-auth-service.yaml`
- Modify: `public/models/demo-system/demo-system-order-service.yaml`
- Rename/Create as needed under `public/models/demo-system/` so fixture filenames match the flat layout.
- Check: `README.md` — only update if it explicitly documents the old nested persistence layout.

### Task 1: Replace path helpers and lock the naming rules with unit tests

**Files:**
- Modify: `src/utils/systemFiles.test.ts`
- Modify: `src/utils/systemFiles.ts`
- Test: `src/utils/systemFiles.test.ts`

- [ ] **Step 1: Write the failing helper-path tests**

```ts
describe('rootFilename', () => {
    it('always returns root.yaml', () => {
        expect(rootFilename('my-system')).toBe('root.yaml')
        expect(rootFilename('another-root')).toBe('root.yaml')
    })
})

describe('descendantPath', () => {
    it('returns a flat root-prefixed filename from the ancestor chain', () => {
        expect(descendantPath(['gateway'], 'auth')).toBe('root-gateway-auth.yaml')
        expect(descendantPath(['gateway', 'auth'], 'token')).toBe(
            'root-gateway-auth-token.yaml'
        )
    })
})
```

- [ ] **Step 2: Run the helper tests to verify they fail**

Run: `npm run test:run -- src/utils/systemFiles.test.ts -t "rootFilename|descendantPath|flattenToFiles"`
Expected: FAIL because `rootFilename()` still returns `<rootId>.yaml` and `descendantPath()` still expects nested directory arguments.

- [ ] **Step 3: Write the minimal helper implementation**

```ts
export function rootFilename(_rootId: string): string {
    return 'root.yaml'
}

export function descendantPath(parentIds: string[], selfId: string): string {
    return ['root', ...parentIds, selfId].join('-') + '.yaml'
}
```

- [ ] **Step 4: Refactor `flattenToFiles()` to use ancestor chains**

```ts
function visit(comp: ComponentNode, parentIds: string[]): void {
    const relativePath =
        parentIds.length === 0 ? rootFilename(root.id) : descendantPath(parentIds, comp.id)

    const childPaths = comp.subComponents.map((child) =>
        descendantPath([...parentIds, comp.id], child.id)
    )

    entries.push({ relativePath, comp, childPaths })

    for (const child of comp.subComponents) {
        visit(child, [...parentIds, comp.id])
    }
}
```

- [ ] **Step 5: Extend flattening assertions for root, child, and grandchild paths**

```ts
expect(rootEntry.childPaths).toEqual(['root-gateway.yaml'])
expect(gatewayEntry.relativePath).toBe('root-gateway.yaml')
expect(gatewayEntry.childPaths).toEqual(['root-gateway-auth.yaml', 'root-gateway-orders.yaml'])
expect(authEntry.relativePath).toBe('root-gateway-auth.yaml')
```

- [ ] **Step 6: Run the targeted helper and flattening tests again**

Run: `npm run test:run -- src/utils/systemFiles.test.ts -t "rootFilename|descendantPath|flattenToFiles"`
Expected: PASS for helper-path and flattening tests.

- [ ] **Step 7: Commit**

```bash
git add src/utils/systemFiles.ts src/utils/systemFiles.test.ts
git commit -m "test: lock flat component path helpers [2026-04-07-flat-model-paths-design.md:Task 1]" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 2: Remove subdirectory save/load logic and make directory persistence flat

**Files:**
- Modify: `src/utils/systemFiles.ts`
- Modify: `src/utils/systemFiles.test.ts`
- Test: `src/utils/systemFiles.test.ts`

- [ ] **Step 1: Write failing directory persistence tests for the flat layout**

```ts
it('writes root and descendants as top-level yaml files', async () => {
    await saveToDirectory(mockDir, root)

    expect(mockDir.getDirectoryHandle).not.toHaveBeenCalled()
    expect(writtenFiles['root.yaml']).toContain('id: my-system')
    expect(writtenFiles['root-gateway.yaml']).toContain('id: gateway')
    expect(writtenFiles['root-gateway-auth.yaml']).toContain('id: auth')
})

it('removes stale top-level yaml files that are no longer expected', async () => {
    const handle = makeFSDirectoryHandle(
        new Map([
            ['root.yaml', oldRootYaml],
            ['root-obsolete.yaml', oldChildYaml],
        ])
    )

    await saveToDirectory(handle, root)

    expect(handle.removeEntry).toHaveBeenCalledWith('root-obsolete.yaml')
})
```

- [ ] **Step 2: Run the targeted directory tests to verify they fail**

Run: `npm run test:run -- src/utils/systemFiles.test.ts -t "saveToDirectory|loadFromDirectory"`
Expected: FAIL because `saveToDirectory()` still creates a root-id subdirectory and trims descendant filenames relative to it.

- [ ] **Step 3: Rewrite `saveToDirectory()` to manage one top-level YAML set**

```ts
const entries = flattenToFiles(root)
const expectedFiles = new Set(entries.map(({ relativePath }) => relativePath))

for await (const entry of dir.values()) {
    if (entry.kind === 'file' && entry.name.endsWith('.yaml') && !expectedFiles.has(entry.name)) {
        await dir.removeEntry(entry.name)
    }
}

await runWithConcurrency(entries, DESCENDANT_WRITE_CONCURRENCY, async ({ relativePath, comp, childPaths }) => {
    await writeComponentFile(dir, relativePath, serializeComponentYaml(comp, childPaths))
})
```

- [ ] **Step 4: Delete subdirectory-specific code from save/load**

```ts
// Remove:
// - dir.getDirectoryHandle(root.id, { create: true })
// - descendant filename slicing relative to subdirName
// - dir.removeEntry(previousRootId, { recursive: true })
// - nested directory scans inside loadFromDirectory()
```

- [ ] **Step 5: Update `loadFromDirectory()` tests to require flat top-level filenames**

```ts
const fileMap = new Map<string, RawComponent>([
    ['root.yaml', rawRoot],
    ['root-gateway.yaml', rawGateway],
    ['root-gateway-auth.yaml', rawAuth],
])

expect(loaded.subComponents[0].subComponents[0].id).toBe('auth')
```

- [ ] **Step 6: Tighten the loader around `root.yaml`**

```ts
if (!fileMap.has('root.yaml')) {
    throw new Error('The selected folder must contain root.yaml')
}

const rootRaw = fileMap.get('root.yaml')!
return parseComponentNode(assembleTree(rootRaw, fileMap))
```

- [ ] **Step 7: Run the targeted directory tests again**

Run: `npm run test:run -- src/utils/systemFiles.test.ts -t "saveToDirectory|loadFromDirectory"`
Expected: PASS for flat save/load behavior and `root.yaml`-based assembly.

- [ ] **Step 8: Commit**

```bash
git add src/utils/systemFiles.ts src/utils/systemFiles.test.ts
git commit -m "feat: flatten filesystem model persistence [2026-04-07-flat-model-paths-design.md:Task 2]" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 3: Align `/models` fixtures and URL loading to the flat relative paths

**Files:**
- Modify: `src/utils/systemFiles.ts`
- Modify: `src/utils/systemFiles.test.ts`
- Modify: `e2e/model-route.spec.ts`
- Modify/Rename: `public/models/demo-system/*`
- Test: `src/utils/systemFiles.test.ts`
- Test: `e2e/model-route.spec.ts`

- [ ] **Step 1: Write failing URL-loading expectations in unit and e2e tests**

```ts
vi.stubGlobal(
    'fetch',
    makeFetchMock({
        '/models/my-system/root.yaml': { status: 200, body: rootYaml },
        '/models/my-system/root-auth.yaml': { status: 200, body: authYaml },
    })
)

await page.route('/models/e2e-system/root.yaml', (route) =>
    route.fulfill({ status: 200, contentType: 'text/yaml', body: ROOT_YAML })
)
```

- [ ] **Step 2: Run URL-specific tests to verify they fail**

Run: `npm run test:run -- src/utils/systemFiles.test.ts && npm run test:e2e -- e2e/model-route.spec.ts`
Expected: FAIL because `loadFromUrl()` still starts from `/models/<id>/<id>.yaml` and the fixtures still use old filenames.

- [ ] **Step 3: Change `loadFromUrl()` to start from `root.yaml`**

```ts
export async function loadFromUrl(rootId: string): Promise<ComponentNode> {
    const rootPath = `${rootId}/root.yaml`
    const fileMap = new Map<string, RawComponent>()
    await fetchComponentTree(rootPath, fileMap)
    const rootRaw = fileMap.get(rootPath)
    if (!rootRaw) throw new Error(`Root component not found for id: ${rootId}`)
    return parseComponentNode(assembleTree(rootRaw, fileMap))
}
```

- [ ] **Step 4: Rename and rewrite the demo model fixture files**

```yaml
# public/models/demo-system/root.yaml
subComponents:
  - root-auth-service.yaml
  - root-order-service.yaml
```

```yaml
# public/models/demo-system/root-auth-service.yaml
id: auth-service
subComponents: []
```

```yaml
# public/models/demo-system/root-order-service.yaml
id: order-service
subComponents: []
```

- [ ] **Step 5: Update the e2e fixture strings to the flat filenames**

```ts
const ROOT_WITH_CHILD_YAML = `
subComponents:
  - root-child.yaml
`.trim()

await page.route('/models/e2e-parent/root.yaml', (route) =>
    route.fulfill({ status: 200, contentType: 'text/yaml', body: ROOT_WITH_CHILD_YAML })
)
await page.route('/models/e2e-parent/root-child.yaml', (route) =>
    route.fulfill({ status: 200, contentType: 'text/yaml', body: CHILD_YAML })
)
```

- [ ] **Step 6: Run the focused unit and e2e tests again**

Run: `npm run test:run -- src/utils/systemFiles.test.ts && npm run test:e2e -- e2e/model-route.spec.ts`
Expected: PASS for URL loading, browse-lock behavior, and recursive child fetches under the flat path layout.

- [ ] **Step 7: Commit**

```bash
git add src/utils/systemFiles.ts src/utils/systemFiles.test.ts e2e/model-route.spec.ts public/models/demo-system
git commit -m "feat: align /models loading with flat paths [2026-04-07-flat-model-paths-design.md:Task 3]" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 4: Run repository validation and update docs only if needed

**Files:**
- Check: `README.md`
- Validate: repository scripts in `package.json`

- [ ] **Step 1: Inspect README for old nested-layout wording**

```md
Search for references to:
- <root-id>.yaml
- /models/<id>/<id>.yaml
- subdirectories for descendants
```

- [ ] **Step 2: Update README only if it documents the replaced layout**

```md
Save / Load uses a flat component YAML layout rooted at `root.yaml`, with descendant files named from their parent chain (for example `root-gateway-auth.yaml`).
```

- [ ] **Step 3: Run lint autofix**

Run: `npm run lint:fix`
Expected: PASS or auto-fix formatting/lint issues introduced by the path refactor.

- [ ] **Step 4: Run the production build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Run the full unit test suite**

Run: `npm run test:run`
Expected: PASS

- [ ] **Step 6: Run the e2e suite**

Run: `npm run test:e2e`
Expected: PASS

- [ ] **Step 7: Commit the final polish**

```bash
git add README.md src/utils/systemFiles.ts src/utils/systemFiles.test.ts e2e/model-route.spec.ts public/models/demo-system
git commit -m "chore: finish flat model path rollout [2026-04-07-flat-model-paths-design.md:Task 4]" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Self-review notes

- **Spec coverage:** root naming, descendant naming, flat save/load, `/models` alignment, subdirectory cleanup, fixture updates, and validation all map to Tasks 1-4.
- **Placeholder scan:** no TBD/TODO markers; each code step includes concrete snippets or exact commands.
- **Type consistency:** the plan uses `rootFilename()`, `descendantPath(parentIds, selfId)`, `flattenToFiles()`, `saveToDirectory()`, `loadFromDirectory()`, and `loadFromUrl()` consistently across all tasks.
