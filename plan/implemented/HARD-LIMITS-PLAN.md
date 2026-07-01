# Implementation Plan: Hard Limits + Custom Extractor Mode

> Audience: an implementation agent with fresh context. Everything needed is in this doc plus the referenced files. Run tests with `npm test` (Vitest, single run) or `npm run test:watch`. Dev server: `npm run dev`.

## Context

The planner balances the network by anchoring end products at 1 building and normalizing to the bottleneck (three-pass solver in `src/engine/balanceGraph.ts`). There is currently no way to say "this node can produce at most X/min". This feature adds **hard limits** (max items/min) on any item node — production or raw, at any nesting depth, but **not** on factory wrapper nodes. The network then scales (up *or* down) to maximize throughput without exceeding any limit; the most restrictive limit is the binding factor, and the UI highlights which one it is. Primary use case: cap the raw resource nodes at their real extractor supply and read off the maximum achievable final output, then see which raw resource to extend.

Raw nodes additionally get a **custom extractor mode**: instead of purity × V1/V2, a single user-entered aggregate rate (e.g. "two impure + one normal cluster with V1 extractors = 240/min" pooled as one node).

Requirements confirmed with the user:
- Production nodes: optional, nullable, **clearable** numeric items/min limit field.
- Raw nodes: hard limit is a **toggle**; when enabled the limit value **is** the configured supply rate (`calcSupplyRate`, including custom mode). Changing purity/version/custom rate automatically moves the limit.
- Zero limits set → current behavior (bottleneck-normalize to 1 building) must be byte-for-byte unchanged.
- One limit set → whole network scales to exactly hit it. Several → never exceed any; most restrictive wins.
- Limits apply everywhere, **including inside factory inner graphs** (they constrain the global scale through the factory's linear scaling).
- Import/export: breaking changes allowed (beta, single user). In practice no serializer changes are needed — node `data` is persisted verbatim.

## Core insight (verified against the code)

The whole balance is **linear in the single `scale` factor** of Pass 3 (`src/engine/balanceGraph.ts:262-272`). Hard limits replace Pass 3 at the root (`normalize: true`) solve:

1. Solve the relative solution exactly as today (demand recursion + demand-driven factory inner solves).
2. Collect ratios `limit / relativeRate` for every limited node with relative rate > 0 — including factory inner nodes, recursively. `factoryCache` stores **pre-scaling** results (inner solves run with `normalize: false`, i.e. scale 1), so inner rates are directly usable as the relative solution.
3. If any ratios exist: `scale = Math.min(...ratios)` — may be > 1 (scaling UP to hit the max is intended). Otherwise: existing bottleneck normalization, verbatim.
4. Inner (`normalize: false`) solves never apply limit scaling — exactly one global scale.

Note: the header comment at `balanceGraph.ts:27` suggests `anchors` as the substrate for limits, but anchors force a demand *base* that consumers add to (line 245), not a *cap* — a new `hardLimit` input field is the right mechanism. Update the header comment (lines 6-11 and 24-27) to describe the limit-capped Pass 3.

Pre-existing limitation (leave unchanged): scaling is uniform — there is no load redistribution between parallel producers of the same ingredient (`demandOnEdge` charges each edge the full ingredient demand). The custom aggregate mode exists precisely so parallel extractors become one node.

## Changes

### 1. Types — `src/engine/types.ts`

Extend `RawResourceConfig` (all new fields optional, so `DEFAULT_RAW_CONFIG` and existing snapshots stay valid):

```ts
export type ExtractorMode = 'calculated' | 'custom';

export interface RawResourceConfig {
  purity: ResourcePurity;
  extractorVersion: ExtractorVersion;
  /** 'custom' = user-entered aggregate rate; absent/'calculated' = purity × version. */
  mode?: ExtractorMode;
  /** Total items/min for the whole extractor cluster; used when mode === 'custom'. */
  customRatePerMin?: number;
  /** When true, the node's supply rate is a hard limit on the whole network. */
  limitEnabled?: boolean;
}
```

### 2. Engine — `src/engine/balanceGraph.ts`

- `BalanceNodeInput` (line 52): add `hardLimit?: number` — max items/min for this node's output.
- `BalanceResult` (line 77): add
  - `hardLimitPerMin?: number` — echo of the node's effective limit, for display. Absolute value: `scaleResult` spreads `...r` and does not touch it, which is correct (limits don't scale).
  - `isLimitBinding?: boolean` — true iff this limit is (one of) the binding constraint(s) on the global scale.
