import { create } from 'zustand';
import type { Node, Edge, Connection } from '@xyflow/react';
import type { RawResourceConfig, FactoryPort, Recipe } from '../engine/types.ts';
import { DEFAULT_RAW_CONFIG, calcSupplyRate } from '../engine/rawResources.ts';
import {
  balanceTree,
  type BalanceResult,
  type FactoryBalanceResult,
  type AnyBalanceResult,
  type BalanceNodeInput,
  type BalanceEdge,
  type FactoryDef,
  type FactoryPortDef,
} from '../engine/balanceGraph.ts';
import recipesJson from '../data/recipes.json';
import { computeEndProductIds } from '../lib/endProducts.ts';

const ALL_RECIPES = recipesJson as Recipe[];

// ------------------------------------------------------------------
// Node data shapes
// ------------------------------------------------------------------

/** A production node: a recipe build, or a raw extractor (recipeId null). */
export interface ItemNodeData {
  itemId: string;
  /** Chosen recipe/version; null = raw resource. Fixed at creation. */
  recipeId: string | null;
  isRaw: boolean;
  /** Extractor config for raw nodes (purity + version). */
  rawConfig?: RawResourceConfig;
  /** Max items/min this node may output (production nodes only; raw nodes are always capped at their supply rate). */
  hardLimitPerMin?: number;
  /** Latest balance result, recomputed on every structural change. */
  balance?: BalanceResult;
  /** True for non-raw item nodes with no outgoing edge in their own graph. Recomputed on every projection. */
  isEndProduct?: boolean;
  [key: string]: unknown;
}
export type ItemNodeType = Node<ItemNodeData, 'itemNode'>;

/** The currently-viewed graph (or a factory's inner graph). Real nodes only. */
export interface InnerGraph {
  nodes: AnyNode[];
  edges: Edge[];
}

/** A Factory (sub-factory): a container node with input/output ports and an inner graph. */
export interface FactoryNodeData {
  name: string;
  inputs: FactoryPort[];
  outputs: FactoryPort[];
  inner: InnerGraph;
  /** Latest demand-driven balance (per-port rates + scaled inner result). */
  balance?: FactoryBalanceResult;
  [key: string]: unknown;
}
export type FactoryNodeType = Node<FactoryNodeData, 'factoryNode'>;

/** Nodes that live in (and persist with) a graph. */
export type AnyNode = ItemNodeType | FactoryNodeType;

/** Synthesized, non-persisted port node rendered inside a factory's inner view. */
export interface PortNodeData {
  portId: string;
  side: 'input' | 'output';
  itemId: string | null;
  [key: string]: unknown;
}
export type PortNodeType = Node<PortNodeData, 'inputPort' | 'outputPort'>;

/** What <ReactFlow> renders: stored nodes, plus synthesized port nodes inside a factory. */
export type ViewNode = AnyNode | PortNodeType;

// ------------------------------------------------------------------
// State
// ------------------------------------------------------------------

/** Origin handle of an in-progress drag-to-create. */
export interface PendingConnect {
  fromNodeId: string;
  fromHandleId: string | null;
  fromHandleType: 'source' | 'target';
}

export interface PlanState {
  planId: string;
  planName: string;

  /** Authoritative root graph (the tree of all nodes/edges, factories nest via data.inner). */
  rootGraph: InnerGraph;
  /** Factory node ids from root to the graph currently on screen ([] = root). */
  viewPath: string[];

  /** Projection of the graph at viewPath (+ synthesized ports). Bound to <ReactFlow>. */
  nodes: ViewNode[];
  edges: Edge[];

  // Dialog / UI state
  addDialogOpen: boolean;
  addDialogPos: { x: number; y: number } | null;
  addDialogPrefillItemId: string | null;
  addDialogFilterInputItemId: string | null;
  pendingConnect: PendingConnect | null;
  editingNodeId: string | null;
  portDialogPortId: string | null;
  /** Bumped on layout/navigation so the canvas can re-fit the view. */
  layoutTick: number;

  // Canvas plumbing
  setNodes: (nodes: ViewNode[]) => void;
  setEdges: (edges: Edge[]) => void;
  /** Reposition synthesized port nodes only — no rootGraph write, no layoutTick bump. */
  setPortPositions: (positions: Record<string, { x: number; y: number }>) => void;
  loadPlan: (snapshot: PlanSnapshot) => void;

  // Builder actions (operate on the currently-viewed graph)
  addNode: (itemId: string, recipeId: string | null, position?: { x: number; y: number }) => void;
  addFactoryNode: (position?: { x: number; y: number }) => void;
  removeNode: (id: string) => void;
  setNodeRawConfig: (id: string, patch: Partial<RawResourceConfig>) => void;
  setNodeHardLimit: (id: string, limit: number | null) => void;
  connectNodes: (connection: Connection) => void;
  autoLayout: () => void;

