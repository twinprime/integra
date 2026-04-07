/**
 * systemFiles.ts
 *
 * Utilities for saving and loading a ComponentNode tree as a directory of YAML files.
 *
 * File layout:
 *   <chosen-dir>/
 *     <root-id>.yaml              ← root component (entry point)
 *     <root-id>/                  ← flat subdir for ALL descendants
 *       <parent-id>-<self-id>.yaml
 *       ...
 *
 * The `subComponents` field in each YAML holds a list of relative file paths
 * (relative to the chosen directory root), e.g.:
 *   subComponents:
 *     - my-system/auth.yaml
 *     - my-system/orders.yaml
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
    /** Relative path from the chosen directory root, e.g. "my-system/auth.yaml" */
    relativePath: string
    /** The component node (without nested subComponents — those become childPaths) */
    comp: ComponentNode
    /** relativePaths of direct children, used as the subComponents value in YAML */
    childPaths: string[]
}

/**
 * DFS traversal that produces a flat list of FileEntry records.
 * The root entry's relativePath is `<rootId>.yaml`.
 * All descendants go in the `<rootId>/` subdirectory.
 */
export function flattenToFiles(root: ComponentNode): FileEntry[] {
    const entries: FileEntry[] = []

    function visit(comp: ComponentNode, parentId: string | null): void {
        const path =
            parentId === null ? rootFilename(root.id) : descendantPath(root.id, parentId, comp.id)

        const childPaths = comp.subComponents.map((child) =>
            descendantPath(root.id, comp.id, child.id)
        )

        entries.push({ relativePath: path, comp, childPaths })

        for (const child of comp.subComponents) {
            visit(child, comp.id)
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
 * - Creates the `<rootId>/` subdirectory if needed.
 * - Removes stale descendant `*.yaml` files in the subdir before writing fresh ones.
 */
export async function saveToDirectory(
    dir: FileSystemDirectoryHandle,
    root: ComponentNode,
    previousRootId?: string
): Promise<void> {
    const entries = flattenToFiles(root)
    const subdirName = root.id
    const rootPath = rootFilename(root.id)
    const expectedDescendantFiles = new Set(
        entries
            .filter(({ relativePath }) => relativePath !== rootPath)
            .map(({ relativePath }) => relativePath.slice(subdirName.length + 1))
    )

    // Get or create the subdirectory
    const subdir = await dir.getDirectoryHandle(subdirName, { create: true })

    // Remove stale descendant YAML files in the subdirectory.
    for await (const entry of subdir.values()) {
        if (
            entry.kind === 'file' &&
            entry.name.endsWith('.yaml') &&
            !expectedDescendantFiles.has(entry.name)
        ) {
            await subdir.removeEntry(entry.name)
        }
    }

    const rootEntry = entries.find(({ relativePath }) => relativePath === rootPath)
    if (!rootEntry) {
        throw new Error(`Missing root file entry for component ${root.id}`)
    }

    await writeComponentFile(
        dir,
        rootPath,
        serializeComponentYaml(rootEntry.comp, rootEntry.childPaths)
    )

    const descendantJobs = entries
        .filter(({ relativePath }) => relativePath !== rootPath)
        .map(({ relativePath, comp, childPaths }) => ({
            filename: relativePath.slice(subdirName.length + 1),
            content: serializeComponentYaml(comp, childPaths),
        }))

    await runWithConcurrency(
        descendantJobs,
        DESCENDANT_WRITE_CONCURRENCY,
        async ({ filename, content }) => {
            await writeComponentFile(subdir, filename, content)
        }
    )

    // Clean up old root files if the root ID was renamed
    if (previousRootId && previousRootId !== root.id) {
        await Promise.allSettled([
            dir.removeEntry(`${previousRootId}.yaml`),
            dir.removeEntry(previousRootId, { recursive: true }),
        ])
    }
}

/**
 * Loads a component tree from a directory.
 * The directory must contain exactly one top-level `.yaml` file — that file is
 * the root component. Descendant components live in the `<rootId>/` subdirectory.
 */
export async function loadFromDirectory(dir: FileSystemDirectoryHandle): Promise<ComponentNode> {
    const fileMap = new Map<string, RawComponent>()
    const topLevelYamls: string[] = []

    // Read top-level YAML files (exactly one is expected — the root)
    for await (const entry of dir.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.yaml')) {
            const file = await entry.getFile()
            const text = await file.text()
            const parsed = yaml.load(text) as RawComponent | null
            if (parsed && typeof parsed === 'object' && parsed.type === 'component') {
                fileMap.set(entry.name, parsed)
                topLevelYamls.push(entry.name)
            }
        } else if (entry.kind === 'directory' && !entry.name.startsWith('.')) {
            // Read files inside the subdirectory
            const subdir = entry
            for await (const child of subdir.values()) {
                if (child.kind === 'file' && child.name.endsWith('.yaml')) {
                    const file = await child.getFile()
                    const text = await file.text()
                    const parsed = yaml.load(text) as RawComponent | null
                    if (parsed && typeof parsed === 'object' && parsed.type === 'component') {
                        fileMap.set(`${subdir.name}/${child.name}`, parsed)
                    }
                }
            }
        }
    }

    if (topLevelYamls.length === 0) throw new Error('No component files found in directory')

    if (topLevelYamls.length > 1) {
        throw new Error(
            `The selected folder contains ${topLevelYamls.length} YAML files ` +
                `(${topLevelYamls.join(', ')}). Select a folder with exactly one root component YAML file.`
        )
    }

    const rootRaw = fileMap.get(topLevelYamls[0])!
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
