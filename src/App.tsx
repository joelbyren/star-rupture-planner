import { useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Panel,
  useReactFlow,
  type NodeChange,
  type EdgeChange,
  type NodeTypes,
  type Connection,
  type OnConnectStartParams,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { PersistenceBar } from './components/PersistenceBar.tsx';
import { FactoryNode } from './components/FactoryNode.tsx';
import { ItemNode } from './components/ItemNode.tsx';
import { PortNode } from './components/PortNode.tsx';
import { Breadcrumb } from './components/Breadcrumb.tsx';
import { AddNodeDialog } from './components/AddNodeDialog.tsx';
import { NodeConfigDialog } from './components/NodeConfigDialog.tsx';
import { PortConfigDialog } from './components/PortConfigDialog.tsx';
import { usePlanStore } from './store/planStore.ts';
import type { ViewNode } from './store/planStore.ts';

const NODE_TYPES: NodeTypes = {
  itemNode: ItemNode,
  factoryNode: FactoryNode,
  inputPort: PortNode,
  outputPort: PortNode,
};

function Flow() {
  const {
    nodes, edges, viewPath, setNodes, setEdges, connectNodes,
    openAddDialog, enterFactory, openConfig, addInputPort, addOutputPort, layoutTick,
  } = usePlanStore();
  const { screenToFlowPosition, fitView } = useReactFlow();
  const connectFrom = useRef<OnConnectStartParams | null>(null);

  // Re-fit the view after an auto-layout or when navigating in/out of a factory.
  useEffect(() => {
    fitView({ duration: 400, padding: 0.15 });
  }, [layoutTick, fitView]);

  const onNodesChange = useCallback(
    (changes: NodeChange<ViewNode>[]) => setNodes(applyNodeChanges(changes, nodes)),
    [nodes, setNodes],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges(applyEdgeChanges(changes, edges)),
    [edges, setEdges],
  );
  const onConnect = useCallback((c: Connection) => connectNodes(c), [connectNodes]);

  const onConnectStart = useCallback((_: unknown, params: OnConnectStartParams) => {
    connectFrom.current = params;
  }, []);

  // Drag off a handle and release on empty canvas → open the add dialog there,
  // pre-filled (when dragged off an input) and auto-connected to the origin handle.
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      const from = connectFrom.current;
      connectFrom.current = null;
      if (!from || !from.nodeId) return;
      const target = event.target as HTMLElement;
      if (!target.classList.contains('react-flow__pane')) return; // dropped on a node → normal connect
      const point = 'changedTouches' in event ? event.changedTouches[0] : event;
      const pos = screenToFlowPosition({ x: point.clientX, y: point.clientY });
      const origin = nodes.find(n => n.id === from.nodeId);
      const originItemId = origin?.data.itemId as string | undefined;
      openAddDialog({
        pos,
        prefillItemId: from.handleType === 'target' ? (from.handleId ?? originItemId) : undefined,
        filterInputItemId: from.handleType === 'source' ? originItemId : undefined,
        pending: {
          fromNodeId: from.nodeId,
          fromHandleId: from.handleId,
          fromHandleType: (from.handleType ?? 'source') as 'source' | 'target',
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

  const insideFactory = viewPath.length > 0;

  return (
    <div className="w-full h-full" onDoubleClick={onWrapperDoubleClick}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onNodeDoubleClick={onNodeDoubleClick}
        zoomOnDoubleClick={false}
        fitView
        colorMode="dark"
      >
        <Background color="#334155" gap={24} />
        <Controls />
        <MiniMap nodeColor="#6d28d9" maskColor="rgba(15,17,23,0.8)" />
        {insideFactory && (
          <>
            <Panel position="top-left" className="!top-12">
              <button
                onClick={() => addInputPort()}
                className="bg-violet-600 hover:bg-violet-500 text-white text-xs px-2 py-1 rounded shadow"
              >
                + input
              </button>
            </Panel>
            <Panel position="top-right">
              <button
                onClick={() => addOutputPort()}
                className="bg-violet-600 hover:bg-violet-500 text-white text-xs px-2 py-1 rounded shadow"
              >
                + output
              </button>
            </Panel>
          </>
        )}
      </ReactFlow>
      <Breadcrumb />
    </div>
  );
}

export default function App() {
  return (
    <div className="flex flex-col h-screen bg-slate-950">
      <PersistenceBar />
      <div className="flex-1 overflow-hidden relative">
        <ReactFlowProvider>
          <Flow />
          <AddNodeDialog />
          <NodeConfigDialog />
          <PortConfigDialog />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
