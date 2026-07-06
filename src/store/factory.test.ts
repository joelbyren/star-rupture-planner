import { describe, it, expect, beforeEach } from 'vitest';
import {
  usePlanStore,
  isFactoryNode,
  isItemNode,
  isPortNode,
  portNodeId,
  handleItemId,
  computePinnedPortPositions,
  type FactoryNodeType,
} from './planStore.ts';

const reset = () =>
  usePlanStore.setState({ rootGraph: { nodes: [], edges: [] }, viewPath: [], nodes: [], edges: [] });

/** Narrows a Record lookup for test assertions — throws with a clear message if the key is absent. */
function at<T>(record: Record<string, T>, key: string): T {
  const value = record[key];
  if (value === undefined) throw new Error(`Expected an entry for "${key}"`);
  return value;
}

const get = () => usePlanStore.getState();
const factoryAt = (path: string[]): FactoryNodeType => {
  let g = get().rootGraph;
  for (const id of path.slice(0, -1)) {
    g = (g.nodes.find(n => n.id === id) as FactoryNodeType).data.inner;
  }
  return g.nodes.find(n => n.id === path[path.length - 1]) as FactoryNodeType;
};
const firstFactoryId = (): string => get().rootGraph.nodes.find(isFactoryNode)!.id;

describe('factory nodes — navigation & ports', () => {
  beforeEach(reset);

  it('adds a factory node at the root with no ports', () => {
    get().addFactoryNode({ x: 0, y: 0 });
    const fac = get().rootGraph.nodes.filter(isFactoryNode);
    expect(fac).toHaveLength(1);
    const [f] = fac;
    if (!f) throw new Error('expected a factory node');
    expect(f.data.inputs).toHaveLength(0);
    expect(f.data.outputs).toHaveLength(0);
    expect(f.data.inner).toEqual({ nodes: [], edges: [] });
  });

  it('enters and exits a factory, projecting its inner graph', () => {
    get().addFactoryNode({ x: 0, y: 0 });
    const id = firstFactoryId();
    get().enterFactory(id);
    expect(get().viewPath).toEqual([id]);
    expect(get().nodes).toHaveLength(0); // empty inner, no ports yet

    get().exitTo(0);
    expect(get().viewPath).toEqual([]);
    expect(get().nodes.filter(isFactoryNode)).toHaveLength(1);
  });

  it('adds ports inside a factory and projects them as pinned port nodes', () => {
    get().addFactoryNode({ x: 0, y: 0 });
    const id = firstFactoryId();
    get().enterFactory(id);
    get().addInputPort('wolfram-wire');
    get().addOutputPort('rotor');

    const fac = factoryAt([id]);
    expect(fac.data.inputs).toHaveLength(1);
    expect(fac.data.outputs).toHaveLength(1);

    const portNodes = get().nodes.filter(n => n.type === 'inputPort' || n.type === 'outputPort');
    expect(portNodes).toHaveLength(2);
  });

  it('connects an input port to an inner node and persists the edge in the factory inner graph', () => {
    get().addFactoryNode({ x: 0, y: 0 });
    const id = firstFactoryId();
    get().enterFactory(id);
    const portId = get().addInputPort('wolfram-wire');
    get().addNode('rotor', 'recipe_crafter_rotor', { x: 100, y: 0 });
    const rotorId = get().rootGraph.nodes
      .find(isFactoryNode)!.data.inner.nodes.find(n => n.type === 'itemNode')!.id;

    get().connectNodes({
      source: portNodeId('input', portId),
      target: rotorId,
      sourceHandle: null,
      targetHandle: 'wolfram-wire',
    });

    const inner = factoryAt([id]).data.inner;
    expect(inner.nodes.filter(n => n.type === 'itemNode')).toHaveLength(1); // ports are NOT persisted
    expect(inner.edges).toHaveLength(1);
    const [edge0] = inner.edges;
    if (!edge0) throw new Error('expected an edge');
    expect(edge0.source).toBe(portNodeId('input', portId));
  });

  it('an unset input port inherits the item it is connected to feed', () => {
    get().addFactoryNode({ x: 0, y: 0 });
    const id = firstFactoryId();
    get().enterFactory(id);
    const portId = get().addInputPort(); // unset
    const [unsetInput] = factoryAt([id]).data.inputs;
    if (!unsetInput) throw new Error('expected an input port');
    expect(unsetInput.itemId).toBeNull();

    get().addNode('rotor', 'recipe_crafter_rotor', { x: 100, y: 0 });
    const rotorId = factoryAt([id]).data.inner.nodes.find(n => n.type === 'itemNode')!.id;

    // Drag the unset port to the rotor's wolfram-wire ingredient handle.
    get().connectNodes({
      source: portNodeId('input', portId),
      target: rotorId,
      sourceHandle: null,
      targetHandle: 'wolfram-wire',
    });

    const [connectedInput] = factoryAt([id]).data.inputs;
    if (!connectedInput) throw new Error('expected an input port');
    expect(connectedInput.itemId).toBe('wolfram-wire');
    expect(factoryAt([id]).data.inner.edges).toHaveLength(1);
  });

  it('an unset output port inherits the item it is connected to receive', () => {
    get().addFactoryNode({ x: 0, y: 0 });
    const id = firstFactoryId();
    get().enterFactory(id);
    const portId = get().addOutputPort(); // unset

    get().addNode('rotor', 'recipe_crafter_rotor', { x: 0, y: 0 });
    const rotorId = factoryAt([id]).data.inner.nodes.find(n => n.type === 'itemNode')!.id;

    // The rotor producer feeds the unset output port.
    get().connectNodes({
      source: rotorId,
      target: portNodeId('output', portId),
      sourceHandle: null,
      targetHandle: null,
    });

    const [connectedOutput] = factoryAt([id]).data.outputs;
    if (!connectedOutput) throw new Error('expected an output port');
    expect(connectedOutput.itemId).toBe('rotor');
    expect(factoryAt([id]).data.inner.edges).toHaveLength(1);
  });

  it('removePort drops the port and its inner edges', () => {
    get().addFactoryNode({ x: 0, y: 0 });
    const id = firstFactoryId();
    get().enterFactory(id);
    const portId = get().addInputPort('wolfram-wire');
    get().addNode('rotor', 'recipe_crafter_rotor');
    const rotorId = factoryAt([id]).data.inner.nodes.find(n => n.type === 'itemNode')!.id;
    get().connectNodes({ source: portNodeId('input', portId), target: rotorId, sourceHandle: null, targetHandle: 'wolfram-wire' });
    expect(factoryAt([id]).data.inner.edges).toHaveLength(1);

    get().removePort(portId);
    expect(factoryAt([id]).data.inputs).toHaveLength(0);
    expect(factoryAt([id]).data.inner.edges).toHaveLength(0);
  });

  it('setPortItem prunes now-mismatched inner edges', () => {
    get().addFactoryNode({ x: 0, y: 0 });
    const id = firstFactoryId();
    get().enterFactory(id);
    const portId = get().addInputPort('wolfram-wire');
    get().addNode('rotor', 'recipe_crafter_rotor');
    const rotorId = factoryAt([id]).data.inner.nodes.find(n => n.type === 'itemNode')!.id;
    get().connectNodes({ source: portNodeId('input', portId), target: rotorId, sourceHandle: null, targetHandle: 'wolfram-wire' });
    expect(factoryAt([id]).data.inner.edges).toHaveLength(1);

    // Changing the port item to something the rotor doesn't accept on that handle invalidates the edge.
    get().setPortItem(portId, 'titanium-rod');
    expect(factoryAt([id]).data.inner.edges).toHaveLength(0);
  });

  it('resolves a factory port handle to its item (drag-to-create seeding from the outer view)', () => {
    get().addFactoryNode({ x: 0, y: 0 });
    const id = firstFactoryId();
    get().enterFactory(id);
    const inPortId = get().addInputPort('wolfram-wire');
    const outPortId = get().addOutputPort('rotor');
    get().exitTo(0); // back to the root view, where the factory node lives

    const facNode = get().nodes.find(isFactoryNode)!;
    // Input handle is a target (factory consumes wolfram-wire from outside).
    expect(handleItemId(facNode, portNodeId('input', inPortId), 'target')).toBe('wolfram-wire');
    // Output handle is a source (factory emits rotor to outside).
    expect(handleItemId(facNode, portNodeId('output', outPortId), 'source')).toBe('rotor');
  });

  it('renameFactory updates the current factory name without moving the view', () => {
    get().addFactoryNode({ x: 0, y: 0 });
    const id = firstFactoryId();
    get().enterFactory(id);
    const tickBefore = get().layoutTick;

    get().renameFactory('Smelting');
    expect(factoryAt([id]).data.name).toBe('Smelting');
    expect(get().layoutTick).toBe(tickBefore); // rename must not trigger a re-fit
  });

  it('removeCurrentFactory deletes the open factory and exits to its parent', () => {
    get().addFactoryNode({ x: 0, y: 0 });
    const id = firstFactoryId();
    get().enterFactory(id);
    expect(get().viewPath).toEqual([id]);

    get().removeCurrentFactory();
    expect(get().viewPath).toEqual([]);
    expect(get().rootGraph.nodes.filter(isFactoryNode)).toHaveLength(0);
  });

  it('removeCurrentFactory drops the deleted factory\'s edges in the parent graph', () => {
    // root: an extractor feeding a factory's input port.
    get().addNode('wolfram-wire', null); // raw
    const extractorId = get().rootGraph.nodes.find(n => n.type === 'itemNode')!.id;
    get().addFactoryNode({ x: 200, y: 0 });
    const facId = get().rootGraph.nodes.find(isFactoryNode)!.id;
    get().enterFactory(facId);
    const portId = get().addInputPort('wolfram-wire');
    get().exitTo(0);
    get().connectNodes({
      source: extractorId,
      target: facId,
      sourceHandle: null,
      targetHandle: portNodeId('input', portId),
    });
    expect(get().rootGraph.edges).toHaveLength(1);

    get().enterFactory(facId);
    get().removeCurrentFactory();
    expect(get().rootGraph.nodes.filter(isFactoryNode)).toHaveLength(0);
    expect(get().rootGraph.edges).toHaveLength(0); // dangling edge removed
  });

  it('supports nested factories (depth >= 2) and writes back to the right place', () => {
    get().addFactoryNode({ x: 0, y: 0 });
    const outerId = firstFactoryId();
    get().enterFactory(outerId);
    get().addFactoryNode({ x: 0, y: 0 });
    const innerId = factoryAt([outerId]).data.inner.nodes.find(isFactoryNode)!.id;
    get().enterFactory(innerId);
    expect(get().viewPath).toEqual([outerId, innerId]);

    get().addNode('rotor', 'recipe_crafter_rotor');
    const deepInner = factoryAt([outerId]).data.inner.nodes.find(n => n.id === innerId) as FactoryNodeType;
    expect(deepInner.data.inner.nodes.filter(n => n.type === 'itemNode')).toHaveLength(1);
  });

  it('drag-to-create seeds exactly one matching port and auto-connects', () => {
    // A consumer that needs wolfram-wire; drag off its input handle to create a producing factory.
    get().addNode('rotor', 'recipe_crafter_rotor');
    const rotorId = get().rootGraph.nodes.find(n => n.type === 'itemNode')!.id;
    get().openAddDialog({
      pending: { fromNodeId: rotorId, fromHandleId: 'wolfram-wire', fromHandleType: 'target' },
    });
    get().addFactoryNode({ x: 0, y: 0 });

    const fac = get().rootGraph.nodes.find(isFactoryNode)!;
    expect(fac.data.outputs).toHaveLength(1);
    const [seededOutput] = fac.data.outputs;
    if (!seededOutput) throw new Error('expected an output port');
    expect(seededOutput.itemId).toBe('wolfram-wire');
    expect(fac.data.inputs).toHaveLength(0);

    const edge = get().rootGraph.edges.find(e => e.source === fac.id && e.target === rotorId);
    expect(edge).toBeTruthy();
    expect(edge!.targetHandle).toBe('wolfram-wire');
  });

  it('a hard limit on an inner node scales the root through the store', () => {
    // root: a factory producing wolfram-wire, feeding a rotor consumer.
    get().addFactoryNode({ x: 0, y: 0 });
    const facId = firstFactoryId();
    get().enterFactory(facId);
    const outPortId = get().addOutputPort('wolfram-wire');
    get().addNode('wolfram-wire', 'recipe_crafter_wolfram-wire', { x: 0, y: 0 });
    const wireId = factoryAt([facId]).data.inner.nodes.find(n => n.type === 'itemNode')!.id;
    get().connectNodes({
      source: wireId,
      target: portNodeId('output', outPortId),
      sourceHandle: null,
      targetHandle: null,
    });
    get().exitTo(0);
    get().addNode('rotor', 'recipe_crafter_rotor', { x: 200, y: 0 });
    const rotorId = get().rootGraph.nodes.find(n => n.type === 'itemNode')!.id;
    get().connectNodes({
      source: facId,
      target: rotorId,
      sourceHandle: portNodeId('output', outPortId),
      targetHandle: 'wolfram-wire',
    });

    // Rotor's unlimited demand on wire is 20/min; limiting the inner node to 10 halves the root.
    get().enterFactory(facId);
    get().setNodeHardLimit(wireId, 10);

    const rotorNode = get().rootGraph.nodes.find(n => n.id === rotorId);
    if (!isItemNode(rotorNode!)) throw new Error('expected item node');
    expect(rotorNode.data.balance?.outputRatePerMin).toBeCloseTo(5);

    const innerWire = factoryAt([facId]).data.inner.nodes.find(n => n.id === wireId);
    if (!isItemNode(innerWire!)) throw new Error('expected item node');
    expect(innerWire.data.balance?.isLimitBinding).toBe(true);
  });

  it('synthesized port nodes are non-draggable', () => {
    get().addFactoryNode({ x: 0, y: 0 });
    const id = firstFactoryId();
    get().enterFactory(id);
    get().addInputPort('wolfram-wire');

    const port = get().nodes.find(n => n.type === 'inputPort')!;
    expect(port.draggable).toBe(false);
  });

  it('setPortPositions moves only port nodes and never touches rootGraph', () => {
    get().addFactoryNode({ x: 0, y: 0 });
    const id = firstFactoryId();
    get().enterFactory(id);
    const portId = get().addInputPort('wolfram-wire');
    get().addNode('rotor', 'recipe_crafter_rotor', { x: 100, y: 0 });

    const rootBefore = get().rootGraph;
    const nodeId = portNodeId('input', portId);
    get().setPortPositions({ [nodeId]: { x: 42, y: 7 } });

    expect(get().rootGraph).toBe(rootBefore); // no rootGraph write
    const port = get().nodes.find(n => n.id === nodeId)!;
    expect(port.position).toEqual({ x: 42, y: 7 });
    const realNode = get().nodes.find(n => n.type === 'itemNode')!;
    expect(realNode.position).toEqual({ x: 100, y: 0 }); // untouched
  });
});

