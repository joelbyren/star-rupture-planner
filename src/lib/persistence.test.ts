import { describe, it, expect, beforeEach } from 'vitest';
import { usePlanStore, type ItemNodeType, type PlanSnapshot } from '../store/planStore.ts';
import { buildSnapshot, parseSnapshot } from './persistence.ts';

const reset = () =>
  usePlanStore.setState({ planId: 'test', planName: 'Test', rootGraph: { nodes: [], edges: [] }, viewPath: [], nodes: [], edges: [] });
const idFor = (itemId: string) =>
  (usePlanStore.getState().nodes.find(n => n.type === 'itemNode' && n.data.itemId === itemId)!).id;

describe('persistence — snapshot slimming', () => {
  beforeEach(reset);

  it('strips engine-derived and transient fields from the snapshot', () => {
    const s = usePlanStore.getState();
    s.addNode('comp_rotor', 'recipe_comp_rotor');
    s.addNode('wire_wolfram', 'recipe_wire_wolfram');
    s.connectNodes({ source: idFor('wire_wolfram'), target: idFor('comp_rotor'), sourceHandle: null, targetHandle: 'wire_wolfram' });

    // Live store nodes carry a computed balance…
    const live = usePlanStore.getState().nodes.find(n => n.id === idFor('comp_rotor')) as ItemNodeType;
    expect(live.data.balance).toBeDefined();

    // …but the snapshot drops it (and isEndProduct / selected / dragging).
    const snap = buildSnapshot(usePlanStore.getState());
    for (const n of snap.nodes) {
      expect(n.data).not.toHaveProperty('balance');
      expect(n.data).not.toHaveProperty('isEndProduct');
      expect(n).not.toHaveProperty('selected');
      expect(n).not.toHaveProperty('dragging');
      // Real inputs survive.
      expect(n.position).toBeDefined();
    }
  });

  it('loadPlan regenerates balance from a slimmed snapshot (round-trip)', () => {
    const s = usePlanStore.getState();
    s.addNode('comp_rotor', 'recipe_comp_rotor');
    s.addNode('wire_wolfram', 'recipe_wire_wolfram');
    s.connectNodes({ source: idFor('wire_wolfram'), target: idFor('comp_rotor'), sourceHandle: null, targetHandle: 'wire_wolfram' });

    const before = (usePlanStore.getState().nodes.find(n => n.id === idFor('comp_rotor')) as ItemNodeType)
      .data.balance!.outputRatePerMin;

    // Export (slim) then re-import through the same path the app uses.
    const snap = buildSnapshot(usePlanStore.getState());
    usePlanStore.getState().loadPlan(snap);

    const after = (usePlanStore.getState().nodes.find(n => n.id === idFor('comp_rotor')) as ItemNodeType)
      .data.balance!.outputRatePerMin;
    expect(after).toBeCloseTo(before);
  });

  it('slims nested factory inner graphs too', () => {
    const s = usePlanStore.getState();
    s.addFactoryNode();
    // Balance-writing populates factory data.balance on the live node.
    const facLive = usePlanStore.getState().nodes.find(n => n.type === 'factoryNode')!;
    expect(facLive.data).toHaveProperty('balance');

    const snap = buildSnapshot(usePlanStore.getState());
    const facSnap = snap.nodes.find(n => n.type === 'factoryNode')!;
    expect(facSnap.data).not.toHaveProperty('balance');
    // inner graph structure is preserved (empty here, but present and typed).
    expect(facSnap.data).toHaveProperty('inner');
  });
});

describe('persistence — parseSnapshot validation', () => {
  beforeEach(reset);

  it('round-trips a valid snapshot with a nested factory, byte-identical after JSON round-trip', () => {
    const s = usePlanStore.getState();
    s.addNode('wire_wolfram', 'recipe_wire_wolfram');
    s.addFactoryNode();
    const facId = usePlanStore.getState().nodes.find(n => n.type === 'factoryNode')!.id;
    s.enterFactory(facId);
    usePlanStore.getState().addNode('comp_rotor', 'recipe_comp_rotor');
    usePlanStore.getState().exitTo(0);

    const built = buildSnapshot(usePlanStore.getState());
    const parsed = parseSnapshot(JSON.stringify(built));
    expect(parsed).toEqual(built);
  });

  it('rejects a node missing "data" with a message naming the offending node', () => {
    const raw = JSON.stringify({
      planId: 'p1',
      planName: 'Broken',
      nodes: [{ id: 'n1', type: 'itemNode', position: { x: 0, y: 0 } }],
      edges: [],
    });
    expect(() => parseSnapshot(raw)).toThrow(/node 0.*data/i);
  });

  it('rejects a node with an unknown type', () => {
    const raw = JSON.stringify({
      planId: 'p1',
      planName: 'Broken',
      nodes: [{ id: 'n1', type: 'bogusNode', position: { x: 0, y: 0 }, data: {} }],
      edges: [],
    });
    expect(() => parseSnapshot(raw)).toThrow(/unknown node type 'bogusNode'/);
  });

  it('rejects a factoryNode missing its inner graph', () => {
    const raw = JSON.stringify({
      planId: 'p1',
      planName: 'Broken',
      nodes: [
        {
          id: 'f1',
          type: 'factoryNode',
          position: { x: 0, y: 0 },
          data: { name: 'Factory', inputs: [], outputs: [] },
        },
      ],
      edges: [],
    });
    expect(() => parseSnapshot(raw)).toThrow(/inner graph/);
  });

  it('rejects an itemNode with a non-finite position', () => {
    const raw = JSON.stringify({
      planId: 'p1',
      planName: 'Broken',
      nodes: [
        { id: 'n1', type: 'itemNode', position: { x: 'oops', y: 0 }, data: { itemId: 'wire_wolfram', recipeId: null, isRaw: true } },
      ],
      edges: [],
    });
    expect(() => parseSnapshot(raw)).toThrow(/position/);
  });

  it('still loads a legacy-shaped snapshot: optional fields absent, legacy edge.animated flag present', () => {
    // Mirrors what an older export actually looked like: JSON.stringify already
    // drops `undefined` optional fields (rawConfig on a non-raw node, hardLimitPerMin,
    // balance, isEndProduct), and pre-ThemedEdge exports persisted `animated: true`.
    const raw = JSON.stringify({
      planId: 'legacy',
      planName: 'Legacy plan',
      nodes: [
        { id: 'n1', type: 'itemNode', position: { x: 0, y: 0 }, data: { itemId: 'wire_wolfram', recipeId: null, isRaw: true } },
        { id: 'n2', type: 'itemNode', position: { x: 100, y: 0 }, data: { itemId: 'comp_rotor', recipeId: 'recipe_comp_rotor', isRaw: false } },
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2', sourceHandle: null, targetHandle: 'wire_wolfram', animated: true }],
    } satisfies PlanSnapshot);

    const parsed = parseSnapshot(raw);
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.edges).toHaveLength(1);

    // And the store accepts it end-to-end without crashing.
    expect(() => usePlanStore.getState().loadPlan(parsed)).not.toThrow();
    expect(usePlanStore.getState().rootGraph.nodes).toHaveLength(2);
  });
});
