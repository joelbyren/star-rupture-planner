import { getBezierPath } from '@xyflow/react';
import type { ThemedEdgeRenderProps } from './ThemedEdge.tsx';

/** Holotable: static cyan base + a marching-dash flow overlay, speed scaled by throughput. */
export function HoloEdge({
  sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, rate, isHot, isDimmed, selected,
}: ThemedEdgeRenderProps) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  // Higher throughput = faster dashes; clamp to a sane range.
  const duration = Math.max(1.1, 4.6 - Math.min(rate ?? 0, 200) / 200 * 3.2);

  const cls = ['sr-edge', 'holo-edge', isHot ? 'sr-edge--hot' : '', isDimmed ? 'sr-edge--dim' : ''].filter(Boolean).join(' ');

  return (
    <g className={cls}>
      {selected && <path className="sr-edge-selection" d={path} />}
      <path className="holo-edge-base" d={path} />
      <path className="holo-edge-flow" d={path} style={{ animationDuration: `${duration.toFixed(2)}s` }} />
      <path d={path} className="react-flow__edge-interaction" fill="none" strokeWidth={16} stroke="transparent" />
      {/* Base/flow are dim at idle by design — without a permanent marker at
          each end (Blueprint/Terminal both have one), the now-hidden handle
          left nothing anchoring the line to the node's edge. */}
      <circle className="holo-edge-dot" cx={sourceX} cy={sourceY} r={2} />
      <circle className="holo-edge-dot" cx={targetX} cy={targetY} r={2} />
      {isHot && rate != null && (
        <text className="holo-edge-label" x={labelX} y={labelY - 6}>
          {rate.toFixed(1)}/min
        </text>
      )}
    </g>
  );
}
