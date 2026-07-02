import { useMemo } from 'react';
import { usePlanStore } from '../store/planStore.ts';
import { useUiStore } from '../store/uiStore.ts';

/**
 * Map of nodeId -> the set of node ids it shares an edge with (either
 * direction). Recomputed only when the edges array reference changes
 * (topology change), not on every hover.
 */
export function useNeighbors(): Map<string, Set<string>> {
  const edges = usePlanStore(s => s.edges);
  return useMemo(() => {
    const map = new Map<string, Set<string>>();
    const link = (a: string, b: string) => {
      let set = map.get(a);
      if (!set) { set = new Set(); map.set(a, set); }
      set.add(b);
    };
    for (const e of edges) {
      link(e.source, e.target);
      link(e.target, e.source);
    }
    return map;
  }, [edges]);
}

/**
 * True when some OTHER node is hovered and this node is neither the hovered
 * node nor adjacent to it. Boolean selector on uiStore keeps re-renders to
 * only the nodes whose dimmed state actually flips.
 */
export function useIsNodeDimmed(nodeId: string): boolean {
  const neighbors = useNeighbors();
  return useUiStore(s =>
    s.hoveredNodeId !== null &&
    s.hoveredNodeId !== nodeId &&
    !neighbors.get(s.hoveredNodeId)?.has(nodeId),
  );
}
