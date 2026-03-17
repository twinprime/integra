import type { ComponentNode, SequenceDiagramNode } from "../store/types"
import { applyIdRenameInComponent } from "../nodes/componentNode"
import { findCompByUuid } from "../nodes/componentTraversal"
import {
  findOwnerActorOrComponentUuidById,
  findOwnerUseCaseUuidById,
  resolveDiagramDeclarationUuid,
  resolveFunctionReferenceTarget,
} from "./diagramResolvers"
import { parseUseCaseDiagramCst } from "../parser/useCaseDiagram/parser"
import { ucdAstToSpec } from "../parser/useCaseDiagram/specSerializer"
import {
  buildUcdAst,
  type UcdAst,
  type UcdDeclaration,
  type UcdLink,
  type UcdStatement,
} from "../parser/useCaseDiagram/visitor"
import { parseSequenceDiagramCst } from "../parser/sequenceDiagram/parser"
import { seqAstToSpec } from "../parser/sequenceDiagram/specSerializer"
import {
  buildSeqAst,
  type SeqAst,
  type SeqBlock,
  type SeqBlockSection,
  type SeqDeclaration,
  type SeqMessage,
  type SeqMessageContent,
  type SeqNote,
  type SeqStatement,
} from "../parser/sequenceDiagram/visitor"

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

export type ScopedRenameContext = {
  rootBefore: ComponentNode
  rootAfterTargetId: ComponentNode
  targetUuid: string
  oldId: string
  newId: string
}

const findNodeInComponent = (
  comp: ComponentNode,
  nodeId: string,
): { uuid: string } | null => {
  for (const actor of comp.actors) {
    if (actor.id === nodeId) return actor
  }
  for (const child of comp.subComponents) {
    if (child.id === nodeId) return child
  }
  for (const diagram of comp.useCaseDiagrams) {
    if (diagram.id === nodeId) return diagram
    for (const useCase of diagram.useCases) {
      if (useCase.id === nodeId) return useCase
      for (const sequenceDiagram of useCase.sequenceDiagrams) {
        if (sequenceDiagram.id === nodeId) return sequenceDiagram
      }
    }
  }
  return null
}

const isUseCaseDiagramDescendant = (
  comp: ComponentNode,
  targetUuid: string,
): boolean =>
  comp.useCaseDiagrams.some((diagram) =>
    diagram.useCases.some((useCase) =>
      useCase.uuid === targetUuid
      || useCase.sequenceDiagrams.some((sequenceDiagram) => sequenceDiagram.uuid === targetUuid)))

const findNearestComponentAncestor = (
  root: ComponentNode,
  targetUuid: string,
): ComponentNode | null => {
  const search = (comp: ComponentNode): ComponentNode | null => {
    if (comp.actors.some((actor) => actor.uuid === targetUuid)) return comp
    if (comp.subComponents.some((child) => child.uuid === targetUuid)) return comp
    if (comp.useCaseDiagrams.some((diagram) => diagram.uuid === targetUuid)) return comp
    if (isUseCaseDiagramDescendant(comp, targetUuid)) return comp

    for (const child of comp.subComponents) {
      const found = search(child)
      if (found) return found
    }
    return null
  }

  if (root.uuid === targetUuid) return root
  return search(root)
}

const renameTargetIdOnlyInSeqDiag = (
  sd: SequenceDiagramNode,
  targetUuid: string,
  newId: string,
): SequenceDiagramNode => ({
  ...sd,
  id: sd.uuid === targetUuid ? newId : sd.id,
})

