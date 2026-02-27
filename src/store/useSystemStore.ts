import { create } from 'zustand';
import type { ComponentNode } from '../types';
import { findNode } from '../utils/nodeUtils';

function updateNodeInTree(
  root: ComponentNode,
  uuid: string,
  updates: Partial<Omit<ComponentNode, 'uuid' | 'children'>>
): ComponentNode {
  if (root.uuid === uuid) {
    return { ...root, ...updates };
  }
  return {
    ...root,
    children: root.children.map(child => updateNodeInTree(child, uuid, updates)),
  };
}

function addChildToTree(
  root: ComponentNode,
  parentUuid: string,
  child: Omit<ComponentNode, 'children'>
): ComponentNode {
  if (root.uuid === parentUuid) {
    return { ...root, children: [...root.children, { ...child, children: [] }] };
  }
  return {
    ...root,
    children: root.children.map(c => addChildToTree(c, parentUuid, child)),
  };
}

function deleteNodeFromTree(root: ComponentNode, uuid: string): ComponentNode {
  return {
    ...root,
    children: root.children
      .filter(c => c.uuid !== uuid)
      .map(c => deleteNodeFromTree(c, uuid)),
  };
}

const initialRoot: ComponentNode = {
  uuid: 'root-uuid',
  id: 'root',
  name: 'System',
  type: 'root',
  children: [],
  interfaces: [],
  useCases: [],
  diagramSpec: '',
  diagramType: 'sequence-diagram',
};

interface SystemStore {
  root: ComponentNode;
  selectedNodeUuid: string | null;
  selectNode: (uuid: string) => void;
  addChild: (parentUuid: string, child: Omit<ComponentNode, 'children'>) => void;
  updateNode: (uuid: string, updates: Partial<Omit<ComponentNode, 'uuid' | 'children'>>) => void;
  deleteNode: (uuid: string) => void;
}

export const useSystemStore = create<SystemStore>((set) => ({
  root: initialRoot,
  selectedNodeUuid: 'root-uuid',

  selectNode: (uuid) => set({ selectedNodeUuid: uuid }),

  addChild: (parentUuid, child) =>
    set(state => ({ root: addChildToTree(state.root, parentUuid, child) })),

  updateNode: (uuid, updates) =>
    set(state => ({ root: updateNodeInTree(state.root, uuid, updates) })),

  deleteNode: (uuid) =>
    set(state => {
      const newRoot = deleteNodeFromTree(state.root, uuid);
      return {
        root: newRoot,
        selectedNodeUuid: state.selectedNodeUuid === uuid ? 'root-uuid' : state.selectedNodeUuid,
      };
    }),
}));

export { findNode };
