import { useEffect, useState } from 'react';
import { useSystemStore } from '../store/useSystemStore';
import type { Node, DiagramNode } from '../store/types';
import './EditorPanel.css';

const CommonEditor = ({ node, onUpdate }: { node: Node, onUpdate: (updates: any) => void }) => {
  const [description, setDescription] = useState(node.description || '');

  useEffect(() => {
    setDescription(node.description || '');
  }, [node.id, node.description]);

  const handleBlur = () => {
    if (description !== node.description) {
      onUpdate({ description });
    }
  };

  return (
    <div className="editor-container">
      <div className="editor-header">
        <h2 className="editor-title">
          {node.name}
          <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">
            {node.type}
          </span>
        </h2>
        <p className="editor-subtitle">ID: <span className="font-mono text-gray-500">{node.id}</span></p>
      </div>

      <div className="form-group">
        <label className="form-label">Name (Read-only)</label>
        <input 
          className="form-input form-input-readonly" 
          type="text" 
          value={node.name} 
          readOnly 
        />
      </div>

      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea 
          className="form-input" 
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={handleBlur}
        />
      </div>
    </div>
  );
};

const DiagramEditor = ({ node, onUpdate }: { node: DiagramNode, onUpdate: (updates: any) => void }) => {
  const [content, setContent] = useState(node.content || '');

  useEffect(() => {
    setContent(node.content || '');
  }, [node.id, node.content]);

  const handleBlur = () => {
    if (content !== node.content) {
      onUpdate({ content });
    }
  };

  return (
    <div className="editor-container">
      <div className="editor-header">
         <h2 className="editor-title">{node.name}</h2>
         <p className="editor-subtitle">Usage: {node.type === 'sequence-diagram' ? 'Mermaid Sequence Syntax' : 'Text / YAML'}</p>
      </div>

       <div className="form-group flex-1 flex flex-col">
        <label className="form-label">Specification</label>
        <textarea 
          className="form-input form-textarea form-textarea-code flex-1" 
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onBlur={handleBlur}
          placeholder={node.type === 'sequence-diagram' ? 'participant Alice\nparticipant Bob\nAlice->>Bob: Hello' : 'YAML specification'}
        />
      </div>
    </div>
  );
};

export const EditorPanel = () => {
  const selectedNodeId = useSystemStore((state) => state.selectedNodeId);
  const system = useSystemStore((state) => state.system);
  const updateNode = useSystemStore((state) => state.updateNode);

  // Helper to find node (since we didn't export it from store, we might need a selector or just recursive search here which is inefficient but okay for now)
  // Better: add getNodeById selector in store. For now, let's copy the recursive search or use a simple hook if we had one.
  // Actually, we can just traverse.
  const findNode = (nodes: Node[] | any[], id: string): Node | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      
      let children: any[] = [];
       if (node.type === 'system') {
        children = (node as any).components;
      } else if (node.type === 'component') {
        const comp = node as any;
        children = [
            ...comp.subComponents,
            ...comp.actors,
            ...comp.useCases,
            ...comp.useCaseDiagrams,
            ...comp.sequenceDiagrams
        ];
      }
      
      if (children.length > 0) {
        const found = findNode(children, id);
        if (found) return found;
      }
    }
    return null;
  };
  
  const selectedNode = selectedNodeId ? findNode([system], selectedNodeId) : null;

  if (!selectedNode) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        Select a node from the explorer to edit
      </div>
    );
  }

  const handleUpdate = (updates: any) => {
    updateNode(selectedNode.id, updates);
  };

  if (selectedNode.type === 'use-case-diagram' || selectedNode.type === 'sequence-diagram') {
    return <DiagramEditor node={selectedNode as DiagramNode} onUpdate={handleUpdate} />;
  }

  return <CommonEditor node={selectedNode} onUpdate={handleUpdate} />;
};
