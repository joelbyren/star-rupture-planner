import { describe, it, expect, beforeEach } from 'vitest';
import { usePlanStore, isNoteNode, NOTE_MAX_DISTANCE, type ItemNodeType, type NoteNodeType } from './planStore.ts';

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
    usePlanStore.getState().addNode('rotor', 'recipe_crafter_rotor', { x: 0, y: 0 });
    const nodes = usePlanStore.getState().nodes;
    expect(nodes).toHaveLength(1);
    expect(balanceFor('rotor').buildingCountExact).toBeCloseTo(1);
    expect(balanceFor('rotor').outputRatePerMin).toBeCloseTo(10);
  });

  it('connects matching producers and rebalances the graph', () => {
    const s = usePlanStore.getState();
    s.addNode('rotor', 'recipe_crafter_rotor');
    s.addNode('wolfram-wire', 'recipe_crafter_wolfram-wire');
    s.addNode('titanium-rod', 'recipe_crafter_titanium-rod');

    s.connectNodes({ source: idFor('wolfram-wire'), target: idFor('rotor'), sourceHandle: null, targetHandle: 'wolfram-wire' });
    s.connectNodes({ source: idFor('titanium-rod'), target: idFor('rotor'), sourceHandle: null, targetHandle: 'titanium-rod' });

    expect(usePlanStore.getState().edges).toHaveLength(2);
    expect(balanceFor('rotor').buildingCountExact).toBeCloseTo(1);
    expect(balanceFor('wolfram-wire').buildingCountExact).toBeCloseTo(20 / 30);
    expect(balanceFor('titanium-rod').buildingCountExact).toBeCloseTo(20 / 30);
  });

  it('rejects a connection whose producer output does not match the target handle', () => {
    const s = usePlanStore.getState();
    s.addNode('rotor', 'recipe_crafter_rotor');
    s.addNode('wolfram-wire', 'recipe_crafter_wolfram-wire');
    // wire feeding the titanium-rod handle is invalid
    s.connectNodes({ source: idFor('wolfram-wire'), target: idFor('rotor'), sourceHandle: null, targetHandle: 'titanium-rod' });
    expect(usePlanStore.getState().edges).toHaveLength(0);
  });

  it('removeNode drops the node and its incident edges', () => {
    const s = usePlanStore.getState();
    s.addNode('rotor', 'recipe_crafter_rotor');
    s.addNode('wolfram-wire', 'recipe_crafter_wolfram-wire');
    s.connectNodes({ source: idFor('wolfram-wire'), target: idFor('rotor'), sourceHandle: null, targetHandle: 'wolfram-wire' });
    expect(usePlanStore.getState().edges).toHaveLength(1);

    s.removeNode(idFor('wolfram-wire'));
    expect(usePlanStore.getState().nodes).toHaveLength(1);
    expect(usePlanStore.getState().edges).toHaveLength(0);
  });

  it('removeElements drops several nodes, their attached notes and the listed edges in one commit', () => {
    const s = usePlanStore.getState();
    s.addNode('rotor', 'recipe_crafter_rotor');
    s.addNode('wolfram-wire', 'recipe_crafter_wolfram-wire');
    s.addNode('titanium-rod', 'recipe_crafter_titanium-rod');
    s.connectNodes({ source: idFor('wolfram-wire'), target: idFor('rotor'), sourceHandle: null, targetHandle: 'wolfram-wire' });
    s.connectNodes({ source: idFor('titanium-rod'), target: idFor('rotor'), sourceHandle: null, targetHandle: 'titanium-rod' });
    s.addNote(idFor('wolfram-wire'), 'a note');
    const rodEdge = usePlanStore.getState().edges.find(e => e.source === idFor('titanium-rod'))!;

    // Delete the wire node (taking its note and edge with it) plus the rod→rotor edge explicitly.
    s.removeElements([idFor('wolfram-wire')], [rodEdge.id]);

    const state = usePlanStore.getState();
    expect(state.nodes.map(n => n.type).sort()).toEqual(['itemNode', 'itemNode']);
    expect(state.nodes.some(isNoteNode)).toBe(false);
    expect(state.edges).toHaveLength(0);
    // Rotor is unfed again → back to its standalone balance.
    expect(balanceFor('rotor').buildingCountExact).toBeCloseTo(1);
  });
});

