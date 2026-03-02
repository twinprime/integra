import type { ComponentNode } from "../store/types"
import { resolveInOwner, resolveParticipant } from "./diagramResolvers"

// ─── Shared regex patterns ────────────────────────────────────────────────────

// Named participant: actor|component|use case "Name" [from path] as id
export const RX_PART_NAMED =
  /^(\s*)(actor|component|use\s+case)(\s+"[^"]*")(\s+from\s+([\w/-]+))?(\s+as\s+)(\w+)/

// Bare participant: actor|component id
export const RX_PART_BARE = /^(\s*)(actor|component)(\s+)(\w+)/

// ─── Shared resolver ─────────────────────────────────────────────────────────

/** Builds a { participantAlias → uuid } map by parsing participant declarations. */
export function buildIdToUuidMap(
  content: string,
  type: "use-case-diagram" | "sequence-diagram",
  ownerComp: ComponentNode | null,
  root: ComponentNode,
): { map: Record<string, string>; orderedUuids: string[] } {
  const map: Record<string, string> = {}
  const orderedUuids: string[] = []
  if (!ownerComp) return { map, orderedUuids }

  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const named = RX_PART_NAMED.exec(trimmed)
    if (named) {
      const keyword = named[2]
      const fromPath = named[5]
      const id = named[7]
      const uuid = resolveParticipant(keyword, id, fromPath, root, ownerComp)
      if (uuid) {
        map[id] = uuid
        orderedUuids.push(uuid)
      }
      continue
    }

    // Bare declarations only appear in sequence diagrams
    if (type === "sequence-diagram") {
      const bare = RX_PART_BARE.exec(trimmed)
      if (bare) {
        const id = bare[4]
        const uuid = resolveInOwner(ownerComp, id)
        if (uuid) {
          map[id] = uuid
          orderedUuids.push(uuid)
        }
      }
    }
  }

  return { map, orderedUuids }
}
