/**
 * systemFiles.ts
 *
 * Utilities for saving and loading a ComponentNode tree as a directory of YAML files.
 *
 * File layout (flat — no subdirectories):
 *   <chosen-dir>/
 *     root.yaml                           ← root component (entry point)
 *     root-<childId>.yaml                 ← direct child of root
 *     root-<childId>-<grandchildId>.yaml  ← deeper descendants
 *
 * The `subComponents` field in each YAML holds a list of bare filenames, e.g.:
 *   subComponents:
 *     - root-auth-service.yaml
 *     - root-order-service.yaml
 */

import yaml from 'js-yaml'
import type { ComponentNode } from '../store/types'
import { parseComponentNode } from '../store/modelSchema'

// Fields that are derived at runtime and should not be persisted
const DERIVED_KEYS = new Set(['ownerComponentUuid', 'referencedNodeIds', 'referencedFunctionUuids'])
const DESCENDANT_WRITE_CONCURRENCY = 4

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

// ── Flatten tree → file entries ───────────────────────────────────────────────

export interface FileEntry {
    /** Relative path from the chosen directory root, e.g. "root-gateway-auth.yaml" */
    relativePath: string
    /** The component node (without nested subComponents — those become childPaths) */
    comp: ComponentNode
    /** relativePaths of direct children, used as the subComponents value in YAML */
    childPaths: string[]
}

/**
 * DFS traversal that produces a flat list of FileEntry records.
 * The root entry's relativePath is always `root.yaml`.
 * Descendants use flat filenames: `root-<child>.yaml`, `root-<child>-<grandchild>.yaml`, etc.
 */
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

// ── Serialization ─────────────────────────────────────────────────────────────

/**
 * Serializes a single component to YAML. `subComponents` is replaced by
 * the list of child file paths instead of nested objects.
 */
export function serializeComponentYaml(comp: ComponentNode, childPaths: string[]): string {
    const plain = JSON.parse(
        JSON.stringify(comp, (key: string, value: unknown): unknown =>
            DERIVED_KEYS.has(key) ? undefined : value
        )
    ) as Record<string, unknown>
    plain.subComponents = childPaths
    return yaml.dump(plain, { indent: 2, noRefs: true, skipInvalid: true })
}

async function writeComponentFile(
    dir: FileSystemDirectoryHandle,
    filename: string,
    content: string
): Promise<void> {
    const fileHandle = await dir.getFileHandle(filename, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(content)
    await writable.close()
}

async function runWithConcurrency<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>
): Promise<void> {
    let nextIndex = 0

    async function runWorker(): Promise<void> {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex
            nextIndex += 1
            await worker(items[currentIndex])
        }
    }

    await Promise.all(
        Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker())
    )
}

// ── Deserialization ───────────────────────────────────────────────────────────

/** Shape of a parsed component YAML before subComponents are resolved */
export interface RawComponent extends Omit<ComponentNode, 'subComponents'> {
    subComponents: string[]
}

/**
 * Recursively resolves a component tree from a map of relative-path → RawComponent.
 * Starts from `root` and fills in subComponents from the map.
 */
export function assembleTree(
    root: RawComponent,
    fileMap: Map<string, RawComponent>
): ComponentNode {
    const resolvedChildren: ComponentNode[] = root.subComponents.map((path) => {
        const child = fileMap.get(path)
        if (!child) throw new Error(`Missing component file referenced in subComponents: ${path}`)
        return assembleTree(child, fileMap)
    })
    return { ...root, subComponents: resolvedChildren }
}

// ── Directory I/O ─────────────────────────────────────────────────────────────

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

// ── URL-based loading ─────────────────────────────────────────────────────────

const MODELS_BASE_PATH = '/models'

/** Returns the component ID from the URL if on a /models/<id> route, otherwise null. */
export function getModelRouteComponentId(): string | null {
    const match = window.location.pathname.match(new RegExp(`^${MODELS_BASE_PATH}/([^/]+)/?$`))
    return match ? match[1] : null
}

export class NotFoundError extends Error {
    constructor(path: string) {
        super(`Not found: ${path}`)
        this.name = 'NotFoundError'
    }
}

async function fetchRawComponent(urlPath: string): Promise<RawComponent> {
    const res = await fetch(urlPath)
    if (res.status === 404) throw new NotFoundError(urlPath)
    if (!res.ok) throw new Error(`Failed to fetch ${urlPath}: ${res.status} ${res.statusText}`)
    const text = await res.text()
    const parsed = yaml.load(text) as RawComponent | null
    if (!parsed || typeof parsed !== 'object' || parsed.type !== 'component') {
        throw new Error(`Invalid component YAML at ${urlPath}`)
    }
    return parsed
}

async function fetchComponentTree(
    relativePath: string,
    fileMap: Map<string, RawComponent>
): Promise<void> {
    if (fileMap.has(relativePath)) return
    const raw = await fetchRawComponent(`${MODELS_BASE_PATH}/${relativePath}`)
    fileMap.set(relativePath, raw)
    await Promise.all(raw.subComponents.map((childPath) => fetchComponentTree(childPath, fileMap)))
}

/**
 * Loads a component tree from the web server at /models/<rootId>/<rootId>.yaml,
 * recursively fetching all referenced sub-components.
 */
export async function loadFromUrl(rootId: string): Promise<ComponentNode> {
    const rootPath = `${rootId}/${rootId}.yaml`
    const fileMap = new Map<string, RawComponent>()
    await fetchComponentTree(rootPath, fileMap)
    const rootRaw = fileMap.get(rootPath)
    if (!rootRaw) throw new Error(`Root component not found for id: ${rootId}`)
    return parseComponentNode(assembleTree(rootRaw, fileMap))
}
