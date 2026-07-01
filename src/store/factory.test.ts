import { describe, it, expect, beforeEach } from 'vitest';
import {
  usePlanStore,
  isFactoryNode,
  isItemNode,
  portNodeId,
  handleItemId,
  type FactoryNodeType,
} from './planStore.ts';

const reset = () =>
  usePlanStore.setState({ rootGraph: { nodes: [], edges: [] }, viewPath: [], nodes: [], edges: [] });

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
    expect(fac[0].data.inputs).toHaveLength(0);
    expect(fac[0].data.outputs).toHaveLength(0);
    expect(fac[0].data.inner).toEqual({ nodes: [], edges: [] });
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
    get().addInputPort('wire_wolfram');
    get().addOutputPort('comp_rotor');

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
    const portId = get().addInputPort('wire_wolfram');
    get().addNode('comp_rotor', 'recipe_comp_rotor', { x: 100, y: 0 });
    const rotorId = get().rootGraph.nodes
      .find(isFactoryNode)!.data.inner.nodes.find(n => n.type === 'itemNode')!.id;

    get().connectNodes({
      source: portNodeId('input', portId),
      target: rotorId,
      sourceHandle: null,
      targetHandle: 'wire_wolfram',
    });

    const inner = factoryAt([id]).data.inner;
    expect(inner.nodes.filter(n => n.type === 'itemNode')).toHaveLength(1); // ports are NOT persisted
    expect(inner.edges).toHaveLength(1);
    expect(inner.edges[0].source).toBe(portNodeId('input', portId));
  });

  it('an unset input port inherits the item it is connected to feed', () => {
    get().addFactoryNode({ x: 0, y: 0 });
    const id = firstFactoryId();
    get().enterFactory(id);
    const portId = get().addInputPort(); // unset
    expect(factoryAt([id]).data.inputs[0].itemId).toBeNull();

    get().addNode('comp_rotor', 'recipe_comp_rotor', { x: 100, y: 0 });
    const rotorId = factoryAt([id]).data.inner.nodes.find(n => n.type === 'itemNode')!.id;

    // Drag the unset port to the rotor's wire_wolfram ingredient handle.
    get().connectNodes({
      source: portNodeId('input', portId),
      target: rotorId,
      sourceHandle: null,
      targetHandle: 'wire_wolfram',
    });

    expect(factoryAt([id]).data.inputs[0].itemId).toBe('wire_wolfram');
    expect(factoryAt([id]).data.inner.edges).toHaveLength(1);
  });

  it('an unset output port inherits the item it is connected to receive', () => {
    get().addFactoryNode({ x: 0, y: 0 });
    const id = firstFactoryId();
    get().enterFactory(id);
    const portId = get().addOutputPort(); // unset

    get().addNode('comp_rotor', 'recipe_comp_rotor', { x: 0, y: 0 });
    const rotorId = factoryAt([id]).data.inner.nodes.find(n => n.type === 'itemNode')!.id;

    // The rotor producer feeds the unset output port.
    get().connectNodes({
      source: rotorId,
      target: portNodeId('output', portId),
      sourceHandle: null,
      targetHandle: null,
    });

    expect(factoryAt([id]).data.outputs[0].itemId).toBe('comp_rotor');
    expect(factoryAt([id]).data.inner.edges).toHaveLength(1);
  });

  it('removePort drops the port and its inner edges', () => {
    get().addFactoryNode({ x: 0, y: 0 });
    const id = firstFactoryId();
    get().enterFactory(id);
    const portId = get().addInputPort('wire_wolfram');
    get().addNode('comp_rotor', 'recipe_comp_rotor');
    const rotorId = factoryAt([id]).data.inner.nodes.find(n => n.type === 'itemNode')!.id;
    get().connectNodes({ source: portNodeId('input', portId), target: rotorId, sourceHandle: null, targetHandle: 'wire_wolfram' });
    expect(factoryAt([id]).data.inner.edges).toHaveLength(1);

    get().removePort(portId);
    expect(factoryAt([id]).data.inputs).toHaveLength(0);
    expect(factoryAt([id]).data.inner.edges).toHaveLength(0);
  });

  it('setPortItem prunes now-mismatched inner edges', () => {
    get().addFactoryNode({ x: 0, y: 0 });
    const id = firstFactoryId();
    get().enterFactory(id);
    const portId = get().addInputPort('wire_wolfram');
    get().addNode('comp_rotor', 'recipe_comp_rotor');
    const rotorId = factoryAt([id]).data.inner.nodes.find(n => n.type === 'itemNode')!.id;
    get().connectNodes({ source: portNodeId('input', portId), target: rotorId, sourceHandle: null, targetHandle: 'wire_wolfram' });
    expect(factoryAt([id]).data.inner.edges).toHaveLength(1);

    // Changing the port item to something the rotor doesn't accept on that handle invalidates the edge.
    get().setPortItem(portId, 'rod_titanium');
    expect(factoryAt([id]).data.inner.edges).toHaveLength(0);
  });

  it('resolves a factory port handle to its item (drag-to-create seeding from the outer view)', () => {
    get().addFactoryNode({ x: 0, y: 0 });
    const id = firstFactoryId();
    get().enterFactory(id);
    const inPortId = get().addInputPort('wire_wolfram');
    const outPortId = get().addOutputPort('comp_rotor');
    get().exitTo(0); // back to the root view, where the factory node lives

    const facNode = get().nodes.find(isFactoryNode)!;
    // Input handle is a target (factory consumes wire_wolfram from outside).
    expect(handleItemId(facNode, portNodeId('input', inPortId), 'target')).toBe('wire_wolfram');
    // Output handle is a source (factory emits comp_rotor to outside).
    expect(handleItemId(facNode, portNodeId('output', outPortId), 'source')).toBe('comp_rotor');
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
    get().addNode('wire_wolfram', null); // raw
    const extractorId = get().rootGraph.nodes.find(n => n.type === 'itemNode')!.id;
    get().addFactoryNode({ x: 200, y: 0 });
    const facId = get().rootGraph.nodes.find(isFactoryNode)!.id;
    get().enterFactory(facId);
    const portId = get().addInputPort('wire_wolfram');
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

    get().addNode('comp_rotor', 'recipe_comp_rotor');
    const deepInner = factoryAt([outerId]).data.inner.nodes.find(n => n.id === innerId) as FactoryNodeType;
    expect(deepInner.data.inner.nodes.filter(n => n.type === 'itemNode')).toHaveLength(1);
  });

  it('drag-to-create seeds exactly one matching port and auto-connects', () => {
    // A consumer that needs wire_wolfram; drag off its input handle to create a producing factory.
    get().addNode('comp_rotor', 'recipe_comp_rotor');
    const rotorId = get().rootGraph.nodes.find(n => n.type === 'itemNode')!.id;
    get().openAddDialog({
      pending: { fromNodeId: rotorId, fromHandleId: 'wire_wolfram', fromHandleType: 'target' },
    });
    get().addFactoryNode({ x: 0, y: 0 });

    const fac = get().rootGraph.nodes.find(isFactoryNode)!;
    expect(fac.data.outputs).toHaveLength(1);
    expect(fac.data.outputs[0].itemId).toBe('wire_wolfram');
    expect(fac.data.inputs).toHaveLength(0);

    const edge = get().rootGraph.edges.find(e => e.source === fac.id && e.target === rotorId);
    expect(edge).toBeTruthy();
    expect(edge!.targetHandle).toBe('wire_wolfram');
  });

  it('a hard limit on an inner node scales the root through the store', () => {
    // root: a factory producing wire_wolfram, feeding a rotor consumer.
    get().addFactoryNode({ x: 0, y: 0 });
    const facId = firstFactoryId();
    get().enterFactory(facId);
    const outPortId = get().addOutputPort('wire_wolfram');
    get().addNode('wire_wolfram', 'recipe_wire_wolfram', { x: 0, y: 0 });
    const wireId = factoryAt([facId]).data.inner.nodes.find(n => n.type === 'itemNode')!.id;
    get().connectNodes({
      source: wireId,
      target: portNodeId('output', outPortId),
      sourceHandle: null,
      targetHandle: null,
    });
    get().exitTo(0);
    get().addNode('comp_rotor', 'recipe_comp_rotor', { x: 200, y: 0 });
    const rotorId = get().rootGraph.nodes.find(n => n.type === 'itemNode')!.id;
    get().connectNodes({
      source: facId,
      target: rotorId,
      sourceHandle: portNodeId('output', outPortId),
      targetHandle: 'wire_wolfram',
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
});
