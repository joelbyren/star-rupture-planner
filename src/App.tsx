import { useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
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
import { AddNodeDialog } from './components/AddNodeDialog.tsx';
import { NodeConfigDialog } from './components/NodeConfigDialog.tsx';
import { PortConfigDialog } from './components/PortConfigDialog.tsx';
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
  const { screenToFlowPosition, fitView } = useReactFlow();
  const connectFrom = useRef<OnConnectStartParams | null>(null);
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
    connectFrom.current = params;
    didConnect.current = false;
  }, []);

  // Drag off a handle and release on empty canvas → open the add dialog there,
  // pre-filled (when dragged off an input) and auto-connected to the origin handle.
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      const from = connectFrom.current;
      const connected = didConnect.current;
      connectFrom.current = null;
      didConnect.current = false;
      if (!from || !from.nodeId) return;
      if (connected) return; // a real connection was made (incl. proximity snap) → no add dialog
      const target = event.target as HTMLElement;
      if (!target.classList.contains('react-flow__pane')) return; // dropped on a node → normal connect
      const point = 'changedTouches' in event ? event.changedTouches[0] : event;
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
    [screenToFlowPosition, openAddDialog, nodes],
  );

  const onWrapperDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.classList.contains('react-flow__pane')) return;
      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      openAddDialog({ pos });
    },
    [screenToFlowPosition, openAddDialog],
  );

  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: ViewNode) => {
      if (node.type === 'factoryNode') enterFactory(node.id);
      else if (node.type === 'itemNode') openConfig(node.id);
    },
    [enterFactory, openConfig],
  );

  const onNodeMouseEnter = useCallback(
    (_: React.MouseEvent, node: ViewNode) => setHoveredNode(node.id),
    [setHoveredNode],
  );
  const onNodeMouseLeave = useCallback(() => setHoveredNode(null), [setHoveredNode]);

  return (
    <div className="w-full h-full" ref={wrapperRef} onDoubleClick={onWrapperDoubleClick}>
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
        <Controls />
        <MiniMap nodeColor="var(--sr-accent)" maskColor="var(--sr-panel)" />
      </ReactFlow>
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
        </ReactFlowProvider>
      </div>
    </div>
  );
}
