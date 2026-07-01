# Screen-Pinned Factory Ports — Implementation Plan

## Goal

When viewing a factory's inner graph, the factory's **input ports should always sit at the
middle of the left edge of the screen** and the **output ports at the middle of the right
edge**, regardless of panning/zooming. Today the ports are placed at fixed *flow* coordinates
(x = ±360), so they end up in the middle of the sub-factory's layout and get in the way.

## Investigation result (context for the implementer)

**Verdict: screen-pinning is possible and is the recommended approach.** React Flow
(`@xyflow/react` v12.11, the graph library in use) has no native "viewport-fixed node", but
edges can only connect *nodes*, so the ports must remain nodes. The standard community
pattern is to **re-derive the pinned nodes' flow positions from the viewport on every
pan/zoom**, using `useOnViewportChange` + `screenToFlowPosition` (both confirmed available
in the installed version). With only a handful of port nodes this is cheap.

Key facts about the current architecture that make this easy:

- Port nodes are **synthesized, non-persisted** view nodes. `synthesizePorts()` in
  [src/store/planStore.ts](../src/store/planStore.ts) (~line 181) creates them during
  `project()`; `stripPortNodes()` removes them before anything is written back to
  `rootGraph`. So changing how their positions are computed has **zero persistence impact**
  — no migration of saved plans needed.
- Inner edges reference the port **node ids** (`portNodeId(side, portId)`) directly as
  `source`/`target`. Pinning does not touch edge shape, so the balance engine
  (`buildFactoryDef` in planStore, `balanceGraph.ts`) is untouched.
- The canvas re-fits via `fitView` in `App.tsx` keyed on `layoutTick`.

Known trade-offs of the pinning approach (all acceptable):

1. **Ports scale with zoom** like every other node. They stay *anchored* at the screen
   edges but grow/shrink as you zoom. Do NOT try to counter-scale them with
   `transform: scale(1/zoom)` — it breaks React Flow's handle-position measurement.
2. **One-frame lag during pan/zoom**: the ports' positions update via React state after the
   viewport transform, so they trail the pan by a frame. This is the accepted behavior of
   this pattern and looks fine in practice.
3. `fitView` must **exclude port nodes**, otherwise fit and pinning chase each other.

## Implementation steps

### 1. Store: make port nodes non-draggable and add a cheap position setter

In [src/store/planStore.ts](../src/store/planStore.ts):

