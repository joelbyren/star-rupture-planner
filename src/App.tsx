import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type NodeTypes,
  type EdgeTypes,
  type Connection,
  type OnConnectStartParams,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';

import { ThemeBackdrop } from './components/ThemeBackdrop.tsx';
import { useThemeStore } from './store/themeStore.ts';
import { TopBar } from './components/layout/TopBar.tsx';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { FactoryNode } from './components/FactoryNode.tsx';
import { ItemNode } from './components/ItemNode.tsx';
import { PortNode } from './components/PortNode.tsx';
import { NoteNode } from './components/NoteNode.tsx';
import { AddNodeDialog } from './components/AddNodeDialog.tsx';
import { NodeConfigDialog } from './components/NodeConfigDialog.tsx';
import { PortConfigDialog } from './components/PortConfigDialog.tsx';
import { NoteDialog } from './components/NoteDialog.tsx';
import { DeleteSelectionDialog, type PendingDelete } from './components/DeleteSelectionDialog.tsx';
import { usePlanStore, handleItemId, isPortNode } from './store/planStore.ts';
import type { ViewNode } from './store/planStore.ts';
import { usePinnedPorts } from './lib/usePinnedPorts.ts';
import { useUiStore } from './store/uiStore.ts';
import { ThemedEdge } from './edges/ThemedEdge.tsx';
import { EdgeMarkerDefs } from './edges/EdgeMarkerDefs.tsx';

const NODE_TYPES: NodeTypes = {
  itemNode: ItemNode,
  factoryNode: FactoryNode,
  inputPort: PortNode,
  outputPort: PortNode,
  noteNode: NoteNode,
};

const EDGE_TYPES: EdgeTypes = {
  default: ThemedEdge,
};

