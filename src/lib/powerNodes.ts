import type { PowerNode } from '../engine/power.ts';
import { isFactoryNode, isItemNode, type AnyNode } from '../store/planStore.ts';

/** Adapts store nodes into the engine's minimal structural shape for graphPower. */
export function toPowerNodes(nodes: AnyNode[]): PowerNode[] {
  const result: PowerNode[] = [];
  for (const n of nodes) {
    if (isFactoryNode(n)) result.push({ kind: 'factory', inner: toPowerNodes(n.data.inner.nodes) });
    else if (isItemNode(n) && n.data.isRaw) {
      result.push({ kind: 'raw', itemId: n.data.itemId, extractorVersion: n.data.rawConfig?.extractorVersion });
    } else if (isItemNode(n)) {
      result.push({ kind: 'production', recipeId: n.data.recipeId, buildingCount: n.data.balance?.buildingCount });
    }
  }
  return result;
}
