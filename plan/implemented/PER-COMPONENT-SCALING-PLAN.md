# Implementation Plan: Per-Component Balance Scaling

> Audience: an implementation agent with fresh context. Everything needed is in this doc plus the referenced files. Run tests with `npm test` (Vitest, single run) or `npm run test:watch`. Dev server: `npm run dev`.

## Context

**Bug report (verified against the code):** the user built two completely disconnected production chains, both ending in a Titanium Housing furnace — one chain using the V1 Titanium Sheet recipe, the other using V2 — each fed by its own titanium ore extractor supplying 120/min. The V2 chain only consumed 96 of its 120 available ore.

Root cause: the solver's demand propagation (Passes 1–2 in `src/engine/balanceGraph.ts`) is correctly per-node — all its maps (`byId`, `memo`, `outEdges`, `factoryCache`) are keyed by node id, and recipe ratios are always resolved from the consumer's own stored `recipeId` (never by output item), so V1/V2 recipes are never confused and disconnected trees never leak demand into each other. But **Pass 3 (`balanceGraph.ts:273-310`) computes ONE scale factor for the entire canvas**:

- It collects `hardLimit / relativeDemand` ratios from **every** limited node — top-level and inside factory containers via `visitFactory` — and takes `Math.min(...ratios)`. Every raw extractor node always carries a hard limit (`effectiveHardLimit` in `src/store/planStore.ts:459` returns the supply rate unconditionally for raw nodes), so any multi-tree canvas with raw sources is coupled through this minimum.
- With no limits anywhere, the fallback bottleneck normalization (`1/maxBuildings`) is likewise taken across **all** recipe nodes.

In the user's scenario: both trees anchor their furnace at 1 building; the V1-sheet tree needs more ore per anchored building, so its `120/demand` ratio is the smaller one and becomes the global scale. The V2 tree is then scaled by the *V1 tree's* factor: `120 × (V2 ore demand / V1 ore demand) = 96/min`. The 96/120 = 80% is exactly the V2 recipe's efficiency advantage applied in the wrong place.

**Fix:** compute the Pass-3 scale **per weakly-connected component** of the top-level graph, so disconnected trees balance independently — each against its own limits, or its own bottleneck when unlimited. Within any single connected graph, behavior is byte-for-byte unchanged.

**Scope: `src/engine/balanceGraph.ts` and its test file only.** Confirmed no store/UI changes are needed: `planStore.writeBalance` (line 473), `src/lib/scopedTotals.ts`, and `src/engine/rawResources.ts` (`rawSupplyInfo`) all consume results strictly per node and make no single-global-scale assumption. The `AnyBalanceResult` record shape is unchanged.

## Core insight (verified against the code)

The relative solution is linear, and disconnected components are already independent after Pass 2 — the only coupling point is the single `scale` variable. So the fix is: partition nodes into components (undirected BFS over the edges), bucket the existing ratio/bottleneck computations by component, and look up the scale per node in the output loop. Two-line change in the output loop; the ratio-collection loop is restructured but its per-node logic is verbatim.

Notes:

- A **factory node is a single vertex** in the component graph. Its inner graph is solved separately (`normalize: false`, `factoryCache`); inner nodes never appear in the component map. Inner hard limits (collected recursively by `visitFactory`) are attributed to the **factory node's outer component** — this preserves the existing "limit inside a factory constrains the parent" semantics, now scoped to the factory's component.
- The `normalize: false` path (factory inner solves, `balanceGraph.ts:197-200`) must not change: skip component computation entirely when `normalize` is false and use scale 1, exactly as today.
- `markBinding` (`balanceGraph.ts:353`) needs **no code change**: it compares each node's scaled `outputRatePerMin` against its own `hardLimitPerMin`. With per-component scales, each component's binding node(s) sit exactly at their limit — the flag becomes *more* correct (previously a limited node in tree B could never be binding if tree A had the tighter ratio; now each tree reports its own binding constraint).

## Changes

### 1. Engine — `src/engine/balanceGraph.ts`

**1a. New module-level helper** (place next to `scaleResult`, around line 146):

```ts
/**
 * Partition nodes into weakly-connected components of the top-level graph.
 * Edges whose endpoints are not both present are ignored (same guard as the
 * outEdges construction). Isolated nodes get their own component. Factory
 * nodes are single vertices; their inner nodes are not part of this graph.
 */
function computeComponents(
  nodes: BalanceNodeInput[],
  edges: BalanceEdge[],
): Map<string, number> {
  const ids = new Set(nodes.map(n => n.id));
  const adj = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    const list = adj.get(a);
    if (list) list.push(b);
    else adj.set(a, [b]);
  };
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    link(e.source, e.target);
    link(e.target, e.source);
  }
  const componentOf = new Map<string, number>();
  let nextId = 0;
  for (const n of nodes) {
    if (componentOf.has(n.id)) continue;
    const compId = nextId++;
    const stack = [n.id]; // iterative DFS — no recursion-depth risk
    componentOf.set(n.id, compId);
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const nb of adj.get(cur) ?? []) {
        if (!componentOf.has(nb)) {
          componentOf.set(nb, compId);
          stack.push(nb);
        }
      }
    }
  }
  return componentOf;
}
```