- Output loop (lines 283-305): stamp `hardLimitPerMin: n.hardLimit` on **both** the raw result and the recipe result. This runs in inner solves too, so factory inner nodes carry their limit for display.
- **Replace Pass 3** (lines 262-272):

```ts
let scale = 1;
if (normalize) {
  // Hard limits: cap the global scale so no limited node exceeds its max.
  const ratios: number[] = [];
  const visitFactory = (def: FactoryDef, fr: FactoryBalanceResult) => {
    for (const m of def.inner.nodes) {
      const r = fr.inner[m.id];
      if (!r) continue;
      if ('isFactory' in r) { if (m.factory) visitFactory(m.factory, r); continue; }
      if (m.hardLimit != null && m.hardLimit > 0 && r.outputRatePerMin > 0)
        ratios.push(m.hardLimit / r.outputRatePerMin);
    }
  };
  for (const n of nodes) {
    if (kindOf(n) === 'factory') {
      const fr = factoryCache.get(n.id);
      if (fr && n.factory) visitFactory(n.factory, fr);
      continue;
    }
    const rel = demand(n.id); // memoized by the loop above Pass 3 — free
    if (n.hardLimit != null && n.hardLimit > 0 && rel > 0) ratios.push(n.hardLimit / rel);
  }

  if (ratios.length > 0) {
    scale = Math.min(...ratios); // may be > 1: scale UP to the max
  } else {
    // existing bottleneck normalization — keep lines 264-271 verbatim
  }
}
```

- **Mark binding limits** after the output loop (after line 307), root/normalized solves only:

```ts
if (normalize) markBinding(out);

function markBinding(res: Record<string, AnyBalanceResult>) {
  for (const r of Object.values(res)) {
    if ('isFactory' in r) { markBinding(r.inner); continue; }
    if (r.hardLimitPerMin != null && r.outputRatePerMin > 0)
      r.isLimitBinding = r.outputRatePerMin >= r.hardLimitPerMin * (1 - 1e-9);
  }
}
```

Because `scale = min(ratios)`, no node ever exceeds its limit; a node is binding iff its final rate equals its limit (relative epsilon for float noise). Ties → all tied nodes marked binding (desired). Mutation is safe even when `scaleResult` short-circuits at `k === 1` (returning the cached object): `factoryCache` is call-local and discarded when `balanceGraph` returns.

Edge cases this shape covers (test them all — see Tests):
- Zero-demand/disconnected limited node: `rel === 0` → skipped; if it was the only limit, `ratios` is empty → falls back to bottleneck normalization.
- Non-positive limits ignored (defensive; the store also filters).
- Cycles: cycle guard (line 234) yields 0 demand → skipped, no NaN/Infinity.
- Unset factory ports: no anchor → inner rates 0 → skipped.
- Anchors: only used in `normalize: false` solves, where limit scaling doesn't apply — no interaction.

### 3. Raw rates — `src/engine/rawResources.ts`

`calcSupplyRate` (line 35) — **signature unchanged**, so the existing call sites (`src/components/ItemNode.tsx:25`, `src/components/NodeConfigDialog.tsx:41`) keep working:

```ts
export function calcSupplyRate(itemId: string, config: RawResourceConfig): number {
  if (config.mode === 'custom') return config.customRatePerMin ?? 0;
  return baseRateForItem(itemId) * PURITY_MULT[config.purity] * VERSION_MULT[config.extractorVersion];
}
```

`DEFAULT_RAW_CONFIG` unchanged (new fields absent ⇒ calculated mode, limit off).

### 4. Store — `src/store/planStore.ts`

- `ItemNodeData` (line 24): add `hardLimitPerMin?: number` — production nodes only; raw nodes derive their limit from `rawConfig.limitEnabled`.
- New helper (extend the `rawResources.ts` import at line 4 with `calcSupplyRate`):

