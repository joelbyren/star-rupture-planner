import { getBezierPath } from '@xyflow/react';
import { usePlanStore } from '../store/planStore.ts';
import type { ThemedEdgeRenderProps } from './ThemedEdge.tsx';

/**
 * Graphite: a quiet curved stroke with small round tips at each end. Edges
 * feeding the target node carry the one ember tint; the hover-revealed rate
 * label and brightening are handled in CSS via the shared hot/dim classes.
 */
export function GraphiteEdge({
  sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, target, rate, isHot, isDimmed, selected,
}: ThemedEdgeRenderProps) {
  const isToTarget = usePlanStore(s => {
    const t = s.nodes.find(n => n.id === target);
    return t?.type === 'itemNode' && !!t.data?.isEndProduct;
  });

  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  const cls = [
    'sr-edge', 'gr-edge',
    isToTarget ? 'gr-edge--target' : '',
    isHot ? 'sr-edge--hot' : '',
    isDimmed ? 'sr-edge--dim' : '',
  ].filter(Boolean).join(' ');

  return (
    <g className={cls}>
      {selected && <path className="sr-edge-selection" d={path} />}
      <path className="gr-edge-wire" d={path} />
      <path d={path} className="react-flow__edge-interaction" fill="none" strokeWidth={16} stroke="transparent" />
      <circle className="gr-edge-tip" cx={sourceX} cy={sourceY} r={2} />
      <circle className="gr-edge-tip" cx={targetX} cy={targetY} r={2} />
      {isHot && rate != null && (
        <text className="gr-edge-label" x={labelX} y={labelY - 6} textAnchor="middle">
          {rate.toFixed(1)}/min
        </text>
      )}
    </g>
  );
}