const renameTargetIdOnlyInComponent = (
  comp: ComponentNode,
  targetUuid: string,
  newId: string,
): ComponentNode => ({
  ...comp,
  id: comp.uuid === targetUuid ? newId : comp.id,
  subComponents: comp.subComponents.map((child) =>
    renameTargetIdOnlyInComponent(child, targetUuid, newId),
  ),
  actors: comp.actors.map((actor) => ({
    ...actor,
    id: actor.uuid === targetUuid ? newId : actor.id,
  })),
  useCaseDiagrams: comp.useCaseDiagrams.map((ucd) => ({
    ...ucd,
    id: ucd.uuid === targetUuid ? newId : ucd.id,
    useCases: ucd.useCases.map((useCase) => ({
      ...useCase,
      id: useCase.uuid === targetUuid ? newId : useCase.id,
      sequenceDiagrams: useCase.sequenceDiagrams.map((sd) =>
        renameTargetIdOnlyInSeqDiag(sd, targetUuid, newId),
      ),
    })),
  })),
  interfaces: comp.interfaces.map((iface) => ({
    ...iface,
    id: iface.uuid === targetUuid ? newId : iface.id,
    functions: iface.functions.map((fn) => ({
      ...fn,
      id: fn.uuid === targetUuid ? newId : fn.id,
    })),
  })),
})

const buildScopedRenameContext = (
  root: ComponentNode,
  targetUuid: string,
  oldId: string,
  newId: string,
): ScopedRenameContext => ({
  rootBefore: root,
  rootAfterTargetId: renameTargetIdOnlyInComponent(root, targetUuid, newId),
  targetUuid,
  oldId,
  newId,
})

const isInternalHref = (href: string): boolean =>
  !href.includes("://") && !href.startsWith("#") && !href.startsWith("/")

const resolveComponentPathFrom = (
  start: ComponentNode,
  segments: string[],
): ComponentNode | null => {
  let current: ComponentNode | null = start
  for (const segment of segments) {
    current = current.subComponents.find((child) => child.id === segment) ?? null
    if (!current) return null
  }
  return current
}

const resolveScopedComponentPath = (
  root: ComponentNode,
  ownerComponentUuid: string,
  segments: string[],
): ComponentNode | null => {
  if (segments.length === 0) return findCompByUuid(root, ownerComponentUuid)

  const ownerComponent = findCompByUuid(root, ownerComponentUuid)
  if (!ownerComponent) return null

  if (segments[0] === root.id) {
    if (segments.length === 1) return root
    return resolveComponentPathFrom(root, segments.slice(1))
  }

  return resolveComponentPathFrom(ownerComponent, segments)
    ?? resolveComponentPathFrom(root, segments)
}

const resolveScopedUseCaseReferenceUuid = (
  root: ComponentNode,
  ownerComponentUuid: string,
  path: string[],
): string | undefined => {
  const targetId = path[path.length - 1]
  const component = path.length === 1
    ? findCompByUuid(root, ownerComponentUuid)
    : resolveScopedComponentPath(root, ownerComponentUuid, path.slice(0, -1))
  if (!component) return undefined
  return findOwnerUseCaseUuidById(component, targetId)
}

const resolveScopedSequenceReferenceUuid = (
  root: ComponentNode,
  ownerComponentUuid: string,
  path: string[],
): string | undefined => {
  const targetId = path[path.length - 1]
  const component = path.length === 1
    ? findCompByUuid(root, ownerComponentUuid)
    : resolveScopedComponentPath(root, ownerComponentUuid, path.slice(0, -1))
  if (!component) return undefined

  for (const useCaseDiagram of component.useCaseDiagrams) {
    for (const useCase of useCaseDiagram.useCases) {
      const sequenceDiagram = useCase.sequenceDiagrams.find((candidate) => candidate.id === targetId)
      if (sequenceDiagram) return sequenceDiagram.uuid
    }
  }
  return undefined
}

const replaceSegmentAt = (segments: string[], index: number, value: string): string[] =>
  segments.map((segment, currentIndex) => (currentIndex === index ? value : segment))

