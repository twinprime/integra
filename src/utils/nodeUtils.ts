import type { ComponentNode } from '../types';

export function findNode(root: ComponentNode, uuid: string): ComponentNode | null {
  if (root.uuid === uuid) return root;
  for (const child of root.children) {
    const found = findNode(child, uuid);
    if (found) return found;
  }
  return null;
}

export function findNearestComponentAncestor(
  root: ComponentNode,
  uuid: string,
  ancestors: ComponentNode[] = []
): ComponentNode | null {
  if (root.uuid === uuid) {
    for (let i = ancestors.length - 1; i >= 0; i--) {
      if (ancestors[i].type === 'component' || ancestors[i].type === 'root') {
        return ancestors[i];
      }
    }
    return null;
  }
  for (const child of root.children) {
    if (findNode(child, uuid) !== null) {
      return findNearestComponentAncestor(child, uuid, [...ancestors, root]);
    }
  }
  return null;
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
