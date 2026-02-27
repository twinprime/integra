import React, { useEffect, useRef, useState, useMemo } from 'react';
import mermaid from 'mermaid';
import type { ComponentNode } from '../../types';
import { parseParticipants } from '../../utils/sequenceDiagramParser';

interface Props {
  node: ComponentNode;
}

const mermaidState = { initialized: false };

function initMermaid() {
  if (!mermaidState.initialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
    });
    mermaidState.initialized = true;
  }
}

/**
 * Transform custom spec format to mermaid syntax.
 * - Strips `from <componentId>` clauses from participant declarations
 * - Handles sequence-diagram and use-case-diagram types
 */
function transformToMermaid(node: ComponentNode): string {
  if (node.diagramType === 'sequence-diagram') {
    const lines = node.diagramSpec
      .split('\n')
      .map(line => line.replace(/^(\s*(?:actor|component)\s+"[^"]+"\s+)from\s+\S+\s+(as\s+)/, '$1$2'));
    return `sequenceDiagram\n${lines.join('\n')}`;
  } else {
    // use-case-diagram
    const participants = parseParticipants(node.diagramSpec);
    const lines: string[] = [];
    for (const p of participants) {
      lines.push(p.keyword === 'actor' ? `  ${p.keyword} ${p.id}` : `  rectangle ${p.id}`);
    }
    return `graph TD\n${lines.join('\n')}`;
  }
}

export const DiagramPanel: React.FC<Props> = ({ node }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const mermaidSource = useMemo(() => transformToMermaid(node), [node]);

  useEffect(() => {
    initMermaid();
    const id = `mermaid-${node.uuid}-${Date.now()}`;
    let cancelled = false;

    mermaid
      .render(id, mermaidSource)
      .then(({ svg }) => {
        if (!cancelled && containerRef.current) {
          setError(null);
          containerRef.current.innerHTML = svg;
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(String(err));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [node.uuid, node.diagramSpec, node.diagramType, mermaidSource]);

  if (error) {
    return (
      <div style={{ padding: 8 }}>
        <div style={{ color: 'red', marginBottom: 8, fontSize: 12 }}>
          Diagram error — showing generated source:
        </div>
        <pre style={{ fontSize: 12, background: '#f5f5f5', padding: 8, overflow: 'auto' }}>
          {mermaidSource}
        </pre>
      </div>
    );
  }

  return <div ref={containerRef} style={{ padding: 8, overflow: 'auto' }} />;
};