  // Factory navigation + ports
  enterFactory: (id: string) => void;
  exitTo: (index: number) => void;
  addInputPort: (itemId?: string | null) => string;
  addOutputPort: (itemId?: string | null) => string;
  setPortItem: (portId: string, itemId: string | null) => void;
  removePort: (portId: string) => void;
  renameFactory: (name: string) => void;
  /** Delete the factory whose inner graph is currently open, then exit to its parent. */
  removeCurrentFactory: () => void;

  // Dialog actions
  openAddDialog: (opts?: {
    pos?: { x: number; y: number };
    prefillItemId?: string;
    filterInputItemId?: string;
    pending?: PendingConnect;
  }) => void;
  closeAddDialog: () => void;
  openConfig: (id: string) => void;
  closeConfig: () => void;
  openPortDialog: (portId: string) => void;
  closePortDialog: () => void;
}

/** Trimmed snapshot for import/export & IndexedDB. Inner graphs ride along inside node data. */
export interface PlanSnapshot {
  planId: string;
  planName: string;
  nodes: AnyNode[];
  edges: Edge[];
}

// ------------------------------------------------------------------
// Type guards
// ------------------------------------------------------------------

export function isItemNode(n: { type?: string }): n is ItemNodeType {
  return n.type === 'itemNode';
}
export function isFactoryNode(n: { type?: string }): n is FactoryNodeType {
  return n.type === 'factoryNode';
}
export function isPortNode(n: { type?: string }): boolean {
  return n.type === 'inputPort' || n.type === 'outputPort';
}

// ------------------------------------------------------------------
// Port geometry / ids
// ------------------------------------------------------------------

const PORT_X_LEFT = -360;
const PORT_X_RIGHT = 360;
const PORT_ROW_H = 90;
/** Matches the rendered width (w-[120px]) in PortNode.tsx. */
export const PORT_W = 120;

/** Stable synthesized port-node id (and outer handle id) for a port. */
export function portNodeId(side: 'input' | 'output', portId: string): string {
  return `port-${side === 'input' ? 'in' : 'out'}-${portId}`;
}

/**
 * Pure geometry for screen-pinning port nodes: given the port ids on each side
 * (in display order) and the two screen anchors already converted to flow
 * space, returns each port's flow position, stacked around its anchor with
 * flow-unit offsets so spacing scales consistently with node/zoom.
 */
export function computePinnedPortPositions(
  inputIds: string[],
  outputIds: string[],
  leftAnchorFlow: { x: number; y: number },
  rightAnchorFlow: { x: number; y: number },
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  inputIds.forEach((id, i) => {
    positions[id] = {
      x: leftAnchorFlow.x,
      y: leftAnchorFlow.y + (i - (inputIds.length - 1) / 2) * PORT_ROW_H,
    };
  });
  outputIds.forEach((id, i) => {
    positions[id] = {
      x: rightAnchorFlow.x - PORT_W,
      y: rightAnchorFlow.y + (i - (outputIds.length - 1) / 2) * PORT_ROW_H,
    };
  });
  return positions;
}

/**
 * Ports are screen-pinned reference points — always render above regular
 * nodes. React Flow adds +1000 (SELECTED_NODE_Z) to a *selected* node's
 * effective z-index, so this must clear that plus a margin.
 */
const PORT_Z_INDEX = 10000;

function synthesizePorts(data: FactoryNodeData): PortNodeType[] {
  const mk = (port: FactoryPort, side: 'input' | 'output', i: number, count: number): PortNodeType => ({
    id: portNodeId(side, port.id),
    type: side === 'input' ? 'inputPort' : 'outputPort',
    position: {
      x: side === 'input' ? PORT_X_LEFT : PORT_X_RIGHT,
      y: (i - (count - 1) / 2) * PORT_ROW_H,
    },
    zIndex: PORT_Z_INDEX,
    deletable: false,
    draggable: false,
    data: { portId: port.id, side, itemId: port.itemId },
  });
  return [
    ...data.inputs.map((p, i) => mk(p, 'input', i, data.inputs.length)),
    ...data.outputs.map((p, i) => mk(p, 'output', i, data.outputs.length)),
  ];
}

function stripPortNodes(nodes: ViewNode[]): AnyNode[] {
  return nodes.filter(n => !isPortNode(n)) as AnyNode[];
}

// ------------------------------------------------------------------
// Path read / write-back over the nested graph tree
// ------------------------------------------------------------------

function graphAt(root: InnerGraph, path: string[]): InnerGraph {
  let g = root;
  for (const id of path) {
    const fac = g.nodes.find(n => n.id === id && isFactoryNode(n)) as FactoryNodeType | undefined;
    if (!fac) return g; // broken path — best effort
    g = fac.data.inner;
  }
  return g;
}

function setGraphAt(root: InnerGraph, path: string[], next: InnerGraph): InnerGraph {
  if (path.length === 0) return next;
  const [head, ...rest] = path;
  return {
    ...root,
    nodes: root.nodes.map(n =>
      n.id === head && isFactoryNode(n)
        ? { ...n, data: { ...n.data, inner: setGraphAt(n.data.inner, rest, next) } }
        : n,
    ),
  };
}

