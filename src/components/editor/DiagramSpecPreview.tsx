import React from 'react';
import type { ComponentNode } from '../../types';
import { parseParticipants } from '../../utils/sequenceDiagramParser';

interface Props {
  content: string;
  ownerComp: ComponentNode | null;
}

// Basic syntax token colors
const TOKEN_COLORS: Record<string, string> = {
  keyword: '#569cd6',
  string: '#ce9178',
  id: '#9cdcfe',
  arrow: '#d4d4d4',
  comment: '#6a9955',
  'use-case-keyword': '#c586c0',
};

function tokenizeLine(line: string): Array<{ text: string; type: string }> {
  const tokens: Array<{ text: string; type: string }> = [];

  // Comment
  if (/^\s*%%/.test(line)) {
    return [{ text: line, type: 'comment' }];
  }

  // Sequence message: sender->>receiver: body
  const msgMatch = /^(\s*)(\w+)(->>)(\w+)(:\s*)(.*)$/.exec(line);
  if (msgMatch) {
    tokens.push({ text: msgMatch[1], type: 'plain' });
    tokens.push({ text: msgMatch[2], type: 'id' });
    tokens.push({ text: msgMatch[3], type: 'arrow' });
    tokens.push({ text: msgMatch[4], type: 'id' });
    tokens.push({ text: msgMatch[5], type: 'plain' });
    tokens.push({ text: msgMatch[6], type: 'string' });
    return tokens;
  }

  // Participant declaration: actor/component "Name" [from X] as id
  const partMatch = /^(\s*)(actor|component|use case)\s+("(?:[^"]+)")((?:\s+from\s+\S+)?)\s+(as\s+)(\S+)(.*)$/.exec(line);
  if (partMatch) {
    tokens.push({ text: partMatch[1], type: 'plain' });
    tokens.push({ text: partMatch[2], type: 'keyword' });
    tokens.push({ text: ' ', type: 'plain' });
    tokens.push({ text: partMatch[3], type: 'string' });
    if (partMatch[4]) tokens.push({ text: partMatch[4], type: 'keyword' });
    tokens.push({ text: ' ', type: 'plain' });
    tokens.push({ text: partMatch[5], type: 'keyword' });
    tokens.push({ text: partMatch[6], type: 'id' });
    if (partMatch[7]) tokens.push({ text: partMatch[7], type: 'plain' });
    return tokens;
  }

  // use case keyword at start
  const ucMatch = /^(\s*)(actor|component|use\s+case)\s+(.*)$/.exec(line);
  if (ucMatch) {
    tokens.push({ text: ucMatch[1], type: 'plain' });
    tokens.push({ text: ucMatch[2], type: 'keyword' });
    tokens.push({ text: ' ' + ucMatch[3], type: 'plain' });
    return tokens;
  }

  return [{ text: line, type: 'plain' }];
}

export const DiagramSpecPreview: React.FC<Props> = ({ content }) => {
  const lines = content.split('\n');
  // Gather declared ids for context-aware coloring
  const participants = parseParticipants(content);
  const declaredIds = new Set(participants.map(p => p.id));

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontFamily: 'monospace',
        fontSize: 14,
        lineHeight: '1.5',
        padding: '8px',
        color: 'transparent',
        background: 'transparent',
      }}
    >
      {lines.map((line, i) => {
        const tokens = tokenizeLine(line);
        return (
          <React.Fragment key={i}>
            {tokens.map((tok, j) => {
              // If it's an id token, check it's a declared id
              const color =
                tok.type === 'id' && declaredIds.has(tok.text)
                  ? TOKEN_COLORS['id']
                  : tok.type === 'plain'
                    ? '#d4d4d4'
                    : TOKEN_COLORS[tok.type] ?? '#d4d4d4';
              return (
                <span key={j} style={{ color }}>
                  {tok.text}
                </span>
              );
            })}
            {i < lines.length - 1 ? '\n' : ''}
          </React.Fragment>
        );
      })}
    </div>
  );
};
