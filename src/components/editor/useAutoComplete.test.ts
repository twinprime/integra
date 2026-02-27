import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoComplete } from './useAutoComplete';
import type { ComponentNode } from '../../types';

function makeNode(overrides: Partial<ComponentNode> = {}): ComponentNode {
  return {
    uuid: 'node-1',
    id: 'root',
    name: 'System',
    type: 'root',
    children: [],
    interfaces: [],
    useCases: [],
    diagramSpec: '',
    diagramType: 'sequence-diagram',
    ...overrides,
  };
}

const rootWithChildren: ComponentNode = {
  uuid: 'root-uuid',
  id: 'root',
  name: 'System',
  type: 'root',
  children: [
    {
      uuid: 'child-1-uuid',
      id: 'orderSvc',
      name: 'OrderService',
      type: 'component',
      children: [],
      interfaces: [
        {
          id: 'iOrderApi',
          name: 'OrderApi',
          functions: [
            { id: 'createOrder', name: 'createOrder', params: [{ name: 'req', type: 'OrderRequest' }] },
            { id: 'getOrder', name: 'getOrder', params: [{ name: 'id', type: 'string' }] },
          ],
        },
      ],
      useCases: [{ id: 'uc1', name: 'Place Order' }],
      diagramSpec: '',
      diagramType: 'sequence-diagram',
    },
    {
      uuid: 'child-2-uuid',
      id: 'userSvc',
      name: 'UserService',
      type: 'component',
      children: [],
      interfaces: [],
      useCases: [],
      diagramSpec: '',
      diagramType: 'sequence-diagram',
    },
  ],
  interfaces: [],
  useCases: [],
  diagramSpec: '',
  diagramType: 'sequence-diagram',
};