/**
 * Strip the legacy `animated` flag from every edge, recursing into nested
 * factory inner graphs. Snapshots exported before ThemedEdge existed persist
 * `animated: true`; React Flow's own stylesheet still keys off that flag
 * (`.react-flow__edge.animated path { stroke-dasharray: 5; animation: ... }`),
 * which fights the per-theme dash/animation styling on every path in the edge.
 */
function stripLegacyAnimatedFlag(g: InnerGraph): InnerGraph {
  return {
    edges: g.edges.map(e => (e.animated ? { ...e, animated: undefined } : e)),
    nodes: g.nodes.map(n =>
      isFactoryNode(n) ? { ...n, data: { ...n.data, inner: stripLegacyAnimatedFlag(n.data.inner) } } : n,
    ),
  };
}

/** The factory node whose inner graph is currently being viewed (null at root). */
function currentFactory(root: InnerGraph, path: string[]): FactoryNodeType | null {
  if (path.length === 0) return null;
  const parent = graphAt(root, path.slice(0, -1));
  const fac = parent.nodes.find(n => n.id === path[path.length - 1] && isFactoryNode(n));
  return (fac as FactoryNodeType) ?? null;
}

/** The balance of the factory whose inner graph is currently being viewed (null at root). */
export function currentFactoryBalance(root: InnerGraph, path: string[]): FactoryBalanceResult | null {
  return currentFactory(root, path)?.data.balance ?? null;
}

/** Build what <ReactFlow> renders for a given path: stored nodes + synthesized ports. */
function annotateEndProducts(nodes: AnyNode[], edges: Edge[]): AnyNode[] {
  const endIds = computeEndProductIds(nodes, edges);
  return nodes.map(n =>
    isItemNode(n) ? { ...n, data: { ...n.data, isEndProduct: endIds.has(n.id) } } : n,
  );
}

function project(root: InnerGraph, path: string[]): { nodes: ViewNode[]; edges: Edge[] } {
  const g = graphAt(root, path);
  const annotated = annotateEndProducts(g.nodes, g.edges);
  if (path.length === 0) return { nodes: annotated, edges: g.edges };
  const fac = currentFactory(root, path);
  const ports = fac ? synthesizePorts(fac.data) : [];
  // Ports last: React Flow bumps a *selected* node's effective z by +1000
  // (SELECTED_NODE_Z), which ties our port zIndex — on a tie, later-in-array
  // wins, so ports must come after real nodes to stay on top even then.
  return { nodes: [...annotated, ...ports], edges: g.edges };
}

// ------------------------------------------------------------------
// Balance helpers — the whole tree is balanced top-down from the root so that
// each factory's inner graph is demand-driven by its parent (the externally
// demanded output rate), then written back into every nested node.
// ------------------------------------------------------------------

function toBalanceEdge(e: Edge): BalanceEdge {
  return { source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle };
}

/** Build the engine FactoryDef for a factory node (recursively for nested factories). */
function buildFactoryDef(fac: FactoryNodeType): FactoryDef {
  const inner = fac.data.inner;
  // Input ports are modeled as raw "input-port" nodes: their pulled supply = the requirement.
  const inputPortNodes: BalanceNodeInput[] = fac.data.inputs.map(p => ({
    id: portNodeId('input', p.id),
    itemId: p.itemId ?? '',
    recipeId: null,
  }));
  const innerNodes: BalanceNodeInput[] = [...inner.nodes.map(toBalanceNode), ...inputPortNodes];
  const innerEdges = inner.edges.map(toBalanceEdge);

  const outputs: FactoryPortDef[] = fac.data.outputs.map(p => {
    const handleId = portNodeId('output', p.id);
    // The inner node feeding this output port is anchored at the port's external demand.
    const producer = inner.edges.find(e => e.target === handleId)?.source;
    return { portId: p.id, itemId: p.itemId, handleId, innerNodeId: producer };
  });
  const inputs: FactoryPortDef[] = fac.data.inputs.map(p => ({
    portId: p.id,
    itemId: p.itemId,
    handleId: portNodeId('input', p.id),
    innerNodeId: portNodeId('input', p.id),
  }));
  return { inputs, outputs, inner: { nodes: innerNodes, edges: innerEdges } };
}

/** The node's effective hard limit: a raw node's physical supply rate always caps the network. */
function effectiveHardLimit(d: ItemNodeData): number | undefined {
  if (d.isRaw) return calcSupplyRate(d.itemId, d.rawConfig ?? DEFAULT_RAW_CONFIG);
  return typeof d.hardLimitPerMin === 'number' && d.hardLimitPerMin > 0 ? d.hardLimitPerMin : undefined;
}

