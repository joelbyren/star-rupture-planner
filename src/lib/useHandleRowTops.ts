import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useUpdateNodeInternals } from '@xyflow/react';

/**
 * Measure the vertical centers of a node's handle rows so each <Handle>'s `top`
 * lines up with its label row.
 *
 * Row heights/spacing vary per theme (fonts, letter-spacing, header sizing), so
 * `deps` must include anything that can reshuffle the rows (row count, theme,
 * displayed item) — otherwise handles stay pinned to whichever layout was
 * active when the node last measured.
 *
 * React Flow caches handle bounding boxes for edge routing and only refreshes
 * them via its own ResizeObserver on the node's outer box — a same-size
 * reshuffle of handle positions needs an explicit updateNodeInternals nudge or
 * edges keep pointing at the stale spot.
 */
export function useHandleRowTops(nodeId: string, deps: unknown[]) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const [tops, setTops] = useState<number[]>([]);
  const updateNodeInternals = useUpdateNodeInternals();
  /* eslint-disable react-hooks/exhaustive-deps -- the dependency list is supplied by the caller */
  useLayoutEffect(() => {
    setTops(refs.current.map(el => (el ? el.offsetTop + el.offsetHeight / 2 : 0)));
  }, deps);
  /* eslint-enable react-hooks/exhaustive-deps */
  useEffect(() => {
    updateNodeInternals(nodeId);
  }, [tops, updateNodeInternals, nodeId]);
  return { refs, tops };
}
