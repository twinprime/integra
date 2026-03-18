import type { ComponentNode } from '../store/types'
import { findCompByUuid } from '../nodes/componentTraversal'
import {
    findOwnerActorOrComponentUuidById,
    findOwnerUseCaseUuidById,
    resolveDiagramDeclarationUuid,
} from './diagramResolvers'
import { parseUseCaseDiagramCst } from '../parser/useCaseDiagram/parser'
import { ucdAstToSpec } from '../parser/useCaseDiagram/specSerializer'
import {
    buildUcdAst,
    type UcdAst,
    type UcdDeclaration,
    type UcdLink,
    type UcdStatement,
} from '../parser/useCaseDiagram/visitor'
import {
    type ScopedRenameContext,
    renameResolvedPathSegments,
    renamePathSegments,
} from './renameNodeId'

const resolveLocalUseCaseDiagramNodeUuid = (
    root: ComponentNode,
    ownerComponentUuid: string,
    nodeId: string
): string | undefined => {
    const ownerComponent = findCompByUuid(root, ownerComponentUuid)
    if (!ownerComponent) return undefined
    return (
        findOwnerUseCaseUuidById(ownerComponent, nodeId) ??
        findOwnerActorOrComponentUuidById(ownerComponent, nodeId)
    )
}

const renameScopedUcdDeclaration = (
    decl: UcdDeclaration,
    ownerComponentUuid: string,
    context: ScopedRenameContext
): UcdDeclaration => {
    const updatedPath = renameResolvedPathSegments(
        decl.path,
        context,
        (root, candidateSegments) => {
            const ownerComponent = findCompByUuid(root, ownerComponentUuid)
            if (!ownerComponent) return null
            const candidatePath = candidateSegments.join('/')
            return resolveDiagramDeclarationUuid(
                decl.entityType,
                candidateSegments[candidateSegments.length - 1] ?? decl.id,
                candidateSegments.length > 1 ? candidatePath : undefined,
                root,
                ownerComponent
            )
        }
    )

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
    context: ScopedRenameContext
): string =>
    endpoint === context.oldId &&
    resolveLocalUseCaseDiagramNodeUuid(context.rootBefore, ownerComponentUuid, endpoint) ===
        context.targetUuid
        ? context.newId
        : endpoint

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
    if ('entityType' in stmt) return renameDeclaration(stmt, oldId, newId)
    if ('from' in stmt) return renameLink(stmt, oldId, newId)
    return stmt
}

const renameInUcdAst = (ast: UcdAst, oldId: string, newId: string): UcdAst => {
    const statements = ast.statements.map((statement) =>
        renameUcdStatement(statement, oldId, newId)
    )
    return {
        declarations: statements.filter(
            (statement): statement is UcdDeclaration => 'entityType' in statement
        ),
        links: statements.filter((statement): statement is UcdLink => 'from' in statement),
        statements,
    }
}

export const updateUseCaseDiagramRefsInContext = (
    content: string,
    ownerComponentUuid: string,
    context: ScopedRenameContext
): string => {
    if (!content.trim()) return content

    const { cst, lexErrors, parseErrors } = parseUseCaseDiagramCst(content)
    if (lexErrors.length || parseErrors.length) return content

    const ast = buildUcdAst(cst)
    const statements = ast.statements.map((statement) => {
        if ('entityType' in statement) {
            return renameScopedUcdDeclaration(statement, ownerComponentUuid, context)
        }
        if ('from' in statement) {
            return {
                ...statement,
                from: renameScopedUcdLinkEndpoint(statement.from, ownerComponentUuid, context),
                to: renameScopedUcdLinkEndpoint(statement.to, ownerComponentUuid, context),
            }
        }
        return statement
    })

    return ucdAstToSpec({
        declarations: statements.filter(
            (statement): statement is UcdDeclaration => 'entityType' in statement
        ),
        links: statements.filter((statement): statement is UcdLink => 'from' in statement),
        statements,
    })
}

export const renameInUcdSpec = (content: string, oldId: string, newId: string): string => {
    if (!content.trim()) return content
    const { cst, lexErrors, parseErrors } = parseUseCaseDiagramCst(content)
    if (lexErrors.length || parseErrors.length) return content
    const ast = buildUcdAst(cst)
    return ucdAstToSpec(renameInUcdAst(ast, oldId, newId))
}

// Needed by resolveScopedComponentPath (imported from renameNodeId) — re-export to satisfy callers
export type { ScopedRenameContext }