function toBalanceNode(n: AnyNode): BalanceNodeInput {
  if (isFactoryNode(n)) {
    return { id: n.id, itemId: '', recipeId: null, kind: 'factory', factory: buildFactoryDef(n) };
  }
  return { id: n.id, itemId: n.data.itemId, recipeId: n.data.recipeId, hardLimit: effectiveHardLimit(n.data) };
}

/** Write balance results into every node, recursing into factory inner graphs. */
function writeBalance(g: InnerGraph, balance: Record<string, AnyBalanceResult>): InnerGraph {
  return {
    edges: g.edges,
    nodes: g.nodes.map(n => {
      const r = balance[n.id];
      if (isItemNode(n)) return { ...n, data: { ...n.data, balance: r as BalanceResult | undefined } };
      if (isFactoryNode(n)) {
        const fr = r as FactoryBalanceResult | undefined;
        return {
          ...n,
          data: { ...n.data, balance: fr, inner: writeBalance(n.data.inner, fr?.inner ?? {}) },
        };
      }
      return n;
    }),
  };
}

/** Balance the entire root tree (demand-driven through every factory) and write results back. */
function rebalanceRoot(g: InnerGraph): InnerGraph {
  const balance = balanceTree(g.nodes.map(toBalanceNode), g.edges.map(toBalanceEdge), ALL_RECIPES);
  return writeBalance(g, balance);
}

// ------------------------------------------------------------------
// Edge building / validation (handles item, factory and port endpoints)
// ------------------------------------------------------------------

/** The item a source handle emits. */
function sourceItemId(node: ViewNode, sourceHandle: string | null | undefined): string | null {
  if (node.type === 'itemNode') return (node as ItemNodeType).data.itemId;
  if (node.type === 'inputPort') return (node as PortNodeType).data.itemId; // inner input port is a SOURCE
  if (node.type === 'factoryNode') {
    const fac = node as FactoryNodeType;
    return fac.data.outputs.find(p => portNodeId('output', p.id) === sourceHandle)?.itemId ?? null;
  }
  return null;
}

/** The item a target handle accepts. */
function targetItemId(node: ViewNode, targetHandle: string | null | undefined): string | null {
  if (node.type === 'itemNode') return targetHandle ?? null; // handle id == ingredient itemId
  if (node.type === 'outputPort') return (node as PortNodeType).data.itemId; // inner output port is a SINK
  if (node.type === 'factoryNode') {
    const fac = node as FactoryNodeType;
    return fac.data.inputs.find(p => portNodeId('input', p.id) === targetHandle)?.itemId ?? null;
  }
  return null;
}

/**
 * The concrete item flowing through a node's handle, resolved for either drag
 * direction. Works for item nodes (ingredient/output handles) and factory nodes
 * (input/output port handles). Used to seed the add-node dialog on drag-to-create.
 */
export function handleItemId(
  node: ViewNode,
  handleId: string | null | undefined,
  handleType: 'source' | 'target',
): string | null {
  return handleType === 'source' ? sourceItemId(node, handleId) : targetItemId(node, handleId);
}

/**
 * Validated producer→consumer edge. Rejected only when both endpoints resolve to
 * different concrete items (a null/UNSET side accepts anything).
 */
function buildEdge(
  nodes: ViewNode[],
  source: string,
  target: string,
  sourceHandle: string | null | undefined,
  targetHandle: string | null | undefined,
): Edge | null {
  const s = nodes.find(n => n.id === source);
  const t = nodes.find(n => n.id === target);
  if (!s || !t) return null;
  const si = sourceItemId(s, sourceHandle);
  const ti = targetItemId(t, targetHandle);
  if (si != null && ti != null && si !== ti) return null;
  return {
    id: `e-${source}-${target}-${sourceHandle ?? ''}-${targetHandle ?? si ?? ''}`,
    source,
    target,
    sourceHandle: sourceHandle ?? undefined,
    targetHandle: targetHandle ?? undefined,
  };
}

/** True if an edge still connects two existing, item-compatible handles. */
function edgeValid(nodes: ViewNode[], e: Edge): boolean {
  const s = nodes.find(n => n.id === e.source);
  const t = nodes.find(n => n.id === e.target);
  if (!s || !t) return false;
  const si = sourceItemId(s, e.sourceHandle);
  const ti = targetItemId(t, e.targetHandle);
  return !(si != null && ti != null && si !== ti);
}

/** Build the auto-connect edge for a drag-to-create against the origin handle. */
function buildPendingEdge(nodes: ViewNode[], newNodeId: string, pc: PendingConnect): Edge | null {
  if (pc.fromHandleType === 'target') {
    // Dragged off an input handle → the new node produces that ingredient for the origin.
    return buildEdge(nodes, newNodeId, pc.fromNodeId, undefined, pc.fromHandleId);
  }
  // Dragged off an output handle → the origin feeds an input of the new node.
  const origin = nodes.find(n => n.id === pc.fromNodeId);
  const originItem = origin ? sourceItemId(origin, pc.fromHandleId) : null;
  return buildEdge(nodes, pc.fromNodeId, newNodeId, pc.fromHandleId ?? undefined, originItem ?? undefined);
}

