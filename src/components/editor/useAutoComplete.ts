import { useMemo, useState, useCallback } from 'react';
import type { ComponentNode, DiagramType } from '../../types';

export interface Suggestion {
  label: string;
  insertText: string;
  replaceFrom: number;
}

const KEYWORDS = ['actor', 'component', 'use case'];

function getLineUpToCursor(content: string, cursorPos: number): string {
  const before = content.slice(0, cursorPos);
  const lastNewline = before.lastIndexOf('\n');
  return before.slice(lastNewline + 1);
}

function getLineIndex(content: string, cursorPos: number): number {
  return content.slice(0, cursorPos).split('\n').length - 1;
}

function getDeclaredIds(content: string): string[] {
  const ids: string[] = [];
  const re = /\bas\s+(\w+)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    ids.push(m[1]);
  }
  return [...new Set(ids)];
}

interface NodeWithParent {
  node: ComponentNode;
  parent: ComponentNode | null;
}

function getAllNodesWithParent(
  root: ComponentNode,
  parent: ComponentNode | null = null
): NodeWithParent[] {
  return [
    { node: root, parent },
    ...root.children.flatMap(child => getAllNodesWithParent(child, root)),
  ];
}

function buildEntityNameSuggestions(
  partial: string,
  ownerComp: ComponentNode | null,
  rootComponent: ComponentNode,
  cursorPos: number
): Suggestion[] {
  const all = getAllNodesWithParent(rootComponent);
  const ownerUuid = ownerComp?.uuid ?? rootComponent.uuid;
  const normalizedPartial = partial.replace(/^"/, '').toLowerCase();

  const suggestions: Suggestion[] = [];
  for (const { node, parent } of all) {
    if (node.type === 'root') continue;
    if (!normalizedPartial || node.name.toLowerCase().startsWith(normalizedPartial)) {
      const isLocal = parent?.uuid === ownerUuid;
      const label = isLocal
        ? `"${node.name}" as ${node.id}`
        : `"${node.name}" from ${parent?.id ?? rootComponent.id} as ${node.id}`;
      suggestions.push({
        label,
        insertText: label,
        replaceFrom: cursorPos - partial.length,
      });
    }
  }
  return suggestions;
}

function buildFunctionRefSuggestions(
  receiverId: string,
  partial: string,
  rootComponent: ComponentNode,
  cursorPos: number
): Suggestion[] {
  const all = getAllNodesWithParent(rootComponent);
  const receiverEntry = all.find(({ node }) => node.id === receiverId);
  if (!receiverEntry) return [];
  const receiver = receiverEntry.node;

  const suggestions: Suggestion[] = [];
  for (const iface of receiver.interfaces) {
    for (const fn of iface.functions) {
      const paramsStr = fn.params.map(p => `${p.name}: ${p.type}`).join(', ');
      const insertText = `${iface.id}:${fn.id}(${paramsStr})`;
      if (!partial || insertText.toLowerCase().startsWith(partial.toLowerCase())) {
        suggestions.push({
          label: insertText,
          insertText,
          replaceFrom: cursorPos - partial.length,
        });
      }
    }
  }
  for (const uc of receiver.useCases) {
    const insertText = `UseCase:${uc.id}`;
    if (!partial || insertText.toLowerCase().startsWith(partial.toLowerCase())) {
      suggestions.push({
        label: insertText,
        insertText,
        replaceFrom: cursorPos - partial.length,
      });
    }
  }
  return suggestions;
}

export function useAutoComplete(
  content: string,
  cursorPos: number,
  diagramType: DiagramType,
  ownerComp: ComponentNode | null,
  rootComponent: ComponentNode
) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  const currentKey = `${content}::${cursorPos}`;
  const dismiss = useCallback(
    () => setDismissedKey(currentKey),
    [currentKey]
  );

  const { suggestions, anchorLine } = useMemo(() => {
    const lineUpToCursor = getLineUpToCursor(content, cursorPos);
    const trimmedLine = lineUpToCursor.trimStart();
    const lineIdx = getLineIndex(content, cursorPos);

    // Context 3: sequence message function refs — sender->>receiver: <partial>
    if (diagramType === 'sequence-diagram') {
      const ctx3Match = /^(\w+)->>(\w+):\s*(.*)$/.exec(trimmedLine);
      if (ctx3Match) {
        const receiverId = ctx3Match[2];
        const partial = ctx3Match[3];
        return {
          suggestions: buildFunctionRefSuggestions(receiverId, partial, rootComponent, cursorPos),
          anchorLine: lineIdx,
        };
      }
    }

    // Context 2: entity name after actor/component/use case keyword
    const ctx2Match = /^(actor|component|use\s+case)\s+(.*)$/.exec(trimmedLine);
    if (ctx2Match) {
      const partial = ctx2Match[2];
      return {
        suggestions: buildEntityNameSuggestions(partial, ownerComp, rootComponent, cursorPos),
        anchorLine: lineIdx,
      };
    }

    // Context 1: line start — keyword prefix or declared entity IDs
    const partial = trimmedLine;
    if (partial === '') {
      return { suggestions: [], anchorLine: lineIdx };
    }

    const matchingKeywords = KEYWORDS.filter(
      k => k.startsWith(partial.toLowerCase()) && k !== partial.toLowerCase()
    );
    if (matchingKeywords.length > 0) {
      const replaceFrom = cursorPos - partial.length;
      return {
        suggestions: matchingKeywords.map(k => ({
          label: k,
          insertText: k,
          replaceFrom,
        })),
        anchorLine: lineIdx,
      };
    }

    // Fallback at line start: declared entity IDs from content
    const ids = getDeclaredIds(content).filter(
      id => id.startsWith(partial) && id !== partial
    );
    if (ids.length > 0) {
      const replaceFrom = cursorPos - partial.length;
      return {
        suggestions: ids.map(id => ({ label: id, insertText: id, replaceFrom })),
        anchorLine: lineIdx,
      };
    }

    return { suggestions: [], anchorLine: lineIdx };
  }, [content, cursorPos, diagramType, ownerComp, rootComponent]);

  const isDismissed = dismissedKey === currentKey;
  const finalSuggestions = isDismissed ? [] : suggestions;

  return {
    suggestions: finalSuggestions,
    selectedIndex: Math.min(selectedIndex, Math.max(0, finalSuggestions.length - 1)),
    setSelectedIndex,
    anchorLine,
    dismiss,
  };
}
