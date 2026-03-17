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

import yaml from "js-yaml"
import type { ComponentNode } from "../store/types"
import { parseComponentNode } from "../store/modelSchema"

// Fields that are derived at runtime and should not be persisted
const DERIVED_KEYS = new Set(["ownerComponentUuid", "referencedNodeIds", "referencedFunctionUuids"])

// ── File path helpers ─────────────────────────────────────────────────────────

/** Relative path for the root component YAML (in the chosen directory). */
export function rootFilename(rootId: string): string {
  return `${rootId}.yaml`
}

/** Relative path for a descendant YAML (in the `<rootId>/` subdirectory). */
export function descendantPath(rootId: string, parentId: string, selfId: string): string {
  return `${rootId}/${parentId}-${selfId}.yaml`
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
    const path = parentId === null
      ? rootFilename(root.id)
      : descendantPath(root.id, parentId, comp.id)

    const childPaths = comp.subComponents.map((child) =>
      descendantPath(root.id, comp.id, child.id),
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
    JSON.stringify(comp, (key: string, value: unknown): unknown => DERIVED_KEYS.has(key) ? undefined : value),
  ) as Record<string, unknown>
  plain.subComponents = childPaths
  return yaml.dump(plain, { indent: 2, noRefs: true, skipInvalid: true })
}

// ── Deserialization ───────────────────────────────────────────────────────────

/** Shape of a parsed component YAML before subComponents are resolved */
export interface RawComponent extends Omit<ComponentNode, "subComponents"> {
  subComponents: string[]
}

/**
 * Recursively resolves a component tree from a map of relative-path → RawComponent.
 * Starts from `root` and fills in subComponents from the map.
 */
export function assembleTree(root: RawComponent, fileMap: Map<string, RawComponent>): ComponentNode {
  const resolvedChildren: ComponentNode[] = root.subComponents
    .map((path) => {
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
): Promise<void> {
  const entries = flattenToFiles(root)
  const subdirName = root.id
  const rootPath = rootFilename(root.id)
  const expectedDescendantFiles = new Set(
    entries
      .filter(({ relativePath }) => relativePath !== rootPath)
      .map(({ relativePath }) => relativePath.slice(subdirName.length + 1)),
  )

  // Get or create the subdirectory
  const subdir = await dir.getDirectoryHandle(subdirName, { create: true })

  // Remove stale descendant YAML files in the subdirectory.
  for await (const entry of subdir.values()) {
    if (
      entry.kind === "file"
      && entry.name.endsWith(".yaml")
      && !expectedDescendantFiles.has(entry.name)
    ) {
      await subdir.removeEntry(entry.name)
    }
  }

  // Write all component files
  for (const { relativePath, comp, childPaths } of entries) {
    const content = serializeComponentYaml(comp, childPaths)
    const isRoot = relativePath === rootFilename(root.id)
    const targetDir = isRoot ? dir : subdir
    const filename = isRoot ? relativePath : relativePath.slice(subdirName.length + 1)

    const fileHandle = await targetDir.getFileHandle(filename, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(content)
    await writable.close()
  }
}

/**
 * Loads a component tree from a directory.
 * Reads all `.yaml` files at the top level and in the `<rootId>/` subdirectory.
 * Finds the root by elimination (the component not referenced by any other's subComponents).
 */
export async function loadFromDirectory(
  dir: FileSystemDirectoryHandle,
): Promise<ComponentNode> {
  const fileMap = new Map<string, RawComponent>()

  // Read top-level YAML files (the root lives here)
  for await (const entry of dir.values()) {
    if (entry.kind === "file" && entry.name.endsWith(".yaml")) {
      const file = await (entry).getFile()
      const text = await file.text()
      const parsed = yaml.load(text) as RawComponent | null
      if (parsed && typeof parsed === "object" && parsed.type === "component") {
        fileMap.set(entry.name, parsed)
      }
    } else if (entry.kind === "directory" && !entry.name.startsWith(".")) {
      // Read files inside the subdirectory
      const subdir = entry
      for await (const child of subdir.values()) {
        if (child.kind === "file" && child.name.endsWith(".yaml")) {
          const file = await (child).getFile()
          const text = await file.text()
          const parsed = yaml.load(text) as RawComponent | null
          if (parsed && typeof parsed === "object" && parsed.type === "component") {
            fileMap.set(`${subdir.name}/${child.name}`, parsed)
          }
        }
      }
    }
  }

  if (fileMap.size === 0) throw new Error("No component files found in directory")

  // Find root: the component whose relativePath is not listed in any other's subComponents
  const allChildPaths = new Set<string>()
  for (const comp of fileMap.values()) {
    for (const path of comp.subComponents) allChildPaths.add(path)
  }

  const rootEntries = [...fileMap.entries()].filter(([path]) => !allChildPaths.has(path))
  if (rootEntries.length !== 1) {
    throw new Error(
      rootEntries.length === 0
        ? "Could not determine root component (circular reference?)"
        : `Multiple root candidates found: ${rootEntries.map(([p]) => p).join(", ")}`,
    )
  }

  const [, rootRaw] = rootEntries[0]
  return parseComponentNode(assembleTree(rootRaw, fileMap))
}