describe('useAutoComplete', () => {
  describe('Context 1 — line start keyword suggestions', () => {
    it('suggests actor when partial is "ac"', () => {
      const content = 'ac';
      const { result } = renderHook(() =>
        useAutoComplete(content, content.length, 'sequence-diagram', null, makeNode())
      );
      expect(result.current.suggestions.map(s => s.label)).toContain('actor');
    });

    it('suggests component when partial is "co"', () => {
      const content = 'co';
      const { result } = renderHook(() =>
        useAutoComplete(content, content.length, 'sequence-diagram', null, makeNode())
      );
      expect(result.current.suggestions.map(s => s.label)).toContain('component');
    });

    it('suggests use case when partial is "use"', () => {
      const content = 'use';
      const { result } = renderHook(() =>
        useAutoComplete(content, content.length, 'use-case-diagram', null, makeNode())
      );
      expect(result.current.suggestions.map(s => s.label)).toContain('use case');
    });

    it('does not suggest keywords already fully typed', () => {
      const content = 'actor';
      const { result } = renderHook(() =>
        useAutoComplete(content, content.length, 'sequence-diagram', null, makeNode())
      );
      const labels = result.current.suggestions.map(s => s.label);
      expect(labels).not.toContain('actor');
    });

    it('returns empty suggestions for empty line', () => {
      const { result } = renderHook(() =>
        useAutoComplete('', 0, 'sequence-diagram', null, makeNode())
      );
      expect(result.current.suggestions).toHaveLength(0);
    });
  });

  describe('Context 1 — declared entity ID fallback', () => {
    it('suggests declared entity IDs when partial is not a keyword prefix', () => {
      // 'sy' is not a prefix of any keyword (actor/component/use case)
      const content = 'actor "User" as usr\ncomponent "System" as sys\nsy';
      const { result } = renderHook(() =>
        useAutoComplete(content, content.length, 'sequence-diagram', null, makeNode())
      );
      const labels = result.current.suggestions.map(s => s.label);
      expect(labels).toContain('sys');
    });

    it('filters declared IDs by partial', () => {
      const content = 'actor "User" as usr\ncomponent "System" as sys\nsy';
      const { result } = renderHook(() =>
        useAutoComplete(content, content.length, 'sequence-diagram', null, makeNode())
      );
      const labels = result.current.suggestions.map(s => s.label);
      expect(labels).toContain('sys');
      expect(labels).not.toContain('usr');
    });
  });

  describe('Context 2 — entity name suggestions', () => {
    it('suggests entity names after "actor " prefix', () => {
      const content = 'actor ';
      const { result } = renderHook(() =>
        useAutoComplete(content, content.length, 'sequence-diagram', null, rootWithChildren)
      );
      const labels = result.current.suggestions.map(s => s.label);
      expect(labels.some(l => l.includes('OrderService'))).toBe(true);
    });

    it('suggests entity names after "component " prefix', () => {
      const content = 'component ';
      const { result } = renderHook(() =>
        useAutoComplete(content, content.length, 'sequence-diagram', null, rootWithChildren)
      );
      const labels = result.current.suggestions.map(s => s.label);
      expect(labels.some(l => l.includes('UserService'))).toBe(true);
    });

    it('filters entity names by partial', () => {
      const content = 'component "Order';
      const { result } = renderHook(() =>
        useAutoComplete(content, content.length, 'sequence-diagram', null, rootWithChildren)
      );
      const labels = result.current.suggestions.map(s => s.label);
      expect(labels.some(l => l.includes('OrderService'))).toBe(true);
      expect(labels.some(l => l.includes('UserService'))).toBe(false);
    });

    it('suggests local entities as "Name" as id (without from clause)', () => {
      const content = 'component ';
      const { result } = renderHook(() =>
        useAutoComplete(content, content.length, 'sequence-diagram', rootWithChildren, rootWithChildren)
      );
      const labels = result.current.suggestions.map(s => s.label);
      // Children of root should be local suggestions (no 'from')
      const localSuggestion = labels.find(l => l.includes('OrderService') && !l.includes('from'));
      expect(localSuggestion).toBeDefined();
    });

    it('suggests cross-component entities with from clause', () => {
      // Simulate a non-root owner so that children of root are cross-component
      const deepOwner = makeNode({ uuid: 'child-1-uuid', id: 'orderSvc', type: 'component' });
      const content = 'component ';
      const { result } = renderHook(() =>
        useAutoComplete(content, content.length, 'sequence-diagram', deepOwner, rootWithChildren)
      );
      const labels = result.current.suggestions.map(s => s.label);
      // UserService is a sibling of deepOwner → cross-component suggestion
      const crossSuggestion = labels.find(l => l.includes('UserService') && l.includes('from'));
      expect(crossSuggestion).toBeDefined();
    });
  });

  describe('Context 3 — function reference suggestions (sequence only)', () => {
    it('suggests interface functions after sender->>receiver: pattern', () => {
      const content = 'client->>orderSvc: ';
      const { result } = renderHook(() =>
        useAutoComplete(content, content.length, 'sequence-diagram', null, rootWithChildren)
      );
      const labels = result.current.suggestions.map(s => s.label);
      expect(labels.some(l => l.includes('createOrder'))).toBe(true);
      expect(labels.some(l => l.includes('getOrder'))).toBe(true);
    });

    it('suggests use case references after sender->>receiver: pattern', () => {
      const content = 'client->>orderSvc: ';
      const { result } = renderHook(() =>
        useAutoComplete(content, content.length, 'sequence-diagram', null, rootWithChildren)
      );
      const labels = result.current.suggestions.map(s => s.label);
      expect(labels.some(l => l === 'UseCase:uc1')).toBe(true);
    });

    it('filters function refs by partial', () => {
      // Function ref format is interfaceId:funcId(params), so filter by interface prefix
      const content = 'client->>orderSvc: iOrderApi:get';
      const { result } = renderHook(() =>
        useAutoComplete(content, content.length, 'sequence-diagram', null, rootWithChildren)
      );
      const labels = result.current.suggestions.map(s => s.label);
      expect(labels.some(l => l.includes('getOrder'))).toBe(true);
      expect(labels.some(l => l.includes('createOrder'))).toBe(false);
    });

    it('returns empty suggestions for unknown receiver', () => {
      const content = 'client->>unknown: ';
      const { result } = renderHook(() =>
        useAutoComplete(content, content.length, 'sequence-diagram', null, rootWithChildren)
      );
      expect(result.current.suggestions).toHaveLength(0);
    });

    it('does not trigger context 3 for use-case-diagram', () => {
      const content = 'client->>orderSvc: ';
      const { result } = renderHook(() =>
        useAutoComplete(content, content.length, 'use-case-diagram', null, rootWithChildren)
      );
      // Should not use context 3 for use-case diagrams
      const labels = result.current.suggestions.map(s => s.label);
      expect(labels.some(l => l.includes('createOrder'))).toBe(false);
    });
  });

  describe('dismiss', () => {
    it('hides suggestions after dismiss()', () => {
      const content = 'ac';
      const { result } = renderHook(() =>
        useAutoComplete(content, content.length, 'sequence-diagram', null, makeNode())
      );
      expect(result.current.suggestions.length).toBeGreaterThan(0);
      act(() => {
        result.current.dismiss();
      });
      expect(result.current.suggestions).toHaveLength(0);
    });
  });

  describe('replaceFrom', () => {
    it('sets replaceFrom to start of partial for keyword suggestions', () => {
      const content = 'ac';
      const { result } = renderHook(() =>
        useAutoComplete(content, content.length, 'sequence-diagram', null, makeNode())
      );
      const actorSuggestion = result.current.suggestions.find(s => s.label === 'actor');
      expect(actorSuggestion).toBeDefined();
      expect(actorSuggestion!.replaceFrom).toBe(0); // cursorPos(2) - partial.length(2) = 0
    });

    it('sets replaceFrom correctly for entity name partial', () => {
      const content = 'component "Order';
      const { result } = renderHook(() =>
        useAutoComplete(content, content.length, 'sequence-diagram', null, rootWithChildren)
      );
      const suggestion = result.current.suggestions[0];
      // partial = '"Order', replaceFrom = cursorPos - partial.length
      expect(suggestion.replaceFrom).toBe(content.length - '"Order'.length);
    });
  });
});
