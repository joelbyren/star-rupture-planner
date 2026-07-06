import { describe, it, expect, beforeEach } from 'vitest';
import type { Edge } from '@xyflow/react';
import {
  usePlanStore,
  isNoteNode,
  isFactoryNode,
  portNodeId,
  NOTE_MAX_DISTANCE,
  findValidationIssues,
  computeRecipeChangePreview,
  type ItemNodeType,
  type NoteNodeType,
  type FactoryNodeType,
} from './planStore.ts';
import { ALL_RECIPES } from '../data/index.ts';

const reset = () =>
  usePlanStore.setState({ rootGraph: { nodes: [], edges: [] }, viewPath: [], nodes: [], edges: [] });
const idFor = (itemId: string) =>
  (usePlanStore.getState().nodes.find(n => n.type === 'itemNode' && n.data.itemId === itemId)!).id;
const balanceFor = (itemId: string) =>
  (usePlanStore.getState().nodes.find(n => n.type === 'itemNode' && n.data.itemId === itemId) as ItemNodeType)
    .data.balance!;
const posFor = (id: string) => usePlanStore.getState().nodes.find(n => n.id === id)!.position;

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

describe('planStore — setNodeRecipe', () => {
  beforeEach(reset);

  const CERAMICS_V1 = 'recipe_furnace_ceramics'; // inputs: calcite-sheets, wolfram-powder
  const CERAMICS_V2 = 'recipe_furnace-tier2_ceramics-v2'; // inputs: calcite-sheets, helium-ore, wolfram-powder
  const GLASS_V1 = 'recipe_furnace_glass'; // inputs: helium-ore, calcium-powder
  const GLASS_V2 = 'recipe_furnace-tier2_glass-v2'; // inputs: pressurized-helium, calcite-sheets, goethite-ingot
  const COIL_V1 = 'recipe_furnace_coil'; // inputs: tube, wolfram-wire, ceramics

  it('keeps matching connections and drops none when the new recipe is a superset', () => {
    const s = usePlanStore.getState();
    s.addNode('ceramics', CERAMICS_V1);
    s.addNode('calcite-sheets', null);
    s.addNode('wolfram-powder', null);
    s.connectNodes({ source: idFor('calcite-sheets'), target: idFor('ceramics'), sourceHandle: null, targetHandle: 'calcite-sheets' });
    s.connectNodes({ source: idFor('wolfram-powder'), target: idFor('ceramics'), sourceHandle: null, targetHandle: 'wolfram-powder' });
    const edgesBefore = [...usePlanStore.getState().edges].sort((a, b) => a.id.localeCompare(b.id));

    s.setNodeRecipe(idFor('ceramics'), CERAMICS_V2);

    const state = usePlanStore.getState();
    expect((state.nodes.find(n => n.id === idFor('ceramics')) as ItemNodeType).data.recipeId).toBe(CERAMICS_V2);
    const edgesAfter = [...state.edges].sort((a, b) => a.id.localeCompare(b.id));
    expect(edgesAfter).toEqual(edgesBefore);
    expect(findValidationIssues(state.nodes, state.edges)).toEqual([
      { nodeId: idFor('ceramics'), consumerItemId: 'ceramics', itemId: 'helium-ore' },
    ]);
    // Ceramics has no consumer of its own, so the raw-fed component scales UP to
    // the calcite-sheets/wolfram-powder supply cap (120/min each at normal
    // purity/V1): 120 / (1*120/4) = 4 buildings at the V2 rate of 120/min each.
    expect(balanceFor('ceramics').buildingCountExact).toBeCloseTo(4);
    expect(balanceFor('ceramics').outputRatePerMin).toBeCloseTo(480);
  });

  it('drops every connection when the new recipe shares no inputs with the old one', () => {
    const s = usePlanStore.getState();
    s.addNode('glass', GLASS_V1);
    s.addNode('helium-ore', null);
    s.addNode('calcium-powder', null);
    s.connectNodes({ source: idFor('helium-ore'), target: idFor('glass'), sourceHandle: null, targetHandle: 'helium-ore' });
    s.connectNodes({ source: idFor('calcium-powder'), target: idFor('glass'), sourceHandle: null, targetHandle: 'calcium-powder' });
    expect(usePlanStore.getState().edges).toHaveLength(2);

    s.setNodeRecipe(idFor('glass'), GLASS_V2);

    const state = usePlanStore.getState();
    expect(state.edges).toHaveLength(0);
    expect(state.nodes).toHaveLength(3); // producer nodes are left in place, just disconnected
    const glassIssues = findValidationIssues(state.nodes, state.edges).filter(i => i.consumerItemId === 'glass');
    expect(glassIssues.map(i => i.itemId).sort()).toEqual(['calcite-sheets', 'goethite-ingot', 'pressurized-helium']);
  });

  it('downgrading V2 to V1 drops only the connection for the input that no longer exists', () => {
    const s = usePlanStore.getState();
    s.addNode('ceramics', CERAMICS_V2);
    s.addNode('calcite-sheets', null);
    s.addNode('wolfram-powder', null);
    s.addNode('helium-ore', null);
    s.connectNodes({ source: idFor('calcite-sheets'), target: idFor('ceramics'), sourceHandle: null, targetHandle: 'calcite-sheets' });
    s.connectNodes({ source: idFor('wolfram-powder'), target: idFor('ceramics'), sourceHandle: null, targetHandle: 'wolfram-powder' });
    s.connectNodes({ source: idFor('helium-ore'), target: idFor('ceramics'), sourceHandle: null, targetHandle: 'helium-ore' });

    s.setNodeRecipe(idFor('ceramics'), CERAMICS_V1);

    const state = usePlanStore.getState();
    expect(state.edges).toHaveLength(2);
    expect(state.edges.some(e => e.targetHandle === 'helium-ore')).toBe(false);
  });

  it('preserves the outgoing edge to a downstream consumer and rebalances it', () => {
    const s = usePlanStore.getState();
    // No raw producers feeding ceramics here, deliberately: connecting raw nodes
    // makes the demo network's raw-supply auto-scaling kick in (extractors run
    // at full capacity when nothing else constrains them), which would make the
    // building-count math below depend on unrelated supply-rate constants.
    // Coil is the sole (unconnected) consumer, so ceramics' demand is fixed by
    // coil alone and independent of which ceramics recipe is active.
    s.addNode('ceramics', CERAMICS_V1);
    s.addNode('coil', COIL_V1);
    s.connectNodes({ source: idFor('ceramics'), target: idFor('coil'), sourceHandle: null, targetHandle: 'ceramics' });
    const buildingsBefore = balanceFor('ceramics').buildingCountExact;

    s.setNodeRecipe(idFor('ceramics'), CERAMICS_V2);

    const state = usePlanStore.getState();
    expect(state.edges.some(e => e.source === idFor('ceramics') && e.target === idFor('coil'))).toBe(true);
    // Same ceramics demand from coil, but V2 produces twice as much per building.
    expect(balanceFor('ceramics').buildingCountExact).toBeCloseTo(buildingsBefore / 2);
  });

  it('is a no-op for a raw node, an unknown recipe id, a recipe for a different item, or the same recipe id', () => {
    const s = usePlanStore.getState();
    s.addNode('ceramics', CERAMICS_V1);
    s.addNode('wolfram-bar', null);
    const before = JSON.stringify(usePlanStore.getState().nodes);

    s.setNodeRecipe(idFor('wolfram-bar'), CERAMICS_V1); // raw node
    s.setNodeRecipe(idFor('ceramics'), 'recipe_does_not_exist');
    s.setNodeRecipe(idFor('ceramics'), 'recipe_crafter_rotor'); // produces a different item
    s.setNodeRecipe(idFor('ceramics'), CERAMICS_V1); // no-op, already the current recipe

    expect(JSON.stringify(usePlanStore.getState().nodes)).toBe(before);
  });

  it('preserves hardLimitPerMin across a recipe switch', () => {
    const s = usePlanStore.getState();
    s.addNode('ceramics', CERAMICS_V1);
    s.setNodeHardLimit(idFor('ceramics'), 30);

    s.setNodeRecipe(idFor('ceramics'), CERAMICS_V2);

    expect((usePlanStore.getState().nodes.find(n => n.id === idFor('ceramics')) as ItemNodeType).data.hardLimitPerMin).toBe(30);
  });

  it('operates on a node inside a factory without touching the root graph', () => {
    const s = usePlanStore.getState();
    s.addFactoryNode({ x: 0, y: 0 });
    const factoryId = (usePlanStore.getState().nodes.find(isFactoryNode) as FactoryNodeType).id;
    s.enterFactory(factoryId);
    s.addNode('ceramics', CERAMICS_V1);
    s.addNode('calcite-sheets', null);
    s.addNode('wolfram-powder', null);
    s.connectNodes({ source: idFor('calcite-sheets'), target: idFor('ceramics'), sourceHandle: null, targetHandle: 'calcite-sheets' });
    s.connectNodes({ source: idFor('wolfram-powder'), target: idFor('ceramics'), sourceHandle: null, targetHandle: 'wolfram-powder' });

    s.setNodeRecipe(idFor('ceramics'), CERAMICS_V2);

    const state = usePlanStore.getState();
    expect((state.nodes.find(n => n.id === idFor('ceramics')) as ItemNodeType).data.recipeId).toBe(CERAMICS_V2);
    expect(state.edges).toHaveLength(2);
    expect(state.rootGraph.nodes.filter(isFactoryNode)).toHaveLength(1);
    expect(state.rootGraph.nodes).toHaveLength(1); // ceramics/producers live inside the factory's inner graph
  });
});

