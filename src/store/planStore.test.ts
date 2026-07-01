import { describe, it, expect, beforeEach } from 'vitest';
import { usePlanStore, type ItemNodeType } from './planStore.ts';

const reset = () =>
  usePlanStore.setState({ rootGraph: { nodes: [], edges: [] }, viewPath: [], nodes: [], edges: [] });
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

describe('planStore — hard limits', () => {
  beforeEach(reset);

  it('setNodeHardLimit caps the network', () => {
    const s = usePlanStore.getState();
    s.addNode('comp_rotor', 'recipe_comp_rotor');
    s.addNode('wire_wolfram', 'recipe_wire_wolfram');
    s.connectNodes({ source: idFor('wire_wolfram'), target: idFor('comp_rotor'), sourceHandle: null, targetHandle: 'wire_wolfram' });

    s.setNodeHardLimit(idFor('wire_wolfram'), 10);
    // wire's relative demand (unlimited) is 20/min at rotor=1 → limit 10 halves the network.
    expect(balanceFor('comp_rotor').outputRatePerMin).toBeCloseTo(5);
    expect(balanceFor('wire_wolfram').hardLimitPerMin).toBe(10);
    expect(balanceFor('wire_wolfram').isLimitBinding).toBe(true);
  });

  it('setNodeHardLimit(null) clears the limit', () => {
    const s = usePlanStore.getState();
    s.addNode('comp_rotor', 'recipe_comp_rotor');
    s.addNode('wire_wolfram', 'recipe_wire_wolfram');
    s.connectNodes({ source: idFor('wire_wolfram'), target: idFor('comp_rotor'), sourceHandle: null, targetHandle: 'wire_wolfram' });
    s.setNodeHardLimit(idFor('wire_wolfram'), 10);

    s.setNodeHardLimit(idFor('wire_wolfram'), null);
    expect(balanceFor('comp_rotor').buildingCountExact).toBeCloseTo(1);
    expect(balanceFor('wire_wolfram').hardLimitPerMin).toBeUndefined();
  });

  it('a raw node always caps the network at calcSupplyRate, scaling UP when there is spare capacity', () => {
    const s = usePlanStore.getState();
    s.addNode('comp_rotor', 'recipe_comp_rotor');
    s.addNode('wire_wolfram', 'recipe_wire_wolfram');
    s.addNode('ingot_wolfram', null); // raw
    s.connectNodes({ source: idFor('wire_wolfram'), target: idFor('comp_rotor'), sourceHandle: null, targetHandle: 'wire_wolfram' });
    s.connectNodes({ source: idFor('ingot_wolfram'), target: idFor('wire_wolfram'), sourceHandle: null, targetHandle: 'ingot_wolfram' });

    // normal purity × V1 = 120/min supply; relative demand at rotor=1 is 10 → scales UP to use it all.
    expect(balanceFor('ingot_wolfram').outputRatePerMin).toBeCloseTo(120);
    expect(balanceFor('ingot_wolfram').isLimitBinding).toBe(true);
    expect(balanceFor('comp_rotor').buildingCountExact).toBeGreaterThan(1);
  });

  it('changing purity moves the raw cap and rescales the network', () => {
    const s = usePlanStore.getState();
    s.addNode('comp_rotor', 'recipe_comp_rotor');
    s.addNode('wire_wolfram', 'recipe_wire_wolfram');
    s.addNode('ingot_wolfram', null);
    s.connectNodes({ source: idFor('wire_wolfram'), target: idFor('comp_rotor'), sourceHandle: null, targetHandle: 'wire_wolfram' });
    s.connectNodes({ source: idFor('ingot_wolfram'), target: idFor('wire_wolfram'), sourceHandle: null, targetHandle: 'ingot_wolfram' });

    s.setNodeRawConfig(idFor('ingot_wolfram'), { purity: 'pure' });
    expect(balanceFor('ingot_wolfram').outputRatePerMin).toBeCloseTo(240);
  });

  it('custom mode drives the raw cap directly', () => {
    const s = usePlanStore.getState();
    s.addNode('comp_rotor', 'recipe_comp_rotor');
    s.addNode('wire_wolfram', 'recipe_wire_wolfram');
    s.addNode('ingot_wolfram', null);
    s.connectNodes({ source: idFor('wire_wolfram'), target: idFor('comp_rotor'), sourceHandle: null, targetHandle: 'wire_wolfram' });
    s.connectNodes({ source: idFor('ingot_wolfram'), target: idFor('wire_wolfram'), sourceHandle: null, targetHandle: 'ingot_wolfram' });

    s.setNodeRawConfig(idFor('ingot_wolfram'), { mode: 'custom', customRatePerMin: 30 });
    expect(balanceFor('ingot_wolfram').outputRatePerMin).toBeCloseTo(30);

    s.setNodeRawConfig(idFor('ingot_wolfram'), { customRatePerMin: 60 });
    expect(balanceFor('ingot_wolfram').outputRatePerMin).toBeCloseTo(60);
  });
});