```ts
function effectiveHardLimit(d: ItemNodeData): number | undefined {
  if (d.isRaw) {
    const cfg = d.rawConfig ?? DEFAULT_RAW_CONFIG;
    return cfg.limitEnabled ? calcSupplyRate(d.itemId, cfg) : undefined;
  }
  return typeof d.hardLimitPerMin === 'number' && d.hardLimitPerMin > 0
    ? d.hardLimitPerMin
    : undefined;
}
```

- `toBalanceNode` (lines 280-285): add `hardLimit: effectiveHardLimit(n.data)` to the item branch. This single change covers root nodes **and** factory inner nodes at any depth (`buildFactoryDef` at line 262 maps inner nodes through `toBalanceNode`); the synthesized input-port raw nodes (lines 257-261) correctly get no limit.
- New action `setNodeHardLimit(id: string, limit: number | null)` in `PlanState` (near line 114) and implemented next to `setNodeRawConfig` (line 712), same `commitViewedGraph` pattern — stores `limit ?? undefined` on `data.hardLimitPerMin`. Works inside factory views for free.
- Raw toggle and custom mode need **no new actions**: `setNodeRawConfig(id, { limitEnabled: true })` and `setNodeRawConfig(id, { mode: 'custom', customRatePerMin: 480 })` already type-check via `Partial<RawResourceConfig>` and trigger rebalance.
- `writeBalance` (line 288): no change — the new result fields flow through into `data.balance`, including factory `inner` recursion.

### 5. UI

**`src/components/NodeConfigDialog.tsx`**
- Add `setNodeHardLimit` to the store selectors (near line 27).
- Raw section (`data.isRaw` block, lines 49-84):
  - Mode selector (Calculated / Custom) → `setNodeRawConfig(node.id, { mode })`. Calculated → show the existing purity/version grid (lines 51-76); Custom → replace the grid with one number input for `customRatePerMin` (`value={rawConfig.customRatePerMin ?? ''}` for clearability). The existing supply-rate line (lines 77-83) needs no change — `calcSupplyRate` now handles custom mode.
  - Checkbox "Limit network to this supply ({supplyRate}/min max)" → `setNodeRawConfig(node.id, { limitEnabled: checked })`, checked = `!!rawConfig.limitEnabled`.
- Production section (the `recipe && (...)` block, lines 86-103): number input "Max output (items/min) — blank = unlimited"; `value={data.hardLimitPerMin ?? ''}`; empty/NaN/0 → `setNodeHardLimit(node.id, null)`, otherwise the positive number.
- Both sections: when `balance?.isLimitBinding`, show a small note ("This limit is the binding constraint on the network").

**`src/components/ItemNode.tsx`**
- Limit badge next to the rate line (production branch lines 64-68, raw branch 69-75) when `balance?.hardLimitPerMin != null`: e.g. `≤120` — muted/slate when slack, amber + emphasized (and/or an amber ring on the card) when `balance.isLimitBinding`. The binding indicator is the key affordance ("which raw resource do I extend?").
- Machine label (line 55): custom mode shows `(custom)` instead of the V2 suffix.
- Raw supply/surplus display (lines 24-27, 69-75): no change — a binding raw limit reads `+0` surplus, which is correct.

### 6. Import/export — no code change

`buildSnapshot` (`src/components/PersistenceBar.tsx:21`) exports `rootGraph.nodes` verbatim, so all new fields serialize inside node `data`. `parseSnapshot` (lines 53-71) is shape-only validation — new fields pass through; `loadPlan` → `rebalanceRoot` applies limits immediately on import. Old snapshots still load (all new fields optional). Dexie schema (`src/db/db.ts`) needs no bump.

## Tests

Follow the existing fixture/helper patterns in each file.

