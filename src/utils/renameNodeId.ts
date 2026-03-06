import type { ComponentNode } from "../store/types"
import { applyIdRenameInComponent } from "../nodes/componentNode"

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Replace every whole-word occurrence of oldId with newId in a diagram spec string. */
export const updateContentRefs = (content: string, oldId: string, newId: string): string =>
  content.replace(new RegExp(`\\b${escapeRegex(oldId)}\\b`, "g"), newId)

/**
 * Replace oldId as a path segment inside markdown link hrefs.
 * Only modifies links that look like internal node paths (no protocol, anchor, or leading slash).
 */
export const updateDescriptionRefs = (description: string, oldId: string, newId: string): string =>
  description.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (match, text: string, href: string) => {
    if (href.includes("://") || href.startsWith("#") || href.startsWith("/")) return match
    const updatedHref = href
      .split("/")
      .map((seg) => (seg === oldId ? newId : seg))
      .join("/")
    return `[${text}](${updatedHref})`
  })

/**
 * Perform a full deep rename across the entire component tree.
 * Delegates to applyIdRenameInComponent which owns all component-tree traversal.
 */
export const applyIdRename = (
  root: ComponentNode,
  targetUuid: string,
  oldId: string,
  newId: string,
): ComponentNode => applyIdRenameInComponent(root, targetUuid, oldId, newId)
