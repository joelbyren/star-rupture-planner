import { graphAt, isFactoryNode, isItemNode, type AnyNode, type InnerGraph } from '../store/planStore.ts';

/**
 * The node list a sidebar summary should total over: root nodes at the plan
 * root, or the currently-viewed factory's inner nodes. Callers recurse into
 * nested factories themselves (see `aggregateRawIntake`) — this only resolves
 * the starting point.
 */
export function selectScopedNodes(rootGraph: InnerGraph, viewPath: string[]): AnyNode[] {
  return graphAt(rootGraph, viewPath).nodes;
}

export interface RawIntakeRow {
  itemId: string;
  ratePerMin: number;
}

/** Sums raw-extractor output rates by item, recursing into nested factories. */
export function aggregateRawIntake(nodes: AnyNode[]): RawIntakeRow[] {
  const totals = new Map<string, number>();
  function walk(list: AnyNode[]) {
    for (const n of list) {
      if (isItemNode(n) && n.data.isRaw) {
        const rate = n.data.balance?.outputRatePerMin ?? 0;
        totals.set(n.data.itemId, (totals.get(n.data.itemId) ?? 0) + rate);
      } else if (isFactoryNode(n)) {
        walk(n.data.inner.nodes);
      }
    }
  }
  walk(nodes);
  return [...totals.entries()]
    .map(([itemId, ratePerMin]) => ({ itemId, ratePerMin }))
    .sort((a, b) => b.ratePerMin - a.ratePerMin);
}