const renameResolvedPathSegments = (
  segments: string[],
  context: ScopedRenameContext,
  resolveInRoot: (root: ComponentNode, candidateSegments: string[]) => string | null | undefined,
): string[] => {
  if (!segments.some((segment) => segment === context.oldId)) return segments
  if (resolveInRoot(context.rootBefore, segments) !== context.targetUuid) return segments

  const matchingCandidates = segments
    .map((segment, index) => (segment === context.oldId
      ? replaceSegmentAt(segments, index, context.newId)
      : null))
    .filter((candidate): candidate is string[] => candidate !== null)
    .filter((candidate) => resolveInRoot(context.rootAfterTargetId, candidate) === context.targetUuid)

  return matchingCandidates.length === 1 ? matchingCandidates[0] : segments
}

export const updateDescriptionRefsInContext = (
  description: string,
  contextComponentUuid: string,
  context: ScopedRenameContext,
): string =>
  description.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (match, text: string, href: string) => {
    if (!isInternalHref(href)) return match

    const segments = href.split("/")
    const updatedSegments = renameResolvedPathSegments(segments, context, (root, candidateSegments) =>
      resolveDescriptionHref(root, candidateSegments, contextComponentUuid),
    )

    if (updatedSegments === segments) return match
    return `[${text}](${updatedSegments.join("/")})`
  })

const resolveDescriptionHref = (
  root: ComponentNode,
  segments: string[],
  contextComponentUuid: string,
): string | null => {
  const ownerComponent = findCompByUuid(root, contextComponentUuid)
  if (!ownerComponent) return null

  if (segments.length === 1) {
    return findNodeInComponent(ownerComponent, segments[0])?.uuid ?? null
  }

  const terminalId = segments[segments.length - 1]
  const targetComponent = resolveScopedComponentPath(root, contextComponentUuid, segments.slice(0, -1))
  if (!targetComponent) return null
  return findNodeInComponent(targetComponent, terminalId)?.uuid ?? null
}

const renamePathSegments = (path: string[], oldId: string, newId: string): string[] =>
  path.map((segment) => (segment === oldId ? newId : segment))

const renameDeclaration = (decl: UcdDeclaration, oldId: string, newId: string): UcdDeclaration => {
  const newPath = renamePathSegments(decl.path, oldId, newId)
  const newLastSeg = newPath[newPath.length - 1]
  const idChanged = decl.id === oldId && decl.alias === null
  return {
    ...decl,
    path: newPath,
    id: idChanged ? newLastSeg : decl.id,
  }
}

const renameLink = (link: UcdLink, oldId: string, newId: string): UcdLink => ({
  ...link,
  from: link.from === oldId ? newId : link.from,
  to: link.to === oldId ? newId : link.to,
})

const renameUcdStatement = (stmt: UcdStatement, oldId: string, newId: string): UcdStatement => {
  if ("entityType" in stmt) return renameDeclaration(stmt, oldId, newId)
  if ("from" in stmt) return renameLink(stmt, oldId, newId)
  return stmt
}

const renameInUcdAst = (ast: UcdAst, oldId: string, newId: string): UcdAst => {
  const statements = ast.statements.map((statement) => renameUcdStatement(statement, oldId, newId))
  return {
    declarations: statements.filter((statement): statement is UcdDeclaration => "entityType" in statement),
    links: statements.filter((statement): statement is UcdLink => "from" in statement),
    statements,
  }
}

const resolveLocalUseCaseDiagramNodeUuid = (
  root: ComponentNode,
  ownerComponentUuid: string,
  nodeId: string,
): string | undefined => {
  const ownerComponent = findCompByUuid(root, ownerComponentUuid)
  if (!ownerComponent) return undefined
  return findOwnerUseCaseUuidById(ownerComponent, nodeId)
    ?? findOwnerActorOrComponentUuidById(ownerComponent, nodeId)
}

