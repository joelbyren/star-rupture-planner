import { useCallback, useEffect, type RefObject } from 'react';
import { useOnViewportChange, useReactFlow } from '@xyflow/react';
import { usePlanStore, computePinnedPortPositions } from '../store/planStore.ts';

/** Screen-px gap between the canvas edge and a pinned port node. */
const EDGE_PAD_PX = 24;

/**
 * Keeps a factory's synthesized input/output port nodes pinned to the middle
 * of the left/right screen edges, regardless of pan/zoom. Re-derives their
 * flow positions from the viewport instead of moving the viewport to them.
 *
 * Any structural change (adding a node, connecting an edge, ...) re-projects
 * the graph and resynthesizes port nodes at their unpinned default position,
 * so `nodes` itself — not just port count — must trigger a reposition.
 * `setPortPositions` is a no-op when nothing actually moves, which keeps this
 * from looping: a reposition after a structural change updates `nodes` once,
 * the effect re-fires, recomputes the same target, and settles.
 */
export function usePinnedPorts(wrapperRef: RefObject<HTMLElement | null>) {
  const { screenToFlowPosition } = useReactFlow();
  const viewPath = usePlanStore(s => s.viewPath);
  const layoutTick = usePlanStore(s => s.layoutTick);
  const nodes = usePlanStore(s => s.nodes);
  const setPortPositions = usePlanStore(s => s.setPortPositions);

  const reposition = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const current = usePlanStore.getState().nodes;
    const inputIds = current.filter(n => n.type === 'inputPort').map(n => n.id);
    const outputIds = current.filter(n => n.type === 'outputPort').map(n => n.id);
    if (inputIds.length === 0 && outputIds.length === 0) return;

    const rect = el.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const leftFlow = screenToFlowPosition({ x: rect.left + EDGE_PAD_PX, y: midY });
    const rightFlow = screenToFlowPosition({ x: rect.right - EDGE_PAD_PX, y: midY });
    setPortPositions(computePinnedPortPositions(inputIds, outputIds, leftFlow, rightFlow));
  }, [screenToFlowPosition, setPortPositions, wrapperRef]);

  useOnViewportChange({ onChange: reposition });

  useEffect(() => {
    reposition();
  }, [viewPath, nodes, layoutTick, reposition]);

  // A ResizeObserver (rather than window resize) catches layout changes that
  // don't resize the window itself — e.g. toggling the sidebar.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new ResizeObserver(reposition);
    observer.observe(el);
    return () => observer.disconnect();
  }, [reposition, wrapperRef]);
}
