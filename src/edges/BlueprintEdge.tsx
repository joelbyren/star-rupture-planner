import { getBezierPath } from '@xyflow/react';
import type { ThemedEdgeRenderProps } from './ThemedEdge.tsx';

/** Blueprint: soft-white bezier, drafted chevron arrowhead, source stub-dot, hover-revealed rate label. */
export function BlueprintEdge({
  sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, rate, isHot, isDimmed,
}: ThemedEdgeRenderProps) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  const cls = ['sr-edge', 'bp-edge', isHot ? 'sr-edge--hot' : '', isDimmed ? 'sr-edge--dim' : ''].filter(Boolean).join(' ');

  return (
    <g className={cls}>
      <path className="bp-edge-wire" d={path} markerEnd="url(#bp-arrow)" />
      <path d={path} className="react-flow__edge-interaction" fill="none" strokeWidth={16} stroke="transparent" />
      <circle className="bp-edge-dot" cx={sourceX} cy={sourceY} r={2} />
      {isHot && rate != null && (
        <text className="bp-edge-label" x={labelX + 4} y={labelY - 7}>
          {rate.toFixed(1)}/min
        </text>
      )}
    </g>
  );
}