**1b. Replace Pass 3** (`balanceGraph.ts:273-310`, the `let scale = 1; if (normalize) { ... }` block):

```ts
// Pass 3: scale each weakly-connected component by its own factor.
let componentOf: Map<string, number> | null = null;
const componentScale = new Map<number, number>();
if (normalize) {
  componentOf = computeComponents(nodes, edges);

  // Hard limits: cap each component's scale so no limited node exceeds its max.
  const ratiosByComp = new Map<number, number[]>();
  const pushRatio = (comp: number, ratio: number) => {
    const list = ratiosByComp.get(comp);
    if (list) list.push(ratio);
    else ratiosByComp.set(comp, [ratio]);
  };
  // A factory's inner limits belong to the factory node's outer component.
  const visitFactory = (comp: number, def: FactoryDef, fr: FactoryBalanceResult) => {
    for (const m of def.inner.nodes) {
      const r = fr.inner[m.id];
      if (!r) continue;
      if ('isFactory' in r) { if (m.factory) visitFactory(comp, m.factory, r); continue; }
      if (m.hardLimit != null && m.hardLimit > 0 && r.outputRatePerMin > 0)
        pushRatio(comp, m.hardLimit / r.outputRatePerMin);
    }
  };
  for (const n of nodes) {
    const comp = componentOf.get(n.id)!;
    if (kindOf(n) === 'factory') {
      const fr = factoryCache.get(n.id);
      if (fr && n.factory) visitFactory(comp, n.factory, fr);
      continue;
    }
    const rel = demand(n.id); // memoized above — free
    if (n.hardLimit != null && n.hardLimit > 0 && rel > 0) pushRatio(comp, n.hardLimit / rel);
  }

  // No limits in a component: normalize it to its own bottleneck.
  const maxBuildingsByComp = new Map<number, number>();
  for (const n of nodes) {
    const recipe = recipeForNode(n);
    if (!recipe) continue;
    const comp = componentOf.get(n.id)!;
    const bc = demand(n.id) / recipe.outputRatePerMin;
    if (bc > (maxBuildingsByComp.get(comp) ?? 0)) maxBuildingsByComp.set(comp, bc);
  }

  for (const comp of new Set(componentOf.values())) {
    const ratios = ratiosByComp.get(comp);
    if (ratios && ratios.length > 0) {
      componentScale.set(comp, Math.min(...ratios)); // may be > 1: scale UP to the max
    } else {
      const mb = maxBuildingsByComp.get(comp) ?? 0;
      componentScale.set(comp, mb > 0 ? 1 / mb : 1);
    }
  }
}

const scaleFor = (id: string): number =>
  componentOf ? (componentScale.get(componentOf.get(id)!) ?? 1) : 1;
```

Semantics preserved from today, now per component: `min(ratios)` may scale UP past 1 building; a component whose only limited nodes have zero relative demand falls back to bottleneck normalization; a component with no recipe nodes at all gets scale 1.

**1c. Output loop** (`balanceGraph.ts:312-346`) — two-line change, everything else verbatim:

- Line 315: `out[n.id] = scaleResult(factoryCache.get(n.id)!, scaleFor(n.id));`
- Line 319: `const scaledDemand = demand(n.id) * scaleFor(n.id);`

**1d. Doc comments:**

- File header, Pass 3 description (lines 9–14): rewrite to — *"Pass 3 — scale each weakly-connected component of the graph by its own factor: if any node in the component carries a hard limit, scale so the component's most restrictive limit is hit exactly (may scale UP or DOWN); otherwise bottleneck-normalize the component so its most-demanded node becomes exactly 1 building. Disconnected trees on the canvas therefore balance independently."*
- Factory paragraph (lines 22–24): *"Hard limits on inner factory nodes constrain that same global scale factor"* → *"constrain the scale of the factory node's component"*.
- `BalanceResult.isLimitBinding` comment (lines 92–93): *"the binding constraint(s) on the global scale"* → *"the binding constraint(s) on its component's scale"*.

### 2. No changes anywhere else

- `src/store/planStore.ts` — `rebalanceRoot` (line 495), `toBalanceNode` (line 465), `writeBalance` (line 473): pure per-node plumbing; untouched.
- `src/engine/rawResources.ts` — `rawSupplyInfo` reads per-node results; its binding/surplus display becomes more accurate for free.
- `src/lib/scopedTotals.ts` — sums per-node rates; unaffected.
- Import/export — no serialized shape changes.