describe('planStore — hard limits', () => {
  beforeEach(reset);

  it('setNodeHardLimit caps the network', () => {
    const s = usePlanStore.getState();
    s.addNode('rotor', 'recipe_crafter_rotor');
    s.addNode('wolfram-wire', 'recipe_crafter_wolfram-wire');
    s.connectNodes({ source: idFor('wolfram-wire'), target: idFor('rotor'), sourceHandle: null, targetHandle: 'wolfram-wire' });

    s.setNodeHardLimit(idFor('wolfram-wire'), 10);
    // wire's relative demand (unlimited) is 20/min at rotor=1 → limit 10 halves the network.
    expect(balanceFor('rotor').outputRatePerMin).toBeCloseTo(5);
    expect(balanceFor('wolfram-wire').hardLimitPerMin).toBe(10);
    expect(balanceFor('wolfram-wire').isLimitBinding).toBe(true);
  });

  it('setNodeHardLimit(null) clears the limit', () => {
    const s = usePlanStore.getState();
    s.addNode('rotor', 'recipe_crafter_rotor');
    s.addNode('wolfram-wire', 'recipe_crafter_wolfram-wire');
    s.connectNodes({ source: idFor('wolfram-wire'), target: idFor('rotor'), sourceHandle: null, targetHandle: 'wolfram-wire' });
    s.setNodeHardLimit(idFor('wolfram-wire'), 10);

    s.setNodeHardLimit(idFor('wolfram-wire'), null);
    expect(balanceFor('rotor').buildingCountExact).toBeCloseTo(1);
    expect(balanceFor('wolfram-wire').hardLimitPerMin).toBeUndefined();
  });

  it('a raw node always caps the network at calcSupplyRate, scaling UP when there is spare capacity', () => {
    const s = usePlanStore.getState();
    s.addNode('rotor', 'recipe_crafter_rotor');
    s.addNode('wolfram-wire', 'recipe_crafter_wolfram-wire');
    s.addNode('wolfram-bar', null); // raw
    s.connectNodes({ source: idFor('wolfram-wire'), target: idFor('rotor'), sourceHandle: null, targetHandle: 'wolfram-wire' });
    s.connectNodes({ source: idFor('wolfram-bar'), target: idFor('wolfram-wire'), sourceHandle: null, targetHandle: 'wolfram-bar' });

    // normal purity × V1 = 120/min supply; relative demand at rotor=1 is 10 → scales UP to use it all.
    expect(balanceFor('wolfram-bar').outputRatePerMin).toBeCloseTo(120);
    expect(balanceFor('wolfram-bar').isLimitBinding).toBe(true);
    expect(balanceFor('rotor').buildingCountExact).toBeGreaterThan(1);
  });

  it('changing purity moves the raw cap and rescales the network', () => {
    const s = usePlanStore.getState();
    s.addNode('rotor', 'recipe_crafter_rotor');
    s.addNode('wolfram-wire', 'recipe_crafter_wolfram-wire');
    s.addNode('wolfram-bar', null);
    s.connectNodes({ source: idFor('wolfram-wire'), target: idFor('rotor'), sourceHandle: null, targetHandle: 'wolfram-wire' });
    s.connectNodes({ source: idFor('wolfram-bar'), target: idFor('wolfram-wire'), sourceHandle: null, targetHandle: 'wolfram-bar' });

    s.setNodeRawConfig(idFor('wolfram-bar'), { purity: 'pure' });
    expect(balanceFor('wolfram-bar').outputRatePerMin).toBeCloseTo(240);
  });

  it('custom mode drives the raw cap directly', () => {
    const s = usePlanStore.getState();
    s.addNode('rotor', 'recipe_crafter_rotor');
    s.addNode('wolfram-wire', 'recipe_crafter_wolfram-wire');
    s.addNode('wolfram-bar', null);
    s.connectNodes({ source: idFor('wolfram-wire'), target: idFor('rotor'), sourceHandle: null, targetHandle: 'wolfram-wire' });
    s.connectNodes({ source: idFor('wolfram-bar'), target: idFor('wolfram-wire'), sourceHandle: null, targetHandle: 'wolfram-bar' });

    s.setNodeRawConfig(idFor('wolfram-bar'), { mode: 'custom', customRatePerMin: 30 });
    expect(balanceFor('wolfram-bar').outputRatePerMin).toBeCloseTo(30);

    s.setNodeRawConfig(idFor('wolfram-bar'), { customRatePerMin: 60 });
    expect(balanceFor('wolfram-bar').outputRatePerMin).toBeCloseTo(60);
  });
});

