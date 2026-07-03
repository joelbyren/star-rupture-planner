import { describe, it, expect, beforeEach } from 'vitest';
import { usePlanStore, type ItemNodeType } from '../store/planStore.ts';
import { buildSnapshot } from './persistence.ts';

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
