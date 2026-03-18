import type { ComponentNode } from '../store/types'
import { findCompByUuid } from '../nodes/componentTraversal'
import {
    findOwnerActorOrComponentUuidById,
    findOwnerUseCaseUuidById,
    resolveDiagramDeclarationUuid,
    resolveFunctionReferenceTarget,
} from './diagramResolvers'
import { parseSequenceDiagramCst } from '../parser/sequenceDiagram/parser'
import { seqAstToSpec } from '../parser/sequenceDiagram/specSerializer'
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
} from '../parser/sequenceDiagram/visitor'
import {
    type ScopedRenameContext,
    resolveScopedComponentPath,
    renameResolvedPathSegments,
    renamePathSegments,
} from './renameNodeId'

const resolveScopedUseCaseReferenceUuid = (
    root: ComponentNode,
    ownerComponentUuid: string,
    path: string[]
): string | undefined => {
    const targetId = path[path.length - 1]
    const component =
        path.length === 1
            ? findCompByUuid(root, ownerComponentUuid)
            : resolveScopedComponentPath(root, ownerComponentUuid, path.slice(0, -1))
    if (!component) return undefined
    return findOwnerUseCaseUuidById(component, targetId)
}

const resolveScopedSequenceReferenceUuid = (
    root: ComponentNode,
    ownerComponentUuid: string,
    path: string[]
): string | undefined => {
    const targetId = path[path.length - 1]
    const component =
        path.length === 1
            ? findCompByUuid(root, ownerComponentUuid)
            : resolveScopedComponentPath(root, ownerComponentUuid, path.slice(0, -1))
    if (!component) return undefined

    for (const useCaseDiagram of component.useCaseDiagrams) {
        for (const useCase of useCaseDiagram.useCases) {
            const sequenceDiagram = useCase.sequenceDiagrams.find(
                (candidate) => candidate.id === targetId
            )
            if (sequenceDiagram) return sequenceDiagram.uuid
        }
    }
    return undefined
}

function assertNever(x: never): never {
    throw new Error(`Unhandled sequence statement: ${JSON.stringify(x)}`)
}

const renameSeqDeclaration = (
    decl: SeqDeclaration,
    oldId: string,
    newId: string
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
    newId: string
): SeqMessageContent => {
    switch (content.kind) {
        case 'functionRef':
            return {
                ...content,
                interfaceId: content.interfaceId === oldId ? newId : content.interfaceId,
                functionId: content.functionId === oldId ? newId : content.functionId,
            }
        case 'useCaseRef':
            return { ...content, path: renamePathSegments(content.path, oldId, newId) }
        case 'seqDiagramRef':
            return { ...content, path: renamePathSegments(content.path, oldId, newId) }
        case 'label':
        case 'none':
            return content
        default:
            return assertNever(content)
    }
}