describe('planStore — notes', () => {
  beforeEach(reset);

  it('addNote attaches a note node to its parent, after it in the array', () => {
    const s = usePlanStore.getState();
    s.addNode('rotor', 'recipe_crafter_rotor');
    const parentId = idFor('rotor');
    s.addNote(parentId, 'remember to double this');

    const nodes = usePlanStore.getState().nodes;
    expect(nodes).toHaveLength(2);
    const note = nodes.find(isNoteNode) as NoteNodeType | undefined;
    expect(note?.parentId).toBe(parentId);
    expect(note?.data.text).toBe('remember to double this');
    expect(nodes.indexOf(note!)).toBeGreaterThan(nodes.findIndex(n => n.id === parentId));
  });

  it('does not count notes toward the balance solve', () => {
    const s = usePlanStore.getState();
    s.addNode('rotor', 'recipe_crafter_rotor');
    const before = balanceFor('rotor').buildingCountExact;
    s.addNote(idFor('rotor'), 'a note');
    expect(balanceFor('rotor').buildingCountExact).toBeCloseTo(before);
  });

  it('updateNoteText edits the note in place', () => {
    const s = usePlanStore.getState();
    s.addNode('rotor', 'recipe_crafter_rotor');
    s.addNote(idFor('rotor'), 'original');
    const noteId = (usePlanStore.getState().nodes.find(isNoteNode) as NoteNodeType).id;

    s.updateNoteText(noteId, 'updated');
    expect((usePlanStore.getState().nodes.find(isNoteNode) as NoteNodeType).data.text).toBe('updated');
  });

  it('removeNode cascade-deletes notes attached to the removed parent', () => {
    const s = usePlanStore.getState();
    s.addNode('rotor', 'recipe_crafter_rotor');
    const parentId = idFor('rotor');
    s.addNote(parentId, 'a note');
    expect(usePlanStore.getState().nodes).toHaveLength(2);

    s.removeNode(parentId);
    expect(usePlanStore.getState().nodes).toHaveLength(0);
  });

  it('setNodes clamps a note further than NOTE_MAX_DISTANCE from its parent origin', () => {
    const s = usePlanStore.getState();
    s.addNode('rotor', 'recipe_crafter_rotor');
    s.addNote(idFor('rotor'), 'a note');
    const nodes = usePlanStore.getState().nodes;
    const note = nodes.find(isNoteNode) as NoteNodeType;

    const dragged = nodes.map(n => (n.id === note.id ? { ...n, position: { x: 1000, y: 0 } } : n));
    s.setNodes(dragged);

    const clamped = usePlanStore.getState().nodes.find(isNoteNode) as NoteNodeType;
    expect(Math.hypot(clamped.position.x, clamped.position.y)).toBeCloseTo(NOTE_MAX_DISTANCE);
  });

  it('loadPlan imports a pre-notes snapshot (no noteNode entries) cleanly', () => {
    const s = usePlanStore.getState();
    s.addNode('rotor', 'recipe_crafter_rotor');
    const snapshotNoNotes = { planId: 'p1', planName: 'Old plan', nodes: usePlanStore.getState().rootGraph.nodes, edges: [] };

    s.loadPlan(snapshotNoNotes);
    expect(usePlanStore.getState().nodes).toHaveLength(1);
    expect(balanceFor('rotor').buildingCountExact).toBeCloseTo(1);
  });

  it('a note round-trips through a save/load snapshot cycle', () => {
    const s = usePlanStore.getState();
    s.addNode('rotor', 'recipe_crafter_rotor');
    s.addNote(idFor('rotor'), 'keep this');
    const snapshot = { planId: 'p1', planName: 'Plan', nodes: usePlanStore.getState().rootGraph.nodes, edges: usePlanStore.getState().rootGraph.edges };

    reset();
    s.loadPlan(snapshot);

    const note = usePlanStore.getState().nodes.find(isNoteNode) as NoteNodeType | undefined;
    expect(note?.data.text).toBe('keep this');
  });
});