describe('computeRecipeChangePreview', () => {
  beforeEach(reset);

  it('splits incoming edges into kept/dropped and lists unfed new inputs', () => {
    const s = usePlanStore.getState();
    s.addNode('ceramics', 'recipe_furnace_ceramics');
    s.addNode('calcite-sheets', null);
    s.addNode('wolfram-powder', null);
    s.connectNodes({ source: idFor('calcite-sheets'), target: idFor('ceramics'), sourceHandle: null, targetHandle: 'calcite-sheets' });
    s.connectNodes({ source: idFor('wolfram-powder'), target: idFor('ceramics'), sourceHandle: null, targetHandle: 'wolfram-powder' });

    const v2 = ALL_RECIPES.find(r => r.id === 'recipe_furnace-tier2_ceramics-v2')!;
    const preview = computeRecipeChangePreview(idFor('ceramics'), usePlanStore.getState().edges, v2);

    expect(preview.kept.map(k => k.itemId).sort()).toEqual(['calcite-sheets', 'wolfram-powder']);
    expect(preview.dropped).toEqual([]);
    expect(preview.unfed).toEqual(['helium-ore']);
  });

  it('reports everything dropped and unfed when no inputs overlap', () => {
    const s = usePlanStore.getState();
    s.addNode('glass', 'recipe_furnace_glass');
    s.addNode('helium-ore', null);
    s.addNode('calcium-powder', null);
    s.connectNodes({ source: idFor('helium-ore'), target: idFor('glass'), sourceHandle: null, targetHandle: 'helium-ore' });
    s.connectNodes({ source: idFor('calcium-powder'), target: idFor('glass'), sourceHandle: null, targetHandle: 'calcium-powder' });

    const v2 = ALL_RECIPES.find(r => r.id === 'recipe_furnace-tier2_glass-v2')!;
    const preview = computeRecipeChangePreview(idFor('glass'), usePlanStore.getState().edges, v2);

    expect(preview.kept).toEqual([]);
    expect(preview.dropped).toHaveLength(2);
    expect(preview.unfed.sort()).toEqual(['calcite-sheets', 'goethite-ingot', 'pressurized-helium']);
  });

  it('treats a node with no incoming edges as fully unfed', () => {
    const s = usePlanStore.getState();
    s.addNode('ceramics', 'recipe_furnace_ceramics');
    const v2 = ALL_RECIPES.find(r => r.id === 'recipe_furnace-tier2_ceramics-v2')!;

    const preview = computeRecipeChangePreview(idFor('ceramics'), usePlanStore.getState().edges, v2);

    expect(preview.kept).toEqual([]);
    expect(preview.dropped).toEqual([]);
    expect(preview.unfed.sort()).toEqual(['calcite-sheets', 'helium-ore', 'wolfram-powder']);
  });
});

