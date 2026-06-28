import { useEffect, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type NodeChange,
  type EdgeChange,
  type NodeTypes,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { SidePanel } from './components/SidePanel.tsx';
import { PersistenceBar } from './components/PersistenceBar.tsx';
import { FactoryNode } from './components/FactoryNode.tsx';
import { usePlanStore } from './store/planStore.ts';
import type { FactoryNodeType } from './store/planStore.ts';

const NODE_TYPES: NodeTypes = { factoryNode: FactoryNode };

export default function App() {
  const { nodes, edges, setNodes, setEdges, setTarget, targetItemId, targetRatePerMin } = usePlanStore();

  useEffect(() => {
    setTarget(targetItemId, targetRatePerMin);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange<FactoryNodeType>[]) =>
      setNodes(applyNodeChanges(changes, nodes)),
    [nodes, setNodes],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges(applyEdgeChanges(changes, edges)),
    [edges, setEdges],
  );

  return (
    <div className="flex flex-col h-screen bg-slate-950">
      <PersistenceBar />
      <div className="flex flex-1 overflow-hidden">
        <SidePanel />
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            fitView
            colorMode="dark"
          >
            <Background color="#334155" gap={24} />
            <Controls />
            <MiniMap nodeColor="#6d28d9" maskColor="rgba(15,17,23,0.8)" />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}
