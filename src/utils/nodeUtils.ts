import type { ComponentNode } from '../types';

export function findNode(root: ComponentNode, uuid: string): ComponentNode | null {
  if (root.uuid === uuid) return root;
  for (const child of root.children) {
    const found = findNode(child, uuid);
    if (found) return found;
  }
  return null;
}

// Internal sentinel to distinguish "not found" from "found but no ancestor"
const NOT_FOUND = Symbol('NOT_FOUND');

function findAncestorHelper(
  root: ComponentNode,
  uuid: string,
  ancestors: ComponentNode[]
): ComponentNode | null | typeof NOT_FOUND {
  if (root.uuid === uuid) {
    for (let i = ancestors.length - 1; i >= 0; i--) {
      if (ancestors[i].type === 'component' || ancestors[i].type === 'root') {
        return ancestors[i];
      }
    }
    return null;
  }
  for (const child of root.children) {
    const result = findAncestorHelper(child, uuid, [...ancestors, root]);
    if (result !== NOT_FOUND) return result;
  }
  return NOT_FOUND;
}

export function findNearestComponentAncestor(
  root: ComponentNode,
  uuid: string
): ComponentNode | null {
  const result = findAncestorHelper(root, uuid, []);
  return result === NOT_FOUND ? null : result;
}

export function isUseCaseReferenced(
  root: ComponentNode,
  ucId: string,
  ownerUuid: string
): boolean {
  function search(node: ComponentNode): boolean {
    if (node.uuid !== ownerUuid && node.diagramSpec.includes(ucId)) return true;
    return node.children.some(search);
  }
  return search(root);
}

export function collectAllNodes(root: ComponentNode): ComponentNode[] {
  return [root, ...root.children.flatMap(collectAllNodes)];
}