describe('planStore — autoLayout', () => {
  beforeEach(reset);

  it('orders multi-input producers to match the consumer\'s ingredient row order', () => {
    // recipe_crafter_rotor.inputs = [titanium-rod (row 0), wolfram-wire (row 1)].
    // Add the producers in the opposite order so a correct layout must reorder them.
    const s = usePlanStore.getState();
    s.addNode('rotor', 'recipe_crafter_rotor');
    s.addNode('wolfram-wire', 'recipe_crafter_wolfram-wire');
    s.addNode('titanium-rod', 'recipe_crafter_titanium-rod');
    s.connectNodes({ source: idFor('wolfram-wire'), target: idFor('rotor'), sourceHandle: null, targetHandle: 'wolfram-wire' });
    s.connectNodes({ source: idFor('titanium-rod'), target: idFor('rotor'), sourceHandle: null, targetHandle: 'titanium-rod' });

    s.autoLayout();

    expect(posFor(idFor('titanium-rod')).y).toBeLessThan(posFor(idFor('wolfram-wire')).y);
  });

  it("orders consumers to match a multi-output factory's output row order", () => {
    const factory: FactoryNodeType = {
      id: 'factory-1',
      type: 'factoryNode',
      position: { x: 0, y: 0 },
      data: {
        name: 'Factory',
        // out-a is row 0 (top), out-b is row 1 (bottom).
        inputs: [],
        outputs: [
          { id: 'out-a', itemId: 'titanium-bar' },
          { id: 'out-b', itemId: 'wolfram-bar' },
        ],
        inner: { nodes: [], edges: [] },
      },
    };
    const consumerA: ItemNodeType = {
      id: 'consumer-a',
      type: 'itemNode',
      position: { x: 300, y: 0 },
      data: { itemId: 'titanium-rod', recipeId: 'recipe_crafter_titanium-rod', isRaw: false },
    };
    const consumerB: ItemNodeType = {
      id: 'consumer-b',
      type: 'itemNode',
      position: { x: 300, y: 200 },
      data: { itemId: 'wolfram-wire', recipeId: 'recipe_crafter_wolfram-wire', isRaw: false },
    };
    // consumerB (fed by the bottom output row) is placed first, so a correct
    // layout must swap them to match output row order.
    const edges: Edge[] = [
      { id: 'e-b', source: factory.id, target: consumerB.id, sourceHandle: portNodeId('output', 'out-b'), targetHandle: 'wolfram-bar' },
      { id: 'e-a', source: factory.id, target: consumerA.id, sourceHandle: portNodeId('output', 'out-a'), targetHandle: 'titanium-bar' },
    ];
    usePlanStore.setState({
      rootGraph: { nodes: [factory, consumerB, consumerA], edges },
      viewPath: [],
      nodes: [factory, consumerB, consumerA],
      edges,
    });

    usePlanStore.getState().autoLayout();

    expect(posFor('consumer-a').y).toBeLessThan(posFor('consumer-b').y);
  });

  it('does not disturb a simple single-input chain', () => {
    const s = usePlanStore.getState();
    s.addNode('rotor', 'recipe_crafter_rotor');
    s.addNode('titanium-rod', 'recipe_crafter_titanium-rod');
    s.connectNodes({ source: idFor('titanium-rod'), target: idFor('rotor'), sourceHandle: null, targetHandle: 'titanium-rod' });

    s.autoLayout();

    const rotorPos = posFor(idFor('rotor'));
    const rodPos = posFor(idFor('titanium-rod'));
    expect(rodPos.x).toBeLessThan(rotorPos.x); // raw side stays left of the consumer
    expect(Number.isFinite(rotorPos.y)).toBe(true);
    expect(Number.isFinite(rodPos.y)).toBe(true);
  });

  it('terminates and produces finite positions on a cyclic edge graph', () => {
    const a: ItemNodeType = { id: 'a', type: 'itemNode', position: { x: 0, y: 0 }, data: { itemId: 'rotor', recipeId: null, isRaw: true } };
    const b: ItemNodeType = { id: 'b', type: 'itemNode', position: { x: 0, y: 0 }, data: { itemId: 'wolfram-wire', recipeId: null, isRaw: true } };
    const edges: Edge[] = [
      { id: 'e-ab', source: a.id, target: b.id, sourceHandle: null, targetHandle: 'wolfram-wire' },
      { id: 'e-ba', source: b.id, target: a.id, sourceHandle: null, targetHandle: 'rotor' },
    ];
    usePlanStore.setState({
      rootGraph: { nodes: [a, b], edges },
      viewPath: [],
      nodes: [a, b],
      edges,
    });

    usePlanStore.getState().autoLayout();

    for (const id of ['a', 'b']) {
      const pos = posFor(id);
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Number.isFinite(pos.y)).toBe(true);
    }
  });
});
