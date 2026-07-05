import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { usePlanStore, findValidationIssues, type ItemNodeType } from './planStore.ts';
import { useUiStore } from './uiStore.ts';
import { useSettingsStore } from './settingsStore.ts';
import { PREREQ_STEP_DELAY_MS } from '../lib/prereqTree.ts';

const itemNodes = () =>
  usePlanStore.getState().nodes.filter(n => n.type === 'itemNode') as ItemNodeType[];
const nodeFor = (itemId: string) => itemNodes().find(n => n.data.itemId === itemId)!;

// comp_rotor's full V1 chain is 7 nodes / 6 internal edges (see prereqTree.test.ts).
const CHAIN_SIZE = 7;

async function runToCompletion() {
  await vi.advanceTimersByTimeAsync(PREREQ_STEP_DELAY_MS * CHAIN_SIZE);
}

beforeEach(() => {
  vi.useFakeTimers();
  usePlanStore.setState({ rootGraph: { nodes: [], edges: [] }, viewPath: [], nodes: [], edges: [] });
  useSettingsStore.setState({ machineTiers: {} });
  useUiStore.setState({ prereqRun: null, sidebarOpen: true, sidebarWasOpen: false });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('addPrerequisiteTree', () => {
  it('builds the whole chain, fully wired, with live balances', async () => {
    usePlanStore.getState().addPrerequisiteTree('comp_rotor', 'recipe_comp_rotor', { x: 0, y: 0 });

    // The root step commits synchronously before the first delay.
    expect(itemNodes()).toHaveLength(1);
    expect(useUiStore.getState().prereqRun).toEqual({ done: 1, total: CHAIN_SIZE });

    await runToCompletion();

    const { nodes, edges } = usePlanStore.getState();
    expect(itemNodes()).toHaveLength(CHAIN_SIZE);
    expect(edges).toHaveLength(CHAIN_SIZE - 1);
    // Every recipe input is fed and every extractor connected — nothing dangling.
    expect(findValidationIssues(nodes, edges)).toEqual([]);
    // Balance propagated through the chain (the network scales up to the raw
    // extractors' supply cap): each rotor/min consumes 2 wire/min.
    const rotorRate = nodeFor('comp_rotor').data.balance?.outputRatePerMin ?? 0;
    expect(rotorRate).toBeGreaterThan(0);
    expect(nodeFor('wire_wolfram').data.balance?.outputRatePerMin).toBeCloseTo(2 * rotorRate);
    // Raw leaves got extractor configs.
    expect(nodeFor('ore_titanium').data.isRaw).toBe(true);
    expect(nodeFor('ore_titanium').data.rawConfig).toEqual({ purity: 'normal', extractorVersion: 'V1' });
  });

  it('locks the sidebar during the run and restores it afterwards', async () => {
    expect(useUiStore.getState().sidebarOpen).toBe(true);
    usePlanStore.getState().addPrerequisiteTree('comp_rotor', 'recipe_comp_rotor', { x: 0, y: 0 });

    expect(useUiStore.getState().sidebarOpen).toBe(false);
    expect(useUiStore.getState().prereqRun).not.toBeNull();

    await runToCompletion();

    expect(useUiStore.getState().prereqRun).toBeNull();
    expect(useUiStore.getState().sidebarOpen).toBe(true);
  });

  it('wires the root to the drag-create origin without touching other pre-existing nodes', async () => {
    const s = usePlanStore.getState();
    s.addNode('comp_rotor', 'recipe_comp_rotor', { x: 400, y: 0 });
    const rotorId = nodeFor('comp_rotor').id;
    const rotorPos = { ...nodeFor('comp_rotor').position };

    // Drag off the rotor's wire_wolfram input handle → add wire_wolfram with prerequisites.
    usePlanStore.setState({
      pendingConnect: { fromNodeId: rotorId, fromHandleId: 'wire_wolfram', fromHandleType: 'target' },
    });
    usePlanStore.getState().addPrerequisiteTree('wire_wolfram', 'recipe_wire_wolfram', { x: 0, y: 0 });
    await runToCompletion();

    // wire → ingot_wolfram → ore_wolfram, plus the external root edge into the rotor.
    expect(itemNodes()).toHaveLength(4);
    const { edges } = usePlanStore.getState();
    expect(edges).toHaveLength(3);
    const rootEdge = edges.find(e => e.target === rotorId);
    expect(rootEdge?.source).toBe(nodeFor('wire_wolfram').id);
    expect(rootEdge?.targetHandle).toBe('wire_wolfram');
    // The pre-existing node was not moved and gained no other connections.
    expect(nodeFor('comp_rotor').position).toEqual(rotorPos);
    expect(edges.filter(e => e.source === rotorId || e.target === rotorId)).toHaveLength(1);
  });

  it('does not reuse pre-existing producers of the same item', async () => {
    const s = usePlanStore.getState();
    s.addNode('ingot_wolfram', 'recipe_ingot_wolfram', { x: 800, y: 800 });
    expect(itemNodes()).toHaveLength(1);

    usePlanStore.getState().addPrerequisiteTree('comp_rotor', 'recipe_comp_rotor', { x: 0, y: 0 });
    await runToCompletion();

    // The chain created its OWN ingot_wolfram — the old one is untouched and unconnected.
    expect(itemNodes().filter(n => n.data.itemId === 'ingot_wolfram')).toHaveLength(2);
    const old = itemNodes().find(n => n.data.itemId === 'ingot_wolfram' && n.position.x === 800)!;
    expect(usePlanStore.getState().edges.some(e => e.source === old.id || e.target === old.id)).toBe(false);
  });
});