- In `synthesizePorts()`, add `draggable: false` to the synthesized node (alongside the
  existing `deletable: false`). Keep the current ±360 default positions as the pre-pin
  fallback (they're overwritten immediately on mount).
- Export the `isPortNode` helper (currently module-private) — the pinning hook and the
  fitView exclusion both need it.
- Add a lightweight action that updates **only the view's port node positions** without
  rebalancing or writing `rootGraph` (it runs on every pan frame; the existing `setNodes`
  writes `rootGraph` each call, which would be wasteful churn):

```ts
setPortPositions: (positions: Record<string, { x: number; y: number }>) => void;
// implementation
setPortPositions(positions) {
  set(state => ({
    nodes: state.nodes.map(n => positions[n.id] ? { ...n, position: positions[n.id] } : n),
  }));
},
```

### 2. Pure geometry helper (unit-testable)

Add `computePinnedPortPositions()` — in planStore.ts or a small new module. Inputs: the
current port node ids per side (in order), the canvas size in px, and a
`screenToFlowPosition`-converted pair of anchor points. Suggested shape:

```ts
const EDGE_PAD_PX = 24;        // screen-px gap from the canvas edge
const PORT_W = 120;            // matches w-[120px] in PortNode.tsx
const PORT_ROW_H = 90;         // existing constant — vertical spacing in FLOW units

// Anchors (screen space):  left  = { x: EDGE_PAD_PX,          y: canvasH / 2 }
//                          right = { x: canvasW - EDGE_PAD_PX, y: canvasH / 2 }
// Convert both to flow space with screenToFlowPosition, then stack ports around the
// anchor with FLOW-unit offsets so spacing scales consistently with node size:
//   input  i: { x: leftFlow.x,             y: leftFlow.y  + (i - (nIn  - 1) / 2) * PORT_ROW_H }
//   output i: { x: rightFlow.x - PORT_W,   y: rightFlow.y + (i - (nOut - 1) / 2) * PORT_ROW_H }
```

(`position` is the node's top-left; subtracting `PORT_W` on the right side right-aligns the
output nodes. Node dimensions are already in flow units, so no zoom factor is needed.)

Keep the function pure — take the two converted flow anchors as parameters so tests don't
need React Flow.

### 3. Pinning hook, mounted inside `Flow`

New hook (e.g. `usePinnedPorts()` in `src/components/` or `src/lib/`), used inside the
`Flow` component in [src/App.tsx](../src/App.tsx):

- Read `nodes`, `viewPath`, and `setPortPositions` from the store; get
  `screenToFlowPosition` from `useReactFlow()`.
- Extract a `reposition()` callback that: finds the port nodes in the current view, measures
  the canvas (`document.querySelector('.react-flow')` bounds, or better: a ref on the
  wrapper div that already exists in `Flow`), computes positions via the helper, and calls
  `setPortPositions`. Skip entirely when there are no port nodes (root view).
- Trigger `reposition()`:
  - on every viewport change: `useOnViewportChange({ onChange: reposition })`;
  - in a `useEffect` on `[viewPath, portCount, layoutTick]` (covers entering a factory,
    adding/removing ports, and post-fitView settling — note `fitView` animates for 400ms,
    but each animation frame fires `onViewportChange`, so the ports track it);
  - on window resize (`resize` listener or `ResizeObserver` on the wrapper).
- Guard against loops: `setPortPositions` must not bump `layoutTick` or touch `rootGraph`
  (step 1's implementation guarantees this).

### 4. Exclude ports from fitView

In `Flow` ([src/App.tsx](../src/App.tsx) ~line 50), fit only the real nodes so the fit
target doesn't include nodes that will immediately re-pin:

```ts
useEffect(() => {
  const real = nodes.filter(n => !isPortNode(n));
  fitView({ duration: 400, padding: 0.15, nodes: real.length ? real : undefined });
}, [layoutTick, fitView]);
```

(v12 `fitView` accepts `nodes: [{ id }]`. Careful with the effect deps: keep the dep array
`[layoutTick, fitView]` and read `nodes` via `usePlanStore.getState()` or a ref inside the
effect — adding `nodes` to the deps would re-fit on every drag.)

Empty factory edge case: a freshly-created factory has no real nodes; fall back to fitting
everything (the `real.length ? … : undefined` above) or skip the fit.

### 5. Sanity-check interactions (no code expected, verify manually)

- Drag-to-create from a port handle (`onConnectEnd` in App.tsx) — unchanged, ports keep
  their ids and handles.
- `autoLayout()` only lays out real nodes (`layoutNodes(g.nodes, …)`) — already ignores
  ports. After auto-layout, `layoutTick` bumps → fitView (excluding ports) → ports re-pin. ✔
- MiniMap will show ports moving as you pan — cosmetic, acceptable.
- PortConfigDialog / add-port buttons in Breadcrumb — unchanged; new ports appear pinned on
  the next reposition (covered by the portCount effect).

### 6. Tests

- Unit-test `computePinnedPortPositions()`: centering of 1/2/3 ports around the anchor,
  right-alignment of outputs, empty sides.
- Store test: synthesized port nodes have `draggable: false`; `setPortPositions` updates
  view node positions without touching `rootGraph` (compare reference before/after).
- Run `npm test` and `npm run lint`; verify manually with `npm run dev` — enter a factory,
  pan/zoom, add ports, auto-layout, navigate in/out.

## Fallback option (NOT chosen — implement only if pinning proves unacceptable in practice)

Collapse all inputs into **one "Inputs" hub node** (multiple source handles, one per port)
and all outputs into one "Outputs" hub node, freely draggable. This was investigated and is
feasible but strictly more invasive, which is why pinning is preferred:

- Inner edges currently use per-port **node ids** as endpoints. Hub nodes would move that
  to `hub node id + handle id`, requiring (a) a migration of persisted plans' inner edges,
  and (b) a translation layer in `buildFactoryDef`/`toBalanceEdge` (the engine finds an
  output port's producer via `e.target === handleId`).
- Hub node positions would need persistence on `FactoryNodeData` (new fields), touching the
  snapshot format.
- Port click-to-configure UX must be reworked into per-row click targets inside the hub.

If ever needed: keep handle ids equal to the old port node ids (`portNodeId(...)`) and
translate edge endpoints on load, so the balance engine can stay unchanged.
