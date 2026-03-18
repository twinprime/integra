import { findNodeByUuid, getNodeChildren } from '../nodes/nodeTree'
import type { ComponentNode, Node, SequenceDiagramNode, UseCaseDiagramNode } from '../store/types'

export type NodeTodoSource = 'description' | 'diagram'

export interface DerivedNodeTodo {
    readonly id: string
    readonly text: string
    readonly definingNodeUuid: string
    readonly definingNodeName: string
    readonly source: NodeTodoSource
}

const aggregatedTodoCache = new WeakMap<
    ComponentNode,
    Map<string, ReadonlyArray<DerivedNodeTodo>>
>()

function getTodoCache(root: ComponentNode): Map<string, ReadonlyArray<DerivedNodeTodo>> {
    let cache = aggregatedTodoCache.get(root)
    if (!cache) {
        cache = new Map()
        aggregatedTodoCache.set(root, cache)
    }
    return cache
}

function normalizeTodoText(rawText: string): string {
    return rawText
        .replace(/^[\s:.-]+/, '')
        .replace(/\s+/g, ' ')
        .trim()
}

function createTodo(
    node: Node,
    source: NodeTodoSource,
    rawText: string,
    index: number
): DerivedNodeTodo | null {
    const text = normalizeTodoText(rawText)
    if (!text) return null
    return {
        id: `${node.uuid}:${source}:${index}:${text}`,
        text,
        definingNodeUuid: node.uuid,
        definingNodeName: node.name,
        source,
    }
}

export function extractDescriptionTodos(node: Node): DerivedNodeTodo[] {
    if (!node.description) return []

    const todos: DerivedNodeTodo[] = []
    const todoCommentPattern = /<!--\s*TODO\b([\s\S]*?)-->/g
    let match: RegExpExecArray | null = todoCommentPattern.exec(node.description)
    let index = 0

    while (match) {
        const todo = createTodo(node, 'description', match[1] ?? '', index)
        if (todo) todos.push(todo)
        index += 1
        match = todoCommentPattern.exec(node.description)
    }

    return todos
}

export function extractDiagramTodos(
    node: SequenceDiagramNode | UseCaseDiagramNode
): DerivedNodeTodo[] {
    if (!node.content) return []

    return node.content
        .split('\n')
        .map((line, index) => {
            const match = line.match(/^\s*#\s*TODO\b(.*)$/)
            return match ? createTodo(node, 'diagram', match[1] ?? '', index) : null
        })
        .filter((todo): todo is DerivedNodeTodo => todo !== null)
}

export function extractOwnNodeTodos(node: Node): DerivedNodeTodo[] {
    const descriptionTodos = extractDescriptionTodos(node)
    if (node.type === 'sequence-diagram' || node.type === 'use-case-diagram') {
        return [...descriptionTodos, ...extractDiagramTodos(node)]
    }
    return descriptionTodos
}

function collectAggregatedNodeTodos(
    node: Node,
    cache: Map<string, ReadonlyArray<DerivedNodeTodo>>
): ReadonlyArray<DerivedNodeTodo> {
    const cached = cache.get(node.uuid)
    if (cached) return cached

    const aggregated = [
        ...extractOwnNodeTodos(node),
        ...getNodeChildren(node).flatMap((child) => collectAggregatedNodeTodos(child, cache)),
    ]

    cache.set(node.uuid, aggregated)
    return aggregated
}

export function getAggregatedNodeTodos(
    root: ComponentNode,
    nodeUuid: string
): ReadonlyArray<DerivedNodeTodo> {
    const node = findNodeByUuid([root], nodeUuid)
    if (!node) return []
    return collectAggregatedNodeTodos(node, getTodoCache(root))
}
