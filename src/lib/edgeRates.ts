import type { FactoryBalanceResult } from '../engine/balanceGraph.ts';
import { isItemNode, isFactoryNode, portNodeId, type ViewNode, type PortNodeType } from '../store/planStore.ts';

interface RateEdge {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

/**
 * Rate (items/min) flowing through an edge, resolved from the consumer side
 * wherever possible. `viewedFactoryBalance` is the balance of the factory
 * whose inner graph is currently on screen (null at root) — needed to
 * resolve edges that terminate at one of ITS output ports.
 */
export function edgeRatePerMin(
  edge: RateEdge,
  nodes: ViewNode[],
  viewedFactoryBalance: FactoryBalanceResult | null,
): number | null {
  const target = nodes.find(n => n.id === edge.target);
  if (target) {
    if (isItemNode(target)) {
      const rate = target.data.balance?.inputs.find(i => i.itemId === edge.targetHandle)?.neededPerMin;
      if (rate != null) return rate;
    } else if (isFactoryNode(target)) {
      const rate = target.data.balance?.inputPorts.find(
        p => portNodeId('input', p.portId) === edge.targetHandle,
      )?.ratePerMin;
      if (rate != null) return rate;
    } else if (target.type === 'outputPort') {
      const portId = (target as PortNodeType).data.portId;
      const rate = viewedFactoryBalance?.outputPorts.find(p => p.portId === portId)?.ratePerMin;
      if (rate != null) return rate;
    }
  }

  const source = nodes.find(n => n.id === edge.source);
  if (source?.type === 'inputPort') {
    const portId = (source as PortNodeType).data.portId;
    const rate = viewedFactoryBalance?.inputPorts.find(p => p.portId === portId)?.ratePerMin;
    if (rate != null) return rate;
  }

  return null;
}
