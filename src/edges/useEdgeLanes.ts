import { useMemo } from 'react';
import { usePlanStore } from '../store/planStore.ts';

export interface EdgeLane {
  /** 1-based index of this edge among all edges sharing the same source, in array order. */
  lane: number;
  /** Position of this edge within the full edges array — used for a small extra stagger. */
  i: number;
}

/**
 * Terminal's orthogonal traces stagger their vertical turn column per source
 * so parallel edges leaving the same node don't overlap. Memoized on the
 * edges array reference — recomputed only on topology change, not on hover.
 */
export function useEdgeLanes(): Map<string, EdgeLane> {
  const edges = usePlanStore(s => s.edges);
  return useMemo(() => {
    const seen = new Map<string, number>();
    const lanes = new Map<string, EdgeLane>();
    edges.forEach((e, i) => {
      const lane = (seen.get(e.source) ?? 0) + 1;
      seen.set(e.source, lane);
      lanes.set(e.id, { lane, i });
    });
    return lanes;
  }, [edges]);
}