const renameSeqNote = (note: SeqNote, oldId: string, newId: string): SeqNote => {
    const position = note.position
    if (position.kind === 'side') {
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
    newId: string
): SeqBlockSection => ({
    ...section,
    statements: renameSeqStatements(section.statements, oldId, newId),
})

const renameSeqStatements = (
    statements: SeqStatement[],
    oldId: string,
    newId: string
): SeqStatement[] =>
    statements.map((statement) => {
        if ('sections' in statement) {
            return {
                ...statement,
                sections: statement.sections.map((section) =>
                    renameSeqBlockSection(section, oldId, newId)
                ),
            }
        }
        if ('position' in statement) return renameSeqNote(statement, oldId, newId)
        if ('action' in statement) {
            return {
                ...statement,
                participant: statement.participant === oldId ? newId : statement.participant,
            }
        }
        if (!('from' in statement)) return statement
        return {
            ...statement,
            from: statement.from === oldId ? newId : statement.from,
            to: statement.to === oldId ? newId : statement.to,
            content: renameSeqMessageContent(statement.content, oldId, newId),
        }
    })

const renameInSeqAst = (ast: SeqAst, oldId: string, newId: string): SeqAst => ({
    declarations: ast.declarations.map((declaration) =>
        renameSeqDeclaration(declaration, oldId, newId)
    ),
    statements: renameSeqStatements(ast.statements, oldId, newId),
})

const resolveLocalSequenceParticipantUuid = (
    root: ComponentNode,
    ownerComponentUuid: string,
    participantId: string
): string | undefined => {
    const ownerComponent = findCompByUuid(root, ownerComponentUuid)
    if (!ownerComponent) return undefined
    return findOwnerActorOrComponentUuidById(ownerComponent, participantId)
}

const renameScopedSeqDeclaration = (
    decl: SeqDeclaration,
    ownerComponentUuid: string,
    context: ScopedRenameContext
): SeqDeclaration => {
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

const renameScopedParticipant = (
    participantId: string,
    ownerComponentUuid: string,
    context: ScopedRenameContext
): string =>
    participantId === context.oldId &&
    resolveLocalSequenceParticipantUuid(context.rootBefore, ownerComponentUuid, participantId) ===
        context.targetUuid
        ? context.newId
        : participantId

const renameScopedMessageContent = (
    message: SeqMessage,
    ownerComponentUuid: string,
    context: ScopedRenameContext
): SeqMessageContent => {
    const content = message.content
    switch (content.kind) {
        case 'functionRef': {
            const resolvedTarget = resolveFunctionReferenceTarget(
                context.rootBefore,
                message.to,
                content.interfaceId,
                content.functionId
            )
            return {
                ...content,
                interfaceId:
                    content.interfaceId === context.oldId &&
                    resolvedTarget?.interfaceUuid === context.targetUuid
                        ? context.newId
                        : content.interfaceId,
                functionId:
                    content.functionId === context.oldId &&
                    resolvedTarget?.functionUuid === context.targetUuid
                        ? context.newId
                        : content.functionId,
            }
        }
        case 'useCaseRef':
            return {
                ...content,
                path: renameResolvedPathSegments(
                    content.path,
                    context,
                    (root, candidateSegments) => {
                        return resolveScopedUseCaseReferenceUuid(
                            root,
                            ownerComponentUuid,
                            candidateSegments
                        )
                    }
                ),
            }
        case 'seqDiagramRef':
            return {
                ...content,
                path: renameResolvedPathSegments(
                    content.path,
                    context,
                    (root, candidateSegments) => {
                        return resolveScopedSequenceReferenceUuid(
                            root,
                            ownerComponentUuid,
                            candidateSegments
                        )
                    }
                ),
            }
        case 'label':
        case 'none':
            return content
        default:
            return assertNever(content)
    }
}

const renameScopedSeqNote = (
    note: SeqNote,
    ownerComponentUuid: string,
    context: ScopedRenameContext
): SeqNote => {
    const position = note.position
    if (position.kind === 'side') {
        return {
            ...note,
            position: {
                ...position,
                participant: renameScopedParticipant(
                    position.participant,
                    ownerComponentUuid,
                    context
                ),
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
                second != null
                    ? renameScopedParticipant(second, ownerComponentUuid, context)
                    : null,
            ],
        },
    }
}

const renameScopedSeqStatement = (
    statement: SeqStatement,
    ownerComponentUuid: string,
    context: ScopedRenameContext
): SeqStatement => {
    if ('sections' in statement) {
        const block: SeqBlock = statement
        return {
            ...block,
            sections: block.sections.map((section) => ({
                ...section,
                statements: section.statements.map((child) =>
                    renameScopedSeqStatement(child, ownerComponentUuid, context)
                ),
            })),
        }
    }
    if ('position' in statement) return renameScopedSeqNote(statement, ownerComponentUuid, context)
    if ('action' in statement) {
        return {
            ...statement,
            participant: renameScopedParticipant(
                statement.participant,
                ownerComponentUuid,
                context
            ),
        }
    }
    if (!('from' in statement)) return statement

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
    context: ScopedRenameContext
): string => {
    if (!content.trim()) return content

    const { cst, lexErrors, parseErrors } = parseSequenceDiagramCst(content)
    if (lexErrors.length || parseErrors.length) return content

    const ast = buildSeqAst(cst)
    return seqAstToSpec({
        declarations: ast.declarations.map((declaration) =>
            renameScopedSeqDeclaration(declaration, ownerComponentUuid, context)
        ),
        statements: ast.statements.map((statement) =>
            renameScopedSeqStatement(statement, ownerComponentUuid, context)
        ),
    })
}

export const renameInSeqSpec = (content: string, oldId: string, newId: string): string => {
    if (!content.trim()) return content
    const { cst, lexErrors, parseErrors } = parseSequenceDiagramCst(content)
    if (lexErrors.length || parseErrors.length) return content
    const ast = buildSeqAst(cst)
    return seqAstToSpec(renameInSeqAst(ast, oldId, newId))
}
