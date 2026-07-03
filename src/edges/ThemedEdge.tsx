import type { EdgeProps } from '@xyflow/react';
import { usePlanStore, currentFactoryBalance } from '../store/planStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { useThemeStore } from '../store/themeStore.ts';
import { edgeRatePerMin } from '../lib/edgeRates.ts';
import { useEdgeLanes } from './useEdgeLanes.ts';
import { BlueprintEdge } from './BlueprintEdge.tsx';
import { HoloEdge } from './HoloEdge.tsx';
import { TerminalEdge } from './TerminalEdge.tsx';
import { GraphiteEdge } from './GraphiteEdge.tsx';

export interface ThemedEdgeRenderProps extends EdgeProps {
  rate: number | null;
  isHot: boolean;
  isDimmed: boolean;
  lane: number;
  laneIndex: number;
}

/** Dispatches to the active theme's edge renderer, with shared hover/rate/lane data resolved once. */
export function ThemedEdge(props: EdgeProps) {
  const theme = useThemeStore(s => s.theme);
  const nodes = usePlanStore(s => s.nodes);
  const viewedFactoryBalance = usePlanStore(s => currentFactoryBalance(s.rootGraph, s.viewPath));
  const isHot = useUiStore(s => s.hoveredNodeId !== null && (s.hoveredNodeId === props.source || s.hoveredNodeId === props.target));
  const isDimmed = useUiStore(s => s.hoveredNodeId !== null && s.hoveredNodeId !== props.source && s.hoveredNodeId !== props.target);
  const lanes = useEdgeLanes();

  const rate = edgeRatePerMin(
    { source: props.source, target: props.target, sourceHandle: props.sourceHandleId, targetHandle: props.targetHandleId },
    nodes,
    viewedFactoryBalance,
  );
  const lane = lanes.get(props.id);

  const renderProps: ThemedEdgeRenderProps = {
    ...props,
    rate,
    isHot,
    isDimmed,
    lane: lane?.lane ?? 1,
    laneIndex: lane?.i ?? 0,
  };

  if (theme === 'holotable') return <HoloEdge {...renderProps} />;
  if (theme === 'terminal') return <TerminalEdge {...renderProps} />;
  if (theme === 'graphite') return <GraphiteEdge {...renderProps} />;
  return <BlueprintEdge {...renderProps} />;
}
