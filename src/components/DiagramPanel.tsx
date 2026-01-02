import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { useSystemStore } from '../store/useSystemStore';
import type { DiagramNode, Node } from '../store/types';

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
});

export const DiagramPanel = () => {
    const selectedNodeId = useSystemStore((state) => state.selectedNodeId);
    const system = useSystemStore((state) => state.system);
    const elementRef = useRef<HTMLDivElement>(null);
    const [svg, setSvg] = useState<string>('');
    const [error, setError] = useState<string>('');

    // Reusing the findNode logic or we should move it to utils
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

    useEffect(() => {
        const renderDiagram = async () => {
             if (!selectedNode) {
                setSvg('');
                return;
            }
            
            const isDiagram = selectedNode.type === 'use-case-diagram' || selectedNode.type === 'sequence-diagram';
            
            if (!isDiagram) {
                setSvg(''); // Or maybe show something specific for other nodes if needed
                return;
            }

            const diagramNode = selectedNode as DiagramNode;
            
            if (!diagramNode.content || diagramNode.content.trim() === '') {
                setSvg('');
                return;
            }

            try {
                // Determine if valid mermaid code
                // We generate a unique ID for the SVG
                const id = `mermaid-${Date.now()}`;
                const { svg } = await mermaid.render(id, diagramNode.content);
                setSvg(svg);
                setError('');
            } catch (err: any) {
                console.error('Mermaid rendering error:', err);
                // Mermaid creates an error element in the DOM by default, we might handle it gracefully
                setError('Invalid Diagram Syntax');
                setSvg('');
            }
        };

        renderDiagram();
    }, [selectedNode]); // Trigger re-render when the node object updates (which happens on content change)


    // Actually we need to depend on content changes. 
    // The store updates the node object, so `selectedNode` reference changes on update.
    
    if (!selectedNode || (selectedNode.type !== 'use-case-diagram' && selectedNode.type !== 'sequence-diagram')) {
        return (
            <div className="h-full flex items-center justify-center text-gray-400">
                Open a diagram to visualize
            </div>
        );
    }

    return (
        <div className="w-full h-full flex flex-col">
            {error && <div className="text-red-500 p-2 text-sm">{error}</div>}
            <div 
                ref={elementRef}
                className="flex-1 overflow-auto flex justify-center items-start pt-4"
                dangerouslySetInnerHTML={{ __html: svg }}
                style={{ minHeight: '100px' }}
            />
        </div>
    );
};
