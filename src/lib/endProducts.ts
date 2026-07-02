import type { Edge } from '@xyflow/react';

/** End products = non-raw item nodes with no outgoing edge — same rule at root and inside factories. */
export function computeEndProductIds(
  nodes: { id: string; type?: string; data: Record<string, unknown> & { isRaw?: boolean } }[],
  edges: Edge[],
): Set<string> {
  const hasOutgoing = new Set(edges.map(e => e.source));
  const ids = new Set<string>();
  for (const n of nodes) {
    if (n.type === 'itemNode' && !n.data.isRaw && !hasOutgoing.has(n.id)) ids.add(n.id);
  }
  return ids;
}