## Tests — `src/engine/balanceGraph.test.ts`

**Existing tests: all must stay green with zero edits.** Every existing fixture is a single connected component (per-component scale ≡ global scale), except:

- `'limit on a disconnected/zero-demand node is ignored → falls back to normalization'` (line 383): still passes as-is. The orphan raw node becomes its own component; its relative demand is 0 so the `rel > 0` guard skips its ratio; its component has no recipe nodes so it gets scale 1 and rate 0; `isLimitBinding` stays falsy (the `markBinding` guard requires `outputRatePerMin > 0`). The a/b component independently normalizes to `b = 1, a = 0.2` exactly as asserted.
- The cycle test: a pure cycle yields 0 demand everywhere (cycle guard) → no ratios, `bc = 0` → scale 1 in its component; identical to today.

**New `describe('balanceGraph — disconnected components')`**, reusing the existing `A`/`B` recipes and `abNodes`/`abEdges` helpers from the hard-limits block (`balanceGraph.test.ts:319-332`) plus the rotor fixture recipes (`RECIPES`, line 43):

1. **Two disconnected limited chains scale independently (the reported bug).** Two copies of the a/b chain with distinct node ids (`a1/b1`, `a2/b2`), `b1.hardLimit = 120`, `b2.hardLimit = 10`, edges only within each pair. Assert:
   - `b1.outputRatePerMin ≈ 120` and `b2.outputRatePerMin ≈ 10` (neither dragged by the other's ratio — under the old code both would scale by `min(12, 1) = 1` giving `b1 = 10`),
   - `b1.isLimitBinding === true` **and** `b2.isLimitBinding === true` (each component has its own binding constraint),
   - `a1.outputRatePerMin ≈ 120`, `a2.outputRatePerMin ≈ 10` (consumers follow their own component).
2. **Limited chain + unlimited chain.** Rotor fixture (`n_rotor/n_wire/n_rod/n_ore`, ore `hardLimit: 10` — copy the fixture from the `'raw-node limit constrains its consumers'` test at line 366) alongside a disconnected a/b chain with no limits. Assert the ore still binds at exactly 10 with `isLimitBinding === true`, while the a/b chain bottleneck-normalizes on its own: `b.buildingCountExact ≈ 1`, `a.buildingCountExact ≈ 0.2` (old code would have applied the ore's ratio to a/b as well).
3. **Isolated recipe node keeps 1 building.** a/b chain with `b.hardLimit = 1` (scale 0.1 in that component) plus an isolated node `c` using recipe `rB` with no edges. Assert `c.buildingCountExact ≈ 1` and `c.outputRatePerMin ≈ 2` (its own component, anchored and normalized to itself).
4. **Factory inner limit stays scoped to its component.** Reuse the `'limit inside a factory constrains the parent'` fixture (line 395: factory `F` with inner `i_bar` `hardLimit: 10` feeding `n_asm`) plus a disconnected a/b chain (no limits). Assert `n_asm.buildingCountExact ≈ 0.5` and `fr.inner['i_bar'].outputRatePerMin ≈ 10` (unchanged), **and** the a/b chain still normalizes to `b = 1, a = 0.2`.
5. **Two unlimited disconnected chains each normalize to their own bottleneck.** a/b chain (bottleneck `b`, K=5) plus the 3-node rotor chain (no raw, no limits; bottleneck is the rotor itself, K=1). Assert `b.buildingCountExact ≈ 1` **and** `n_rotor.buildingCountExact ≈ 1` — under the old code the shared `1/maxBuildings = 1/5` would give the rotor 0.2 buildings.

## Sequencing & Verification

1. Add `computeComponents`; replace Pass 3; swap the two `scale` uses in the output loop for `scaleFor(n.id)`; update the three doc comments.
2. `npx vitest run src/engine/balanceGraph.test.ts` — the existing suite must be green **with zero test-file edits** before adding new tests (proves single-component behavior is unchanged).
3. Add the 5 new tests; run the engine suite again.
4. Full gates: `npm test`, `npm run lint`, `npm run build` (store/factory/UI tests must be untouched and green).
5. Manual (`npm run dev`): recreate the user's scenario — two separate trees ore → bar → beam/sheet → housing, one with the V1 sheet recipe and one with V2, each with its own titanium ore extractor at 120/min. Expect: **both** ore nodes read 120/120 consumed and show as binding; each housing node's output reflects its own chain's efficiency (the V2 chain now out-produces the V1 chain instead of being scaled to 96/120 ore). Also spot-check that a single connected plan (e.g. any previously saved plan) produces identical numbers to before.

> Line numbers reference the code as of commit `23abf44`; treat them as anchors, not gospel — verify against the current file when editing.