**`src/engine/balanceGraph.test.ts`** — new `describe('balanceGraph — hard limits')`, reusing the rotor, A/B, and factory fixtures:
1. No limits → normalization unchanged (regression; all existing tests must also stay green).
2. Scales DOWN to a production limit — A/B fixture, `hardLimit: 1` on `b` (relative demand 10) → scale 0.1; assert `b.outputRatePerMin ≈ 1`, `a.outputRatePerMin ≈ 1`, `b.isLimitBinding === true`, `b.hardLimitPerMin === 1`.
3. Scales UP past 1 building — `hardLimit: 20` on `b` → `b.buildingCountExact ≈ 10`, `a.buildingCountExact ≈ 2`, `b.isLimitBinding === true`.
4. Most restrictive of several limits wins; only it is binding — limits on `a` (ratio 3) and `b` (ratio 1): scale follows `b`; `a.isLimitBinding === false`, `a.outputRatePerMin` below its limit.
5. Equal ratios → both marked binding.
6. Raw-node limit constrains its consumers (rotor fixture's `n_ore` raw node with `hardLimit`).
7. Limit on a disconnected/zero-demand node is ignored → falls back to normalization; orphan's `isLimitBinding` falsy.
8. Limit inside a factory constrains the parent — bar-factory fixture, `hardLimit: 10` on inner `i_bar` (relative 20): `n_asm.buildingCountExact ≈ 0.5`, `n_asm.outputRatePerMin ≈ 5`, `fr.inner['i_bar'].outputRatePerMin ≈ 10` with `isLimitBinding === true`, `fr.inputPorts[0].ratePerMin ≈ 10`.
9. Limit two factories deep — nested F→G fixture (lines 238-280), `hardLimit: 10` on `g_smelt` (relative 20 → scale 0.5): `n_asm` halves; `frG.inner['g_smelt'].isLimitBinding === true`.
10. Inner solves don't apply limit scaling — `balanceGraph([i_bar], [], FAC_RECIPES, { anchors: { i_bar: 200 }, normalize: false })` with `hardLimit: 50`: `outputRatePerMin ≈ 200` (anchor wins), `hardLimitPerMin === 50`, `isLimitBinding` not `true`.
11. Cycle containing a limited node → finite results, no NaN.

**New `src/engine/rawResources.test.ts`**:
12. Custom mode returns `customRatePerMin`; custom with missing rate returns 0; calculated mode unchanged (purity × version table).

**`src/store/planStore.test.ts`** — new describe (real `recipes.json`, existing `idFor`/`balanceFor` helpers):
13. `setNodeHardLimit` caps the network — rotor+wire connected; limit 10 on wire (unlimited demand 20/min at rotor=1) → `balanceFor('comp_rotor').outputRatePerMin ≈ 5`; wire balance has `hardLimitPerMin === 10`, `isLimitBinding === true`.
14. `setNodeHardLimit(null)` clears — rotor back to `buildingCountExact ≈ 1`, `hardLimitPerMin` undefined.
15. Raw `limitEnabled` uses `calcSupplyRate` — **use an `ingot_wolfram` raw node** (an `ore_wolfram` node would be rejected by edge handle validation at `planStore.ts:367`); connect to wire, enable limit: 120/min (normal × V1) vs relative demand 10 → rotor scales up to ≈ 120/min.
16. Changing purity while `limitEnabled` moves the limit — `{ purity: 'pure' }` → rotor ≈ 240/min.
17. Custom mode drives both supply and limit — `{ mode: 'custom', customRatePerMin: 30, limitEnabled: true }` → rotor ≈ 30/min; then `{ customRatePerMin: 60 }` → ≈ 60/min.
18. `limitEnabled` false/absent with a custom rate set → normalization behavior unchanged.

**`src/store/factory.test.ts`**:
19. Limited node inside a factory scales the root through the store — build a factory (pattern at lines 100-119), call `setNodeHardLimit` on the inner node while viewing the factory; assert the root consumer's balance scaled and the inner node's written-back `data.balance.isLimitBinding === true` (verifies `writeBalance` carries the new fields).

## Sequencing & Verification

1. `types.ts` + `rawResources.ts` + rawResources tests.
2. `balanceGraph.ts` engine changes + engine tests.
3. `planStore.ts` (`effectiveHardLimit`, `toBalanceNode`, `setNodeHardLimit`) + store/factory tests.
4. UI: `NodeConfigDialog.tsx`, `ItemNode.tsx`.
5. `npm test` — all existing + new tests green. `npx tsc --noEmit` (or the build) for type safety.
6. Manual (`npm run dev`): build a rotor chain with a raw node; enable its limit; confirm the end-product rate follows purity/version/custom changes and the binding badge highlights; add a second, tighter limit and confirm it takes over and becomes the binding one; export → import round-trip preserves limits; check a limit set inside a factory constrains the root.

> Line numbers reference the code as of commit `1c3e66f`; treat them as anchors, not gospel — verify against the current file when editing.