describe('computePinnedPortPositions', () => {
  const left = { x: -500, y: 0 };
  const right = { x: 500, y: 0 };

  it('centers a single port on each side around its anchor', () => {
    const pos = computePinnedPortPositions(['in1'], ['out1'], left, right);
    expect(pos['in1']).toEqual({ x: -500, y: 0 });
    expect(at(pos, 'out1').y).toBeCloseTo(0);
  });

  it('right-aligns outputs by subtracting the port width from the anchor', () => {
    const pos = computePinnedPortPositions([], ['out1'], left, right);
    expect(at(pos, 'out1').x).toBe(500 - 120);
  });

  it('stacks multiple ports symmetrically around the anchor y', () => {
    const pos = computePinnedPortPositions(['a', 'b', 'c'], [], left, right);
    expect(at(pos, 'b').y).toBeCloseTo(0); // middle of 3 sits on the anchor
    expect(at(pos, 'a').y).toBeLessThan(at(pos, 'b').y);
    expect(at(pos, 'c').y).toBeGreaterThan(at(pos, 'b').y);
    expect(at(pos, 'a').x).toBe(at(pos, 'c').x); // same column, left-aligned
  });

  it('produces no entries for an empty side', () => {
    const pos = computePinnedPortPositions([], [], left, right);
    expect(Object.keys(pos)).toHaveLength(0);
  });

  it('never returns positions for real nodes filtered out via isPortNode', () => {
    expect(isPortNode({ type: 'inputPort' })).toBe(true);
    expect(isPortNode({ type: 'outputPort' })).toBe(true);
    expect(isPortNode({ type: 'itemNode' })).toBe(false);
  });
});