function Flow() {
  const {
    nodes, edges, setNodes, setEdges, connectNodes,
    openAddDialog, enterFactory, openConfig, layoutTick,
  } = usePlanStore();
  const theme = useThemeStore(s => s.theme);
  const setHoveredNode = useUiStore(s => s.setHoveredNode);
  const openNoteDialogEdit = useUiStore(s => s.openNoteDialogEdit);
  // A running prerequisite build locks the graph down: no drags, connects,
  // deletes, or dialogs until it finishes. Pan/zoom stays available.
  const busy = useUiStore(s => s.prereqRun !== null);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const connectFrom = useRef<OnConnectStartParams | null>(null);
  // Selection queued for deletion (via the Delete/Backspace key) awaiting confirmation.
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  // Whether onConnect fired during the current drag. React Flow can complete a
  // connection by snapping to a nearby handle even when the pointer is released
  // over the pane — in that case we must NOT also open the add-node dialog.
  const didConnect = useRef(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  usePinnedPorts(wrapperRef);

  // Re-fit the view after an auto-layout or when navigating in/out of a factory.
  // Exclude port nodes: they're screen-pinned, not part of the layout to fit.
  useEffect(() => {
    const real = usePlanStore.getState().nodes.filter(n => !isPortNode(n));
    fitView({ duration: 400, padding: 0.15, nodes: real.length ? real : undefined });
  }, [layoutTick, fitView]);

  // Navigating in/out of a factory swaps the node/edge set wholesale, so the
  // hovered node's onMouseLeave never fires — clear stale hover explicitly.
  useEffect(() => {
    setHoveredNode(null);
  }, [layoutTick, setHoveredNode]);

  const onNodesChange = useCallback(
    (changes: NodeChange<ViewNode>[]) => setNodes(applyNodeChanges(changes, nodes)),
    [nodes, setNodes],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges(applyEdgeChanges(changes, edges)),
    [edges, setEdges],
  );
  const onConnect = useCallback((c: Connection) => {
    didConnect.current = true;
    connectNodes(c);
  }, [connectNodes]);

  const onConnectStart = useCallback((_: unknown, params: OnConnectStartParams) => {
    if (busy) return;
    connectFrom.current = params;
    didConnect.current = false;
    // Handles are hidden until hovered/connecting (see .react-flow__handle in
    // tokens.css) — reveal all of them for the duration of the drag so the
    // user can see where a connection can land. Toggled imperatively rather
    // than via React state so it doesn't re-render the whole flow per drag.
    wrapperRef.current?.classList.add('sr-connecting');
  }, [busy]);

  // Drag off a handle and release on empty canvas → open the add dialog there,
  // pre-filled (when dragged off an input) and auto-connected to the origin handle.
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      wrapperRef.current?.classList.remove('sr-connecting');
      const from = connectFrom.current;
      const connected = didConnect.current;
      connectFrom.current = null;
      didConnect.current = false;
      if (busy) return;
      if (!from || !from.nodeId) return;
      if (connected) return; // a real connection was made (incl. proximity snap) → no add dialog
      const target = event.target as HTMLElement;
      if (!target.classList.contains('react-flow__pane')) return; // dropped on a node → normal connect
      const point = 'changedTouches' in event ? event.changedTouches[0] : event;
      if (!point) return; // touch ended without a changed-touches entry
      const pos = screenToFlowPosition({ x: point.clientX, y: point.clientY });
      const origin = nodes.find(n => n.id === from.nodeId);
      const handleType = (from.handleType ?? 'source') as 'source' | 'target';
      // Resolve the item via the handle (works for item nodes AND factory port handles).
      const originItemId = origin ? handleItemId(origin, from.handleId, handleType) ?? undefined : undefined;
      openAddDialog({
        pos,
        // Dragged off an input/target → seed a producer of that item.
        prefillItemId: handleType === 'target' ? originItemId : undefined,
        // Dragged off an output/source → filter to recipes that consume that item.
        filterInputItemId: handleType === 'source' ? originItemId : undefined,
        pending: {
          fromNodeId: from.nodeId,
          fromHandleId: from.handleId,
          fromHandleType: handleType,
        },
      });
    },
    [screenToFlowPosition, openAddDialog, nodes, busy],
  );

  const onWrapperDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      if (busy) return;
      const target = event.target as HTMLElement;
      if (!target.classList.contains('react-flow__pane')) return;
      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      openAddDialog({ pos });
    },
    [screenToFlowPosition, openAddDialog, busy],
  );

  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: ViewNode) => {
      if (busy) return;
      if (node.type === 'factoryNode') enterFactory(node.id);
      else if (node.type === 'itemNode') openConfig(node.id);
      else if (node.type === 'noteNode') openNoteDialogEdit(node.id);
    },
    [enterFactory, openConfig, openNoteDialogEdit, busy],
  );

  // Intercept React Flow's delete (Delete/Backspace on a selection). Edge-only
  // deletions pass straight through — an edge is re-created in seconds. Anything
  // involving nodes is queued behind a confirmation dialog instead, and the
  // actual removal runs through the store so notes/edges/balance stay consistent.
  const onBeforeDelete = useCallback(
    async ({ nodes: delNodes, edges: delEdges }: { nodes: ViewNode[]; edges: Edge[] }) => {
      if (busy) return false;
      const nodeIds = delNodes.filter(n => !isPortNode(n)).map(n => n.id);
      if (nodeIds.length === 0) return delEdges.length > 0;
      setPendingDelete({ nodeIds, edgeIds: delEdges.map(e => e.id) });
      return false;
    },
    [busy],
  );

  const onNodeMouseEnter = useCallback(
    (_: React.MouseEvent, node: ViewNode) => setHoveredNode(node.id),
    [setHoveredNode],
  );
  const onNodeMouseLeave = useCallback(() => setHoveredNode(null), [setHoveredNode]);

  // Port nodes are synthesized even for an otherwise-empty factory, so the
  // empty-state hinges on real (item/factory) content, not raw node count.
  const hasContent = nodes.some(n => n.type === 'itemNode' || n.type === 'factoryNode');

  return (
    <div className="w-full h-full relative" ref={wrapperRef} onDoubleClick={onWrapperDoubleClick}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onBeforeDelete={onBeforeDelete}
        nodesDraggable={!busy}
        nodesConnectable={!busy}
        elementsSelectable={!busy}
        deleteKeyCode={busy ? null : ['Delete', 'Backspace']}
        zoomOnDoubleClick={false}
        fitView
      >
        <EdgeMarkerDefs />
        {theme === 'blueprint' && (
          <>
            <Background id="bp-major" className="bp-grid-major" gap={120} lineWidth={1} />
            <Background id="bp-fine" className="bp-grid-fine" gap={24} lineWidth={1} />
          </>
        )}
        {theme === 'terminal' && (
          <Background className="term-grid" gap={36} lineWidth={1} />
        )}
        {/* graphite intentionally renders no grid — it uses a wash + grain backdrop. */}
        <Controls />
        <MiniMap nodeColor="var(--sr-accent)" maskColor="var(--sr-panel)" />
      </ReactFlow>
      <DeleteSelectionDialog pending={pendingDelete} onClose={() => setPendingDelete(null)} />
      {!hasContent && (
        <div className="sr-empty" aria-hidden="true">
          <div className="sr-empty-title">No nodes yet</div>
          <div className="sr-empty-hint">
            Double-click the canvas to place a node, or drag from a node's handle onto empty space to branch off a new one.
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <div className="flex flex-col h-screen bg-canvas">
      <ThemeBackdrop />
      <TopBar />
      <div className="flex-1 overflow-hidden relative flex">
        <ReactFlowProvider>
          <Sidebar />
          <div className="flex-1 relative">
            <Flow />
          </div>
          <AddNodeDialog />
          <NodeConfigDialog />
          <PortConfigDialog />
          <NoteDialog />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
