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
  type Connection,
  type OnConnectStartParams,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { PersistenceBar } from './components/PersistenceBar.tsx';
import { FactoryNode } from './components/FactoryNode.tsx';
import { ItemNode } from './components/ItemNode.tsx';
import { AddNodeDialog } from './components/AddNodeDialog.tsx';
import { NodeConfigDialog } from './components/NodeConfigDialog.tsx';
import { usePlanStore } from './store/planStore.ts';
import type { AnyNode } from './store/planStore.ts';

// FactoryNode kept registered only so previously saved (push-model) plans still render.
const NODE_TYPES: NodeTypes = { factoryNode: FactoryNode, itemNode: ItemNode };

function Flow() {
  const { nodes, edges, setNodes, setEdges, connectNodes, openAddDialog, layoutTick } = usePlanStore();
  const { screenToFlowPosition, fitView } = useReactFlow();
  const connectFrom = useRef<OnConnectStartParams | null>(null);

  // After an auto-layout repositions every node, re-fit the view to frame them.
  useEffect(() => {
    if (layoutTick > 0) fitView({ duration: 400, padding: 0.15 });
  }, [layoutTick, fitView]);

  const onNodesChange = useCallback(
    (changes: NodeChange<AnyNode>[]) => setNodes(applyNodeChanges(changes, nodes)),
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
      // Dragged off an output handle → the new node consumes the origin's output,
      // so restrict the picker to items whose recipe accepts it as an input.
      const origin = nodes.find(n => n.id === from.nodeId);
      const originItemId = origin?.data.itemId as string | undefined;
      openAddDialog({
        pos,
        prefillItemId: from.handleType === 'target' ? from.handleId ?? undefined : undefined,
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

  // Double-click empty canvas → open the add dialog at the cursor.
  const onWrapperDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.classList.contains('react-flow__pane')) return;
      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      openAddDialog({ pos });
    },
    [screenToFlowPosition, openAddDialog],
  );

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
        zoomOnDoubleClick={false}
        fitView
        colorMode="dark"
      >
        <Background color="#334155" gap={24} />
        <Controls />
        <MiniMap nodeColor="#6d28d9" maskColor="rgba(15,17,23,0.8)" />
      </ReactFlow>
    </div>
  );
}

export default function App() {
  return (
    <div className="flex flex-col h-screen bg-slate-950">
      <PersistenceBar />
      <div className="flex-1 overflow-hidden">
        <ReactFlowProvider>
          <Flow />
          <AddNodeDialog />
          <NodeConfigDialog />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