/** Highest zIndex among real nodes (so new nodes stack on top). */
function topZ(nodes: AnyNode[]): number {
  return nodes.reduce((max, n) => Math.max(max, n.zIndex ?? 0), 0);
}

/** Set a port's item by id across a factory's input/output ports. */
function applyPortItem(d: FactoryNodeData, portId: string, itemId: string | null): FactoryNodeData {
  const apply = (ports: FactoryPort[]) => ports.map(p => (p.id === portId ? { ...p, itemId } : p));
  return { ...d, inputs: apply(d.inputs), outputs: apply(d.outputs) };
}

/**
 * When a new edge touches an as-yet-unset factory port, the port inherits the
 * concrete item from the other endpoint: an input port (a SOURCE) takes the item
 * its consumer accepts; an output port (a SINK) takes the item its producer emits.
 * Returns the port to update, or null when nothing should be inherited.
 */
function portInheritFromEdge(
  nodes: ViewNode[],
  source: string,
  target: string,
  sourceHandle: string | null | undefined,
  targetHandle: string | null | undefined,
): { portId: string; itemId: string } | null {
  const s = nodes.find(n => n.id === source);
  const t = nodes.find(n => n.id === target);
  if (s && s.type === 'inputPort' && (s as PortNodeType).data.itemId == null) {
    const item = t ? targetItemId(t, targetHandle) : null;
    if (item != null) return { portId: (s as PortNodeType).data.portId, itemId: item };
  }
  if (t && t.type === 'outputPort' && (t as PortNodeType).data.itemId == null) {
    const item = s ? sourceItemId(s, sourceHandle) : null;
    if (item != null) return { portId: (t as PortNodeType).data.portId, itemId: item };
  }
  return null;
}

// ------------------------------------------------------------------
// Missing-input detection (per current view)
// ------------------------------------------------------------------

export interface MissingInput {
  nodeId: string;
  consumerItemId: string;
  itemId: string;
}

export function findMissingInputs(nodes: ViewNode[], edges: Edge[]): MissingInput[] {
  const recipeById = new Map(ALL_RECIPES.map(r => [r.id, r]));
  const missing: MissingInput[] = [];
  for (const n of nodes) {
    if (!isItemNode(n) || n.data.recipeId === null) continue;
    const recipe = recipeById.get(n.data.recipeId);
    if (!recipe) continue;
    for (const inp of recipe.inputs) {
      const fed = edges.some(e => e.target === n.id && e.targetHandle === inp.itemId);
      if (!fed) missing.push({ nodeId: n.id, consumerItemId: n.data.itemId, itemId: inp.itemId });
    }
  }
  return missing;
}

// ------------------------------------------------------------------
// Layered auto-layout (producer→consumer; raw on the left, products on the right)
// ------------------------------------------------------------------

const LAYOUT_COL_W = 240;
const LAYOUT_ROW_H = 120;

function layoutNodes(nodes: AnyNode[], edges: Edge[]): AnyNode[] {
  if (nodes.length === 0) return nodes;

  const idSet = new Set(nodes.map(n => n.id));
  const consumers = new Map<string, string[]>();
  const producers = new Map<string, string[]>();
  for (const n of nodes) { consumers.set(n.id, []); producers.set(n.id, []); }
  for (const e of edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
    consumers.get(e.source)!.push(e.target);
    producers.get(e.target)!.push(e.source);
  }

  const rank = new Map<string, number>();
  const visiting = new Set<string>();
  function computeRank(id: string): number {
    const cached = rank.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let r = 0;
    for (const c of consumers.get(id)!) r = Math.max(r, computeRank(c) + 1);
    visiting.delete(id);
    rank.set(id, r);
    return r;
  }
  for (const n of nodes) computeRank(n.id);

  const maxRank = Math.max(...rank.values());
  const layers: string[][] = Array.from({ length: maxRank + 1 }, () => []);
  for (const n of nodes) layers[rank.get(n.id)!].push(n.id);

  const order = new Map<string, number>();
  layers.forEach(layer => layer.forEach((id, i) => order.set(id, i)));
  for (let iter = 0; iter < 8; iter++) {
    for (const layer of layers) {
      const bary = new Map<string, number>();
      for (const id of layer) {
        const nb = [...producers.get(id)!, ...consumers.get(id)!];
        bary.set(id, nb.length === 0
          ? order.get(id)!
          : nb.reduce((s, x) => s + (order.get(x) ?? 0), 0) / nb.length);
      }
      layer.sort((a, b) => bary.get(a)! - bary.get(b)!);
      layer.forEach((id, i) => order.set(id, i));
    }
  }

  const pos = new Map<string, { x: number; y: number }>();
  layers.forEach((layer, rankVal) => {
    const x = (maxRank - rankVal) * LAYOUT_COL_W;
    layer.forEach((id, i) => pos.set(id, { x, y: (i - (layer.length - 1) / 2) * LAYOUT_ROW_H }));
  });

  return nodes.map(n => ({ ...n, position: pos.get(n.id) ?? n.position }));
}

