/**
 * systemFiles.ts
 *
 * Utilities for saving and loading a ComponentNode tree as a directory of YAML files.
 *
 * File layout:
 *   <chosen-dir>/
 *     root.yaml                    ← root component (entry point)
 *     root-gateway.yaml            ← direct child example
 *     root-gateway-auth.yaml       ← deeper descendant example
 *     ...
 *
 * The `subComponents` field in each YAML holds logical flat file-map keys
 * used to resolve references during loading.
 * Example:
 *   subComponents:
 *     - root-gateway-auth.yaml
 *     - root-gateway-orders.yaml
 */

import yaml from 'js-yaml'
import type { ComponentNode } from '../store/types'
import { parseComponentNode } from '../store/modelSchema'

// Fields that are derived at runtime and should not be persisted
const DERIVED_KEYS = new Set(['ownerComponentUuid', 'referencedNodeIds', 'referencedFunctionUuids'])
const DESCENDANT_WRITE_CONCURRENCY = 4

// ── File path helpers ─────────────────────────────────────────────────────────

/** Relative path for the root component YAML (in the chosen directory). */
export function rootFilename(): string {
    return 'root.yaml'
}

/** Relative path for a descendant YAML based on its ancestor chain. */
export function descendantPath(parentIds: string[], selfId: string): string {
    return ['root', ...parentIds, selfId].join('-') + '.yaml'
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
 * The root entry's relativePath is `root.yaml`.
 * Descendants are named by their ancestor chain, e.g. `root-gateway-auth.yaml`.
 */
export function flattenToFiles(root: ComponentNode): FileEntry[] {
    const entries: FileEntry[] = []

    function visit(comp: ComponentNode, ancestorIds: string[], isRoot: boolean): void {
        const relativePath = isRoot ? rootFilename() : descendantPath(ancestorIds, comp.id)
        const childAncestorIds = isRoot ? ancestorIds : [...ancestorIds, comp.id]

        const childPaths = comp.subComponents.map((child) =>
            // `childAncestorIds` is [] for the root component, so its children become
            // `root-<childId>.yaml`. The `root-` prefix is literal here, not the root id.
            descendantPath(childAncestorIds, child.id)
        )

        entries.push({ relativePath, comp, childPaths })

        for (const child of comp.subComponents) {
            visit(child, childAncestorIds, false)
        }
    }

    visit(root, [], true)
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

function isConcurrentMissingEntryError(error: unknown): error is DOMException {
    return error instanceof DOMException && error.name === 'NotFoundError'
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
 * - Writes root and descendants as top-level YAML files.
 * - Treats the chosen directory as dedicated model storage and removes stale
 *   top-level `*.yaml` files before writing fresh ones.
 */
export async function saveToDirectory(
    dir: FileSystemDirectoryHandle,
    root: ComponentNode
): Promise<void> {
    const entries = flattenToFiles(root)
    const expectedFiles = new Set(entries.map(({ relativePath }) => relativePath))
    const stalePaths: string[] = []

    for await (const entry of dir.values()) {
        if (
            entry.kind === 'file' &&
            entry.name.endsWith('.yaml') &&
            !expectedFiles.has(entry.name)
        ) {
            stalePaths.push(entry.name)
        }
    }

    for (const name of stalePaths) {
        try {
            await dir.removeEntry(name)
        } catch (error) {
            if (!isConcurrentMissingEntryError(error)) {
                throw error
            }
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

/**
 * Loads a component tree from a directory.
 * The directory must contain `root.yaml` plus any descendant top-level `.yaml` files.
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

    if (fileMap.size === 0) {
        throw new Error('No component files found in directory')
    }

    if (!fileMap.has('root.yaml')) {
        throw new Error('The selected folder must contain root.yaml')
    }

    const rootRaw = fileMap.get('root.yaml')!
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
