import { describe, it, expect, beforeEach } from 'vitest';
import { usePlanStore, type ItemNodeType } from './planStore.ts';

const reset = () => usePlanStore.setState({ nodes: [], edges: [] });
const idFor = (itemId: string) =>
  (usePlanStore.getState().nodes.find(n => n.type === 'itemNode' && n.data.itemId === itemId)!).id;
const balanceFor = (itemId: string) =>
  (usePlanStore.getState().nodes.find(n => n.type === 'itemNode' && n.data.itemId === itemId) as ItemNodeType)
    .data.balance!;

describe('planStore — manual builder', () => {
  beforeEach(reset);

  it('adds an itemNode with a balance for a single end product', () => {
    usePlanStore.getState().addNode('comp_rotor', 'recipe_comp_rotor', { x: 0, y: 0 });
    const nodes = usePlanStore.getState().nodes;
    expect(nodes).toHaveLength(1);
    expect(balanceFor('comp_rotor').buildingCountExact).toBeCloseTo(1);
    expect(balanceFor('comp_rotor').outputRatePerMin).toBeCloseTo(10);
  });

  it('connects matching producers and rebalances the graph', () => {
    const s = usePlanStore.getState();
    s.addNode('comp_rotor', 'recipe_comp_rotor');
    s.addNode('wire_wolfram', 'recipe_wire_wolfram');
    s.addNode('rod_titanium', 'recipe_rod_titanium');

    s.connectNodes({ source: idFor('wire_wolfram'), target: idFor('comp_rotor'), sourceHandle: null, targetHandle: 'wire_wolfram' });
    s.connectNodes({ source: idFor('rod_titanium'), target: idFor('comp_rotor'), sourceHandle: null, targetHandle: 'rod_titanium' });

    expect(usePlanStore.getState().edges).toHaveLength(2);
    expect(balanceFor('comp_rotor').buildingCountExact).toBeCloseTo(1);
    expect(balanceFor('wire_wolfram').buildingCountExact).toBeCloseTo(20 / 30);
    expect(balanceFor('rod_titanium').buildingCountExact).toBeCloseTo(20 / 30);
  });

  it('rejects a connection whose producer output does not match the target handle', () => {
    const s = usePlanStore.getState();
    s.addNode('comp_rotor', 'recipe_comp_rotor');
    s.addNode('wire_wolfram', 'recipe_wire_wolfram');
    // wire feeding the rod_titanium handle is invalid
    s.connectNodes({ source: idFor('wire_wolfram'), target: idFor('comp_rotor'), sourceHandle: null, targetHandle: 'rod_titanium' });
    expect(usePlanStore.getState().edges).toHaveLength(0);
  });

  it('removeNode drops the node and its incident edges', () => {
    const s = usePlanStore.getState();
    s.addNode('comp_rotor', 'recipe_comp_rotor');
    s.addNode('wire_wolfram', 'recipe_wire_wolfram');
    s.connectNodes({ source: idFor('wire_wolfram'), target: idFor('comp_rotor'), sourceHandle: null, targetHandle: 'wire_wolfram' });
    expect(usePlanStore.getState().edges).toHaveLength(1);

    s.removeNode(idFor('wire_wolfram'));
    expect(usePlanStore.getState().nodes).toHaveLength(1);
    expect(usePlanStore.getState().edges).toHaveLength(0);
  });
});