const renameScopedUcdDeclaration = (
  decl: UcdDeclaration,
  ownerComponentUuid: string,
  context: ScopedRenameContext,
): UcdDeclaration => {
  const updatedPath = renameResolvedPathSegments(decl.path, context, (root, candidateSegments) => {
    const ownerComponent = findCompByUuid(root, ownerComponentUuid)
    if (!ownerComponent) return null
    const candidatePath = candidateSegments.join("/")
    return resolveDiagramDeclarationUuid(
      decl.entityType,
      candidateSegments[candidateSegments.length - 1] ?? decl.id,
      candidateSegments.length > 1 ? candidatePath : undefined,
      root,
      ownerComponent,
    )
  })

  if (updatedPath === decl.path) return decl

  const nextTerminalId = updatedPath[updatedPath.length - 1]
  return {
    ...decl,
    path: updatedPath,
    id: decl.id === context.oldId && decl.alias === null ? nextTerminalId : decl.id,
  }
}

const renameScopedUcdLinkEndpoint = (
  endpoint: string,
  ownerComponentUuid: string,
  context: ScopedRenameContext,
): string =>
  endpoint === context.oldId
  && resolveLocalUseCaseDiagramNodeUuid(context.rootBefore, ownerComponentUuid, endpoint) === context.targetUuid
    ? context.newId
    : endpoint

export const updateUseCaseDiagramRefsInContext = (
  content: string,
  ownerComponentUuid: string,
  context: ScopedRenameContext,
): string => {
  if (!content.trim()) return content

  const { cst, lexErrors, parseErrors } = parseUseCaseDiagramCst(content)
  if (lexErrors.length || parseErrors.length) return content

  const ast = buildUcdAst(cst)
  const statements = ast.statements.map((statement) => {
    if ("entityType" in statement) {
      return renameScopedUcdDeclaration(statement, ownerComponentUuid, context)
    }
    if ("from" in statement) {
      return {
        ...statement,
        from: renameScopedUcdLinkEndpoint(statement.from, ownerComponentUuid, context),
        to: renameScopedUcdLinkEndpoint(statement.to, ownerComponentUuid, context),
      }
    }
    return statement
  })

  return ucdAstToSpec({
    declarations: statements.filter((statement): statement is UcdDeclaration => "entityType" in statement),
    links: statements.filter((statement): statement is UcdLink => "from" in statement),
    statements,
  })
}

function assertNever(x: never): never {
  throw new Error(`Unhandled sequence statement: ${JSON.stringify(x)}`)
}

const renameSeqDeclaration = (
  decl: SeqDeclaration,
  oldId: string,
  newId: string,
): SeqDeclaration => {
  const newPath = renamePathSegments(decl.path, oldId, newId)
  const newLastSeg = newPath[newPath.length - 1]
  const idChanged = decl.id === oldId && decl.alias === null
  return {
    ...decl,
    path: newPath,
    id: idChanged ? newLastSeg : decl.id,
  }
}

const renameSeqMessageContent = (
  content: SeqMessageContent,
  oldId: string,
  newId: string,
): SeqMessageContent => {
  switch (content.kind) {
    case "functionRef":
      return {
        ...content,
        interfaceId: content.interfaceId === oldId ? newId : content.interfaceId,
        functionId: content.functionId === oldId ? newId : content.functionId,
      }
    case "useCaseRef":
      return { ...content, path: renamePathSegments(content.path, oldId, newId) }
    case "seqDiagramRef":
      return { ...content, path: renamePathSegments(content.path, oldId, newId) }
    case "label":
    case "none":
      return content
    default:
      return assertNever(content)
  }
}

const renameSeqNote = (note: SeqNote, oldId: string, newId: string): SeqNote => {
  const position = note.position
  if (position.kind === "side") {
    return {
      ...note,
      position: {
        ...position,
        participant: position.participant === oldId ? newId : position.participant,
      },
    }
  }

  const [first, second] = position.participants
  return {
    ...note,
    position: {
      ...position,
      participants: [
        first === oldId ? newId : first,
        second != null ? (second === oldId ? newId : second) : null,
      ],
    },
  }
}

const renameSeqBlockSection = (
  section: SeqBlockSection,
  oldId: string,
  newId: string,
): SeqBlockSection => ({
  ...section,
  statements: renameSeqStatements(section.statements, oldId, newId),
})

