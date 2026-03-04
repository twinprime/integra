import type {
  ComponentNode,
  ActorNode,
  UseCaseNode,
  UseCaseDiagramNode,
  SequenceDiagramNode,
  InterfaceSpecification,
  InterfaceFunction,
} from "../store/types"

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
 * - Updates the `id` of the node/interface/function whose uuid matches targetUuid.
 * - Replaces all occurrences of oldId (whole-word) in every diagram `content` string.
 * - Replaces oldId as a path segment in every node `description` markdown link.
 */
export const applyIdRename = (
  root: ComponentNode,
  targetUuid: string,
  oldId: string,
  newId: string,
): ComponentNode => {
  const desc = (d?: string) => (d ? updateDescriptionRefs(d, oldId, newId) : d)
  const matchId = (uuid: string, id: string) => (uuid === targetUuid ? newId : id)

  const updateFn = (fn: InterfaceFunction): InterfaceFunction => ({
    ...fn,
    id: matchId(fn.uuid, fn.id),
    description: desc(fn.description),
  })

  const updateIface = (iface: InterfaceSpecification): InterfaceSpecification => ({
    ...iface,
    id: matchId(iface.uuid, iface.id),
    description: desc(iface.description),
    functions: iface.functions.map(updateFn),
  })

  const updateActor = (a: ActorNode): ActorNode => ({
    ...a,
    id: matchId(a.uuid, a.id),
    description: desc(a.description),
  })

  const updateSeq = (sd: SequenceDiagramNode): SequenceDiagramNode => ({
    ...sd,
    id: matchId(sd.uuid, sd.id),
    description: desc(sd.description),
    content: updateContentRefs(sd.content, oldId, newId),
  })

  const updateUseCase = (uc: UseCaseNode): UseCaseNode => ({
    ...uc,
    id: matchId(uc.uuid, uc.id),
    description: desc(uc.description),
    sequenceDiagrams: uc.sequenceDiagrams.map(updateSeq),
  })

  const updateUcDiag = (ucd: UseCaseDiagramNode): UseCaseDiagramNode => ({
    ...ucd,
    id: matchId(ucd.uuid, ucd.id),
    description: desc(ucd.description),
    content: updateContentRefs(ucd.content, oldId, newId),
    useCases: ucd.useCases.map(updateUseCase),
  })

  const updateComp = (comp: ComponentNode): ComponentNode => ({
    ...comp,
    id: matchId(comp.uuid, comp.id),
    description: desc(comp.description),
    subComponents: comp.subComponents.map(updateComp),
    actors: comp.actors.map(updateActor),
    useCaseDiagrams: comp.useCaseDiagrams.map(updateUcDiag),
    interfaces: comp.interfaces.map(updateIface),
  })

  return updateComp(root)
}
