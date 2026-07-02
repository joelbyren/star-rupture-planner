import type { PowerNode } from '../engine/power.ts';
import { isFactoryNode, type AnyNode } from '../store/planStore.ts';

/** Adapts store nodes into the engine's minimal structural shape for graphPower. */
export function toPowerNodes(nodes: AnyNode[]): PowerNode[] {
  return nodes.map(n => {
    if (isFactoryNode(n)) return { kind: 'factory', inner: toPowerNodes(n.data.inner.nodes) };
    if (n.data.isRaw) {
      return { kind: 'raw', itemId: n.data.itemId, extractorVersion: n.data.rawConfig?.extractorVersion };
    }
    return { kind: 'production', recipeId: n.data.recipeId, buildingCount: n.data.balance?.buildingCount };
  });
}