const renameSeqStatements = (
  statements: SeqStatement[],
  oldId: string,
  newId: string,
): SeqStatement[] =>
  statements.map((statement) => {
    if ("sections" in statement) {
      return {
        ...statement,
        sections: statement.sections.map((section) => renameSeqBlockSection(section, oldId, newId)),
      }
    }
    if ("position" in statement) return renameSeqNote(statement, oldId, newId)
    if ("action" in statement) {
      return {
        ...statement,
        participant: statement.participant === oldId ? newId : statement.participant,
      }
    }
    if (!("from" in statement)) return statement
    return {
      ...statement,
      from: statement.from === oldId ? newId : statement.from,
      to: statement.to === oldId ? newId : statement.to,
      content: renameSeqMessageContent(statement.content, oldId, newId),
    }
  })

const renameInSeqAst = (ast: SeqAst, oldId: string, newId: string): SeqAst => ({
  declarations: ast.declarations.map((declaration) => renameSeqDeclaration(declaration, oldId, newId)),
  statements: renameSeqStatements(ast.statements, oldId, newId),
})

const resolveLocalSequenceParticipantUuid = (
  root: ComponentNode,
  ownerComponentUuid: string,
  participantId: string,
): string | undefined => {
  const ownerComponent = findCompByUuid(root, ownerComponentUuid)
  if (!ownerComponent) return undefined
  return findOwnerActorOrComponentUuidById(ownerComponent, participantId)
}

const renameScopedSeqDeclaration = (
  decl: SeqDeclaration,
  ownerComponentUuid: string,
  context: ScopedRenameContext,
): SeqDeclaration => {
  const updatedPath = renameResolvedPathSegments(decl.path, context, (root, candidateSegments) => {
    const ownerComponent = findCompByUuid(root, ownerComponentUuid)
    if (!ownerComponent) return null
    const candidatePath = candidateSegments.join("/")
    return resolveDiagramDeclarationUuid(
      decl.entityType,
      candidateSegments[candidateSegments.length - 1] ?? decl.id,
      candidateSegments.length > 1 ? candidatePath : undefined,
      root,
      ownerComponent,
    )
  })

  if (updatedPath === decl.path) return decl

  const nextTerminalId = updatedPath[updatedPath.length - 1]
  return {
    ...decl,
    path: updatedPath,
    id: decl.id === context.oldId && decl.alias === null ? nextTerminalId : decl.id,
  }
}

const renameScopedParticipant = (
  participantId: string,
  ownerComponentUuid: string,
  context: ScopedRenameContext,
): string =>
  participantId === context.oldId
  && resolveLocalSequenceParticipantUuid(context.rootBefore, ownerComponentUuid, participantId) === context.targetUuid
    ? context.newId
    : participantId

const renameScopedMessageContent = (
  message: SeqMessage,
  ownerComponentUuid: string,
  context: ScopedRenameContext,
): SeqMessageContent => {
  const content = message.content
  switch (content.kind) {
    case "functionRef": {
      const resolvedTarget = resolveFunctionReferenceTarget(
        context.rootBefore,
        message.to,
        content.interfaceId,
        content.functionId,
      )
      return {
        ...content,
        interfaceId: content.interfaceId === context.oldId && resolvedTarget?.interfaceUuid === context.targetUuid
          ? context.newId
          : content.interfaceId,
        functionId: content.functionId === context.oldId && resolvedTarget?.functionUuid === context.targetUuid
          ? context.newId
          : content.functionId,
      }
    }
    case "useCaseRef":
      return {
        ...content,
        path: renameResolvedPathSegments(content.path, context, (root, candidateSegments) => {
          return resolveScopedUseCaseReferenceUuid(root, ownerComponentUuid, candidateSegments)
        }),
      }
    case "seqDiagramRef":
      return {
        ...content,
        path: renameResolvedPathSegments(content.path, context, (root, candidateSegments) => {
          return resolveScopedSequenceReferenceUuid(root, ownerComponentUuid, candidateSegments)
        }),
      }
    case "label":
    case "none":
      return content
    default:
      return assertNever(content)
  }
}