// ------------------------------------------------------------------
// Store
// ------------------------------------------------------------------

const EMPTY: InnerGraph = { nodes: [], edges: [] };

export const usePlanStore = create<PlanState>((set, get) => {
  /** Apply a mutation to the currently-viewed graph, rebalance, write back, re-project. */
  function commitViewedGraph(mutate: (g: InnerGraph) => InnerGraph) {
    const { rootGraph, viewPath } = get();
    const mutated = mutate(graphAt(rootGraph, viewPath));
    const nextRoot = rebalanceRoot(setGraphAt(rootGraph, viewPath, mutated));
    const view = project(nextRoot, viewPath);
    set({ rootGraph: nextRoot, nodes: view.nodes, edges: view.edges });
  }

  /**
   * Mutate the data of the factory whose inner graph is being viewed; rebalance
   * inner; re-project. `refit` bumps layoutTick so the canvas re-fits — pass false
   * for changes that don't alter geometry (e.g. a rename).
   */
  function commitCurrentFactory(mutate: (d: FactoryNodeData) => FactoryNodeData, refit = true) {
    const { rootGraph, viewPath, layoutTick } = get();
    if (viewPath.length === 0) return;
    const facId = viewPath[viewPath.length - 1];
    const parentPath = viewPath.slice(0, -1);
    const parent = graphAt(rootGraph, parentPath);
    const nodes = parent.nodes.map(n =>
      n.id === facId && isFactoryNode(n) ? { ...n, data: mutate(n.data) } : n,
    );
    const nextRoot = rebalanceRoot(setGraphAt(rootGraph, parentPath, { ...parent, nodes }));
    const view = project(nextRoot, viewPath);
    set({ rootGraph: nextRoot, nodes: view.nodes, edges: view.edges, layoutTick: refit ? layoutTick + 1 : layoutTick });
  }

  function navigate(nextPath: string[]) {
    const { rootGraph, layoutTick } = get();
    const view = project(rootGraph, nextPath);
    set({
      viewPath: nextPath,
      nodes: view.nodes,
      edges: view.edges,
      layoutTick: layoutTick + 1,
      editingNodeId: null,
      portDialogPortId: null,
    });
  }

  return {
    planId: crypto.randomUUID(),
    planName: 'New Plan',
    rootGraph: EMPTY,
    viewPath: [],
    nodes: [],
    edges: [],

    addDialogOpen: false,
    addDialogPos: null,
    addDialogPrefillItemId: null,
    addDialogFilterInputItemId: null,
    pendingConnect: null,
    editingNodeId: null,
    portDialogPortId: null,
    layoutTick: 0,

    setNodes(incoming) {
      // onNodesChange fires dimension/position/selection updates — no topology change,
      // so just persist real-node positions and keep port nodes as-is (with their
      // measured dimensions). Re-synthesizing port nodes would lose measurements and
      // cause an infinite render loop.
      const { rootGraph, viewPath } = get();
      const real = stripPortNodes(incoming) as AnyNode[];
      const g = graphAt(rootGraph, viewPath);
      const nextRoot = setGraphAt(rootGraph, viewPath, { ...g, nodes: real });
      set({ rootGraph: nextRoot, nodes: incoming });
    },
    setEdges(edges) {
      commitViewedGraph(g => ({ ...g, edges }));
    },

    setPortPositions(positions) {
      // No-op (and no new `nodes` reference) when every targeted port is already
      // at its target position — lets callers re-derive positions on every render
      // without triggering an effect/render loop.
      set(state => {
        let changed = false;
        const nextNodes = state.nodes.map(n => {
          const p = positions[n.id];
          if (!p || (n.position.x === p.x && n.position.y === p.y)) return n;
          changed = true;
          return { ...n, position: p };
        });
        return changed ? { nodes: nextNodes } : {};
      });
    },

    loadPlan(snapshot) {
      const root = rebalanceRoot(stripLegacyAnimatedFlag({ nodes: snapshot.nodes, edges: snapshot.edges }));
      set({
        planId: snapshot.planId,
        planName: snapshot.planName,
        rootGraph: root,
        viewPath: [],
        nodes: root.nodes,
        edges: root.edges,
        layoutTick: get().layoutTick + 1,
      });
    },

    addNode(itemId, recipeId, position) {
      const { pendingConnect, rootGraph, viewPath } = get();
      const view = project(rootGraph, viewPath);
      const viewed = graphAt(rootGraph, viewPath);
      const isRaw = recipeId === null;
      const count = viewed.nodes.length;
      const node: ItemNodeType = {
        id: crypto.randomUUID(),
        type: 'itemNode',
        position: position ?? { x: 40 + count * 28, y: 40 + count * 28 },
        zIndex: topZ(viewed.nodes) + 1,
        data: { itemId, recipeId, isRaw, rawConfig: isRaw ? DEFAULT_RAW_CONFIG : undefined },
      };
      const pendingEdge = pendingConnect
        ? buildPendingEdge([...view.nodes, node], node.id, pendingConnect)
        : null;
      commitViewedGraph(g => ({
        nodes: [...g.nodes, node],
        edges: pendingEdge ? [...g.edges.filter(e => e.id !== pendingEdge.id), pendingEdge] : g.edges,
      }));
      set({
        addDialogOpen: false,
        addDialogPos: null,
        addDialogPrefillItemId: null,
        addDialogFilterInputItemId: null,
        pendingConnect: null,
      });
    },

    addFactoryNode(position) {
      const { pendingConnect, rootGraph, viewPath } = get();
      const view = project(rootGraph, viewPath);
      const viewed = graphAt(rootGraph, viewPath);

      const inputs: FactoryPort[] = [];
      const outputs: FactoryPort[] = [];
      let seed: { side: 'input' | 'output'; portId: string } | null = null;
      if (pendingConnect) {
        if (pendingConnect.fromHandleType === 'source') {
          // Origin produces something → factory consumes it: seed one INPUT port.
          const origin = view.nodes.find(n => n.id === pendingConnect.fromNodeId);
          const itemId = origin ? sourceItemId(origin, pendingConnect.fromHandleId) : null;
          const port = { id: crypto.randomUUID(), itemId };
          inputs.push(port);
          seed = { side: 'input', portId: port.id };
        } else {
          // Dragged off an input handle (ingredient itemId) → factory produces it: seed one OUTPUT port.
          const port = { id: crypto.randomUUID(), itemId: pendingConnect.fromHandleId ?? null };
          outputs.push(port);
          seed = { side: 'output', portId: port.id };
        }
      }

      const count = viewed.nodes.length;
      const node: FactoryNodeType = {
        id: crypto.randomUUID(),
        type: 'factoryNode',
        position: position ?? { x: 40 + count * 28, y: 40 + count * 28 },
        zIndex: topZ(viewed.nodes) + 1,
        data: { name: 'Factory', inputs, outputs, inner: { nodes: [], edges: [] } },
      };

      let pendingEdge: Edge | null = null;
      if (pendingConnect && seed) {
        const all = [...view.nodes, node];
        pendingEdge = seed.side === 'input'
          // origin → factory input port
          ? buildEdge(all, pendingConnect.fromNodeId, node.id, pendingConnect.fromHandleId ?? undefined, portNodeId('input', seed.portId))
          // factory output port → origin input
          : buildEdge(all, node.id, pendingConnect.fromNodeId, portNodeId('output', seed.portId), pendingConnect.fromHandleId);
      }

      commitViewedGraph(g => ({
        nodes: [...g.nodes, node],
        edges: pendingEdge ? [...g.edges.filter(e => e.id !== pendingEdge.id), pendingEdge] : g.edges,
      }));
      set({
        addDialogOpen: false,
        addDialogPos: null,
        addDialogPrefillItemId: null,
        addDialogFilterInputItemId: null,
        pendingConnect: null,
      });
    },

    removeNode(id) {
      commitViewedGraph(g => ({
        nodes: g.nodes.filter(n => n.id !== id),
        edges: g.edges.filter(e => e.source !== id && e.target !== id),
      }));
      set({ editingNodeId: null });
    },

    setNodeRawConfig(id, patch) {
      commitViewedGraph(g => ({
        ...g,
        nodes: g.nodes.map(n =>
          isItemNode(n) && n.id === id
            ? { ...n, data: { ...n.data, rawConfig: { ...(n.data.rawConfig ?? DEFAULT_RAW_CONFIG), ...patch } } }
            : n,
        ),
      }));
    },

    setNodeHardLimit(id, limit) {
      commitViewedGraph(g => ({
        ...g,
        nodes: g.nodes.map(n =>
          isItemNode(n) && n.id === id
            ? { ...n, data: { ...n.data, hardLimitPerMin: limit ?? undefined } }
            : n,
        ),
      }));
    },

    connectNodes(connection) {
      const { source, target, sourceHandle, targetHandle } = connection;
      if (!source || !target) return;
      const { rootGraph, viewPath } = get();
      const view = project(rootGraph, viewPath);
      const newEdge = buildEdge(view.nodes, source, target, sourceHandle, targetHandle);
      if (!newEdge) return;

      // 1) Add the edge to the currently-viewed graph (one producer per input handle).
      const viewed = graphAt(rootGraph, viewPath);
      const nextViewed: InnerGraph = {
        ...viewed,
        edges: [
          ...viewed.edges.filter(e => !(e.target === target && (e.targetHandle ?? null) === (targetHandle ?? null))),
          newEdge,
        ],
      };
      let nextRoot = setGraphAt(rootGraph, viewPath, nextViewed);

      // 2) If the edge lands on an unset factory port, the port inherits the other end's item.
      //    Ports live on the factory node (in the parent graph), not in the inner graph.
      const inherit = portInheritFromEdge(view.nodes, source, target, sourceHandle, targetHandle);
      if (inherit && viewPath.length > 0) {
        const facId = viewPath[viewPath.length - 1];
        const parentPath = viewPath.slice(0, -1);
        const parent = graphAt(nextRoot, parentPath);
        const nodes = parent.nodes.map(n =>
          n.id === facId && isFactoryNode(n)
            ? { ...n, data: applyPortItem(n.data, inherit.portId, inherit.itemId) }
            : n,
        );
        nextRoot = setGraphAt(nextRoot, parentPath, { ...parent, nodes });
      }

      nextRoot = rebalanceRoot(nextRoot);
      const v = project(nextRoot, viewPath);
      set({ rootGraph: nextRoot, nodes: v.nodes, edges: v.edges });
    },

    autoLayout() {
      const { rootGraph, viewPath, layoutTick } = get();
      const g = graphAt(rootGraph, viewPath);
      const laid = layoutNodes(g.nodes, g.edges);
      const nextRoot = rebalanceRoot(setGraphAt(rootGraph, viewPath, { nodes: laid, edges: g.edges }));
      const view = project(nextRoot, viewPath);
      set({ rootGraph: nextRoot, nodes: view.nodes, edges: view.edges, layoutTick: layoutTick + 1 });
    },

    enterFactory(id) {
      const { rootGraph, viewPath } = get();
      const g = graphAt(rootGraph, viewPath);
      if (!g.nodes.some(n => n.id === id && isFactoryNode(n))) return;
      navigate([...viewPath, id]);
    },
    exitTo(index) {
      const { viewPath } = get();
      navigate(viewPath.slice(0, Math.max(0, Math.min(index, viewPath.length))));
    },

    addInputPort(itemId) {
      const portId = crypto.randomUUID();
      commitCurrentFactory(d => ({ ...d, inputs: [...d.inputs, { id: portId, itemId: itemId ?? null }] }));
      return portId;
    },
    addOutputPort(itemId) {
      const portId = crypto.randomUUID();
      commitCurrentFactory(d => ({ ...d, outputs: [...d.outputs, { id: portId, itemId: itemId ?? null }] }));
      return portId;
    },
    setPortItem(portId, itemId) {
      commitCurrentFactory(d => {
        const nextData = applyPortItem(d, portId, itemId);
        const resolveNodes: ViewNode[] = [...synthesizePorts(nextData), ...d.inner.nodes];
        const edges = d.inner.edges.filter(e => edgeValid(resolveNodes, e));
        return { ...nextData, inner: { ...d.inner, edges } };
      });
    },
    removePort(portId) {
      commitCurrentFactory(d => {
        const inId = portNodeId('input', portId);
        const outId = portNodeId('output', portId);
        return {
          ...d,
          inputs: d.inputs.filter(p => p.id !== portId),
          outputs: d.outputs.filter(p => p.id !== portId),
          inner: {
            ...d.inner,
            edges: d.inner.edges.filter(
              e => e.source !== inId && e.target !== inId && e.source !== outId && e.target !== outId,
            ),
          },
        };
      });
      set({ portDialogPortId: null });
    },
    renameFactory(name) {
      commitCurrentFactory(d => ({ ...d, name }), false);
    },
    removeCurrentFactory() {
      const { rootGraph, viewPath, layoutTick } = get();
      if (viewPath.length === 0) return;
      const facId = viewPath[viewPath.length - 1];
      const parentPath = viewPath.slice(0, -1);
      const parent = graphAt(rootGraph, parentPath);
      const nextParent: InnerGraph = {
        nodes: parent.nodes.filter(n => n.id !== facId),
        edges: parent.edges.filter(e => e.source !== facId && e.target !== facId),
      };
      const nextRoot = rebalanceRoot(setGraphAt(rootGraph, parentPath, nextParent));
      const view = project(nextRoot, parentPath);
      set({
        rootGraph: nextRoot,
        viewPath: parentPath,
        nodes: view.nodes,
        edges: view.edges,
        layoutTick: layoutTick + 1,
        editingNodeId: null,
        portDialogPortId: null,
      });
    },

    openAddDialog(opts) {
      set({
        addDialogOpen: true,
        addDialogPos: opts?.pos ?? null,
        addDialogPrefillItemId: opts?.prefillItemId ?? null,
        addDialogFilterInputItemId: opts?.filterInputItemId ?? null,
        pendingConnect: opts?.pending ?? null,
      });
    },
    closeAddDialog() {
      set({
        addDialogOpen: false,
        addDialogPos: null,
        addDialogPrefillItemId: null,
        addDialogFilterInputItemId: null,
        pendingConnect: null,
      });
    },
    openConfig(id) { set({ editingNodeId: id }); },
    closeConfig() { set({ editingNodeId: null }); },
    openPortDialog(portId) { set({ portDialogPortId: portId }); },
    closePortDialog() { set({ portDialogPortId: null }); },
  };
});
