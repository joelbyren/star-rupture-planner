import type { ThemedEdgeRenderProps } from './ThemedEdge.tsx';

/** Terminal: orthogonal Manhattan trace, per-source lane stagger, marching-ants overlay, pad rects at endpoints. */
export function TerminalEdge({
  sourceX, sourceY, targetX, targetY, rate, isHot, isDimmed, lane, laneIndex,
}: ThemedEdgeRenderProps) {
  const gap = targetX - sourceX;
  const midX = gap > 24
    ? sourceX + Math.min(gap - 10, 22 + lane * 14 + (laneIndex % 3) * 4)
    : sourceX + gap / 2;
  const d = `M${sourceX} ${sourceY} H${midX} V${targetY} H${targetX}`;

  const cls = ['sr-edge', 'term-edge', isHot ? 'sr-edge--hot' : '', isDimmed ? 'sr-edge--dim' : ''].filter(Boolean).join(' ');
  const labelX = midX;
  const labelY = (sourceY + targetY) / 2;

  return (
    <g className={cls}>
      <path className="term-edge-base" d={d} />
      <path className="term-edge-flow" d={d} />
      <path d={d} className="react-flow__edge-interaction" fill="none" strokeWidth={16} stroke="transparent" />
      <rect className="term-edge-pad" x={sourceX - 2} y={sourceY - 3} width={4} height={6} />
      <rect className="term-edge-pad" x={targetX - 2} y={targetY - 3} width={4} height={6} />
      {isHot && rate != null && (
        <text className="term-edge-label" x={labelX + 4} y={labelY - 5}>
          {rate.toFixed(1)}/MIN
        </text>
      )}
    </g>
  );
}