const renameScopedSeqNote = (
  note: SeqNote,
  ownerComponentUuid: string,
  context: ScopedRenameContext,
): SeqNote => {
  const position = note.position
  if (position.kind === "side") {
    return {
      ...note,
      position: {
        ...position,
        participant: renameScopedParticipant(position.participant, ownerComponentUuid, context),
      },
    }
  }

  const [first, second] = position.participants
  return {
    ...note,
    position: {
      ...position,
      participants: [
        renameScopedParticipant(first, ownerComponentUuid, context),
        second != null ? renameScopedParticipant(second, ownerComponentUuid, context) : null,
      ],
    },
  }
}

const renameScopedSeqStatement = (
  statement: SeqStatement,
  ownerComponentUuid: string,
  context: ScopedRenameContext,
): SeqStatement => {
  if ("sections" in statement) {
    const block: SeqBlock = statement
    return {
      ...block,
      sections: block.sections.map((section) => ({
        ...section,
        statements: section.statements.map((child) =>
          renameScopedSeqStatement(child, ownerComponentUuid, context),
        ),
      })),
    }
  }
  if ("position" in statement) return renameScopedSeqNote(statement, ownerComponentUuid, context)
  if ("action" in statement) {
    return {
      ...statement,
      participant: renameScopedParticipant(statement.participant, ownerComponentUuid, context),
    }
  }
  if (!("from" in statement)) return statement

  return {
    ...statement,
    from: renameScopedParticipant(statement.from, ownerComponentUuid, context),
    to: renameScopedParticipant(statement.to, ownerComponentUuid, context),
    content: renameScopedMessageContent(statement, ownerComponentUuid, context),
  }
}

export const updateSequenceDiagramRefsInContext = (
  content: string,
  ownerComponentUuid: string,
  context: ScopedRenameContext,
): string => {
  if (!content.trim()) return content

  const { cst, lexErrors, parseErrors } = parseSequenceDiagramCst(content)
  if (lexErrors.length || parseErrors.length) return content

  const ast = buildSeqAst(cst)
  return seqAstToSpec({
    declarations: ast.declarations.map((declaration) =>
      renameScopedSeqDeclaration(declaration, ownerComponentUuid, context)),
    statements: ast.statements.map((statement) =>
      renameScopedSeqStatement(statement, ownerComponentUuid, context)),
  })
}

/**
 * Perform a full deep rename across the entire component tree.
 * Delegates to applyIdRenameInComponent which owns all component-tree traversal.
 */
export const applyIdRename = (
  root: ComponentNode,
  targetUuid: string,
  oldId: string,
  newId: string,
): ComponentNode => {
  const targetOwner = findNearestComponentAncestor(root, targetUuid)
  const renameContext = buildScopedRenameContext(root, targetUuid, oldId, newId)

  return applyIdRenameInComponent(
    root,
    targetUuid,
    oldId,
    newId,
    renameContext,
    targetOwner?.uuid ?? root.uuid,
  )
}

export const renameInUcdSpec = (content: string, oldId: string, newId: string): string => {
  if (!content.trim()) return content
  const { cst, lexErrors, parseErrors } = parseUseCaseDiagramCst(content)
  if (lexErrors.length || parseErrors.length) return content
  const ast = buildUcdAst(cst)
  return ucdAstToSpec(renameInUcdAst(ast, oldId, newId))
}

export const renameInSeqSpec = (content: string, oldId: string, newId: string): string => {
  if (!content.trim()) return content
  const { cst, lexErrors, parseErrors } = parseSequenceDiagramCst(content)
  if (lexErrors.length || parseErrors.length) return content
  const ast = buildSeqAst(cst)
  return seqAstToSpec(renameInSeqAst(ast, oldId, newId))
}
