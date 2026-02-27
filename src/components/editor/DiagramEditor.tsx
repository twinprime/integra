import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentNode } from '../../types';
import { DiagramSpecPreview } from './DiagramSpecPreview';
import { useAutoComplete } from './useAutoComplete';

interface Props {
  node: ComponentNode;
  ownerComp: ComponentNode | null;
  rootComponent: ComponentNode;
  onChange: (spec: string) => void;
}

const LINE_HEIGHT = 21; // px — 14px font × 1.5 line-height
const HISTORY_DEBOUNCE_MS = 500;

export const DiagramEditor: React.FC<Props> = ({
  node,
  ownerComp,
  rootComponent,
  onChange,
}) => {
  const [cursorPos, setCursorPos] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Undo/redo history
  const historyRef = useRef<string[]>([node.diagramSpec]);
  const historyIndexRef = useRef<number>(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset history when node changes
  useEffect(() => {
    historyRef.current = [node.diagramSpec];
    historyIndexRef.current = 0;
  }, [node.uuid]); // eslint-disable-line react-hooks/exhaustive-deps

  const { suggestions, selectedIndex, setSelectedIndex, anchorLine, dismiss } =
    useAutoComplete(
      node.diagramSpec,
      cursorPos,
      node.diagramType,
      ownerComp,
      rootComponent
    );

  const hasSuggestions = suggestions.length > 0;

  const applySuggestion = useCallback(
    (index: number) => {
      const suggestion = suggestions[index];
      if (!suggestion) return;
      const textarea = textareaRef.current;
      if (!textarea) return;
      const newContent =
        node.diagramSpec.slice(0, suggestion.replaceFrom) +
        suggestion.insertText +
        node.diagramSpec.slice(cursorPos);
      onChange(newContent);
      const newCursor = suggestion.replaceFrom + suggestion.insertText.length;
      // Defer cursor placement until after React re-render
      setTimeout(() => {
        textarea.setSelectionRange(newCursor, newCursor);
        setCursorPos(newCursor);
      }, 0);
      dismiss();
    },
    [suggestions, node.diagramSpec, cursorPos, onChange, dismiss]
  );

  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      onChange(newValue);

      // Debounced history push
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        const history = historyRef.current;
        const idx = historyIndexRef.current;
        const truncated = history.slice(0, idx + 1);
        truncated.push(newValue);
        historyRef.current = truncated;
        historyIndexRef.current = truncated.length - 1;
      }, HISTORY_DEBOUNCE_MS);
    },
    [onChange]
  );

  const handleSelect = useCallback(
    (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
      setCursorPos((e.target as HTMLTextAreaElement).selectionStart);
    },
    []
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // When suggestions are open, intercept navigation keys
      if (hasSuggestions) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex(i => Math.max(i - 1, 0));
          return;
        }
        if (e.key === 'Tab' || e.key === 'Enter') {
          e.preventDefault();
          applySuggestion(selectedIndex);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          dismiss();
          return;
        }
      }

      // Undo/redo
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const ctrl = isMac ? e.metaKey : e.ctrlKey;
      if (ctrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        const idx = historyIndexRef.current;
        if (idx > 0) {
          historyIndexRef.current = idx - 1;
          onChange(historyRef.current[historyIndexRef.current]);
        }
        return;
      }
      if (ctrl && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        const idx = historyIndexRef.current;
        if (idx < historyRef.current.length - 1) {
          historyIndexRef.current = idx + 1;
          onChange(historyRef.current[historyIndexRef.current]);
        }
        return;
      }
    },
    [hasSuggestions, suggestions, selectedIndex, setSelectedIndex, applySuggestion, dismiss, onChange]
  );

  const [scrollTop, setScrollTop] = useState(0);
  const dropdownTop = anchorLine * LINE_HEIGHT - scrollTop + LINE_HEIGHT + 8;

  const syncScroll = useCallback(() => {
    if (textareaRef.current && backdropRef.current) {
      const top = textareaRef.current.scrollTop;
      backdropRef.current.scrollTop = top;
      setScrollTop(top);
    }
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Syntax-highlighting backdrop */}
      <div
        ref={backdropRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: 'hidden',
          background: '#1e1e1e',
          borderRadius: 4,
          pointerEvents: 'none',
        }}
      >
        <DiagramSpecPreview content={node.diagramSpec} ownerComp={ownerComp} />
      </div>

      {/* Transparent textarea overlay */}
      <textarea
        ref={textareaRef}
        value={node.diagramSpec}
        onChange={handleContentChange}
        onSelect={handleSelect}
        onKeyDown={handleKeyDown}
        onScroll={syncScroll}
        spellCheck={false}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
          resize: 'none',
          background: 'transparent',
          color: 'transparent',
          caretColor: '#fff',
          fontFamily: 'monospace',
          fontSize: 14,
          lineHeight: '1.5',
          padding: '8px',
          border: 'none',
          outline: 'none',
          overflow: 'auto',
          boxSizing: 'border-box',
        }}
      />

      {/* Autocomplete dropdown */}
      {hasSuggestions && (
        <div
          style={{
            position: 'absolute',
            top: dropdownTop,
            left: 8,
            background: '#252526',
            border: '1px solid #454545',
            borderRadius: 4,
            zIndex: 10,
            minWidth: 220,
            maxHeight: 180,
            overflowY: 'auto',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          {suggestions.map((s, i) => (
            <div
              key={s.label}
              onClick={() => applySuggestion(i)}
              style={{
                padding: '4px 12px',
                cursor: 'pointer',
                background: i === selectedIndex ? '#094771' : 'transparent',
                color: '#d4d4d4',
                fontFamily: 'monospace',
                fontSize: 13,
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              {s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
