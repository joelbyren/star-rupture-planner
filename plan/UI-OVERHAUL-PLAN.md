# UI Overhaul: Three Switchable Themes, Sidebar Restructure, Power Summary, Note Nodes

Status: **approved, not started**. Implement in the stage order below; each stage is a coherent, independently verifiable chunk (roughly one commit/PR each).

## 1. Context & goal

The app currently has one hardcoded "plain" design — Tailwind slate/violet utility literals in every component, no theme system, no CSS variables of its own. Three HTML design mockups in `design-mockups/` were reviewed and chosen to REPLACE the plain design entirely:

- **blueprint** (`design-mockups/blueprint.html`) — cyanotype drafting-room: prussian blues, white ink lines, amber "chalk" handwriting
- **holotable** (`design-mockups/holotable.html`) — cyan hologram on near-black, hot-pink target accents, glow everywhere
- **terminal** (`design-mockups/terminal.html`) — amber phosphor CRT/SCADA, VT323 font, all-uppercase

The mockups are the styling reference — read them when implementing each theme; they contain the exact palettes, fonts, and CSS techniques to port. Alongside the reskin, the UI is restructured (sidebar absorbs top-bar controls), and three features are added: hover edge-highlighting with rate labels, a power-consumption summary (requires NEW game data), and per-node "scribble" notes.

## 2. User decisions (all confirmed — do not re-ask)

1. Only the three themes above; the plain design is removed. Theme choice persisted in `localStorage`; if none stored, pick one of the three **at random** on load (do not persist the random pick — only persist explicit user choice).
2. Theme switcher: compact control in the top bar, immediately left of the version number (three small labeled options, e.g. `BLPR / HOLO / TERM`, active one accented, styled per active theme).
3. Hovering a node highlights its input AND output edges with rate labels shown on the arrows; everything else (edges and unrelated nodes) dims. All three themes.
4. Per-theme edge rendering: blueprint = plain white bezier (one-shot draw-in OK, NO continuous animation); holotable = animated flowing dashes; terminal = orthogonal 90°-turn traces.
5. Sidebar ("mission brief") replaces most top-bar controls. Toggleable, **visible by default**, toggled by clicking the top-left icon. Sections in order: (a) actions, (b) persistence, (c) validation expander (only when issues exist), (d) total power, (e) raw intake summary. Inside a sub-factory the sidebar also shows that factory's input/output port rates, and power/intake are scoped to the current factory subtree.
6. Top bar reduced to: toggle icon + "StarRupture Planner" title + "orbital base" subtitle + editable plan name; breadcrumb centered when inside a factory; far right: theme switcher, then version number.
7. Power data: NEW file, per-machine consumption with V1/V2 variants for production buildings AND extractors/excavators; **all values 10 as placeholder** (user updates the real numbers later themself).
8. Node styling per theme: distinct raw / production / end-node-highlight styles. End-node highlight = production nodes only, never raw or factory nodes. Inside sub-factories, production nodes whose output does NOT reach the factory's output ports also count as end products and get the highlight.
9. Notes: attachable to raw + production (item) nodes only — **NOT factory nodes** (no dialog exists to add them from). Multiple notes per node. Created via an "Add note" button in NodeConfigDialog (opens a text dialog). Edited via double-click on the note (dialog with text + Delete button). Position locked relative to parent, max ~250px away; dragging the parent moves notes; deleting the parent deletes notes. Persisted in plan snapshots.
10. Remove blueprint's bottom-right engineering title block (`.titleblock` in the mockup) — do not port it. No machine-total/cost calculations anywhere.
11. Breadcrumb moves to top-bar center; factory actions (+input / +output / delete / rename) move from the current Breadcrumb overlay into the sidebar actions section.
12. Keep the existing limit-binding highlight concept, restyled per theme, visually distinct from the end-node treatment.

## 3. Current codebase orientation (verified 2026-07-02)

Stack: React 19 + TypeScript + Vite, Zustand, Tailwind CSS v4 (`@tailwindcss/vite`, imported in `src/index.css`), @xyflow/react (React Flow) v12, Dexie/IndexedDB, Vitest, oxlint. Version string comes from `package.json` (currently 0.3.1).

Key files:
- `src/App.tsx` — `Flow` component: `<ReactFlow colorMode="dark">` with `NODE_TYPES = {itemNode, factoryNode, inputPort, outputPort}`, `Background`/`Controls`/`MiniMap`, double-click handlers (pane → add dialog, factory → enter, item → config), connect-drag-to-pane → pre-seeded add dialog. Shell: `PersistenceBar` over the canvas; `Breadcrumb` is an absolute overlay inside the canvas wrapper.
- `src/components/PersistenceBar.tsx` — the current top bar: editable plan name, Add node, Auto layout, validation badge (`findMissingInputs` → hover tooltip), version, Save/Load/Export/Import (Dexie + JSON file, `parseSnapshot` validation, `alert()`s).
- `src/store/planStore.ts` — everything: `rootGraph: InnerGraph` authoritative, `viewPath: string[]` descends into `factoryNode.data.inner`, `commitViewedGraph`/`commitCurrentFactory` mutate → `rebalanceRoot` → `project()` into RF `nodes`/`edges`. `buildEdge` (validates item compatibility, one producer per input handle, sets `animated: true`, NO `type`), `portNodeId(side, portId)`, `synthesizePorts` (port nodes are synthesized, not persisted), `findMissingInputs`, `layoutNodes`, `buildFactoryDef`, `PlanSnapshot {planId, planName, nodes, edges}`.
- `src/engine/balanceGraph.ts` — pure engine; per-node `BalanceResult {buildingCountExact, buildingCount /*Math.ceil*/, outputRatePerMin, inputs: {itemId, neededPerMin}[], isRaw, isLimitBinding?}`; factories get `FactoryBalanceResult {isFactory, outputPorts, inputPorts (each {portId, itemId, ratePerMin}), inner: Record<id, result>}`. End products = nodes with no consumers, anchored at 1 building.
- `src/engine/rawResources.ts` — `calcSupplyRate`, `machineForResource` (Ore Extractor / Helium Extractor / Sulphur Extractor / Oil Pump), raw nodes carry `rawConfig {purity, version: 'V1'|'V2', ...}`.
- `src/components/ItemNode.tsx` / `FactoryNode.tsx` / `PortNode.tsx`, `src/lib/usePinnedPorts.ts` (screen-pins port nodes to canvas edges; listens to `window.resize` only), `src/lib/itemVisual.ts` (`TYPE_COLORS` item-type → Tailwind literal classes, `abbr()`), dialogs `AddNodeDialog/NodeConfigDialog/PortConfigDialog`, `ui/Modal`, `ui/Combobox`, `src/components/Breadcrumb.tsx` (path + inline factory rename + `+input/+output/Delete` buttons).
- Data: `src/data/items.json` (57 items; types Resource/Component/Fluid/Powder/Ammo/Weapon), `src/data/recipes.json` (49 recipes: `machine` name string, `buildingTier` always null, `outputRatePerMin`, outputs/inputs). Machines used: Fabricator, Furnace, Smelter, `"Chemicals at"` (a scrape artifact — keep the literal string as the join key), Refinery, Mega Press.
- **There is NO power data anywhere in the repo.**

Facts that shape the design (verified in code):
- `setNodes`/`setEdges` are COMMIT paths (mutate → full `rebalanceRoot` → re-project). Hover state must NEVER be written into the RF nodes/edges arrays.
- Persisted edges have no `type` → they render as RF `default`. Registering `edgeTypes={{ default: ThemedEdge }}` reskins every existing/imported edge with zero snapshot migration.
- Inner-graph edges to factory output ports are ordinary edges with `target === portNodeId('output', portId)` → "end product" is the same rule at every depth: item node, not raw, with no outgoing edge in its own graph.
- Raw nodes get `buildingCount: 0` from the engine, but `rawConfig.version` exists → treat a raw node as ONE extractor of that version for power.
- React Flow v12 `parentId` on a node gives parent-relative positioning and drag-with-parent for free. Parents must precede children in the nodes array. Do NOT use `extent: 'parent'` (that clamps INSIDE the parent — wrong for notes); clamp manually.
- `parseSnapshot` only validates planId/planName/nodes/edges shapes → old snapshots without notes import cleanly; snapshots with notes round-trip automatically.
- CSS layering gotcha: `@xyflow/react/dist/style.css` is unlayered; Tailwind v4 utilities live in `@layer utilities`; unlayered CSS wins regardless of order. All React-Flow-element overrides must be plain (unlayered) CSS in the theme files, not utility classes.

## 4. Mockup reference notes (what to port)

Read the mockup HTML files for exact values. Summary of what matters:

| | blueprint | holotable | terminal |
|---|---|---|---|
| Fonts (display/data/extra) | Big Shoulders Display / IBM Plex Mono / Caveat (handwriting) | Michroma / Chakra Petch | VT323 / IBM Plex Mono, all-uppercase |
| Core palette | papers #0a2440/#0e3358/#124070, ink #e9f3fc, chalk #ecc98b | void #020408, holo cyan #39d7ff, hot pink #ff4fd8 | bg #050705, amber #ffb000/#ffd254/#c98a10/#7a5a0e |
| Type colors (Resource/Component/Fluid/Powder) | #dce9f6 / #8fcdf0 / #7de9da / #ecc98b | #39d7ff / #59efb4 / #8f9dff / #ffc35c | #ffb000 / #5fe07a / #4fd4d4 / #d9c8a0 |
| Backdrop | grain (SVG feTurbulence data-URI) + creases + vignette; two-scale grid 24/120px | starfield ×2 (twinkle) + perspective holo-floor (masked grid) | CRT scanlines + vignette + breathing glow + flicker; 36px grid |
| Node chrome | 1px border + inner `::before` double-border + 4 corner tick marks | chamfered clip-path corners + scanline texture + cyan glow; one-shot sweep on materialize | 2px border + offset 1px `outline` double frame; solid amber header bar with black text; raw = dashed border |
| End-node ("target") | 2px solid ink border + glow + boxed "TARGET OUTPUT" callout with vertical leader line | switches to hot pink + animated corner reticle brackets + "TARGET LOCK" tag | full amber border + pulsing alarm box-shadow + blinking `▌` block cursor |
| Edges | soft-white bezier `stroke-width:1.25`, drafted chevron arrowhead, source stub-dot; midpoint dimension-tick + rate text (hover-revealed); one-shot dashoffset draw-in | two stacked paths: static base (cyan .22) + flow overlay `stroke-dasharray:5 11` marching dashoffset, speed scaled by rate; no arrowheads | orthogonal `M sx sy H midX V ty H tx` with per-source lane stagger `midX = sx + min(gap-10, 22 + lane*14 + (i%3)*4)`; static + marching-ants (`5 7`, 1.1s); 4×6 rect "pads" at endpoints, no arrowheads |
| Hover pattern (identical structure in all three) | container gets a has-hot class; connected edges get hot class (brighten + reveal rate label); everything else dims; unrelated nodes fade | same | same |
| Top-left icon | 30px bordered square + rotated inner square + center dot (registration mark) | none in mockup — INVENT: 30px chamfered square with four corner brackets + center dot, cyan glow (targeting-reticle motif) | solid amber block `SRP▌` with black text |
| Notes | Caveat ~19-21px in chalk, small rotation, no box | none — INVENT: translucent cyan "annotation chip": ghost bg, 1px dashed cyan border, small chamfer, Chakra Petch italic, tiny blinking dot | none — INVENT: boxless "operator log line": amber-dim VT323, prefix `* REM:`, dotted underline |

Do NOT port: blueprint's bottom-right title block, mockup "Machines/Buildings/Process nodes" plant-total rows (only power + raw intake are wanted), mockup read-only footers.

## 5. Architecture

### 5.1 Theme system
- `src/themes/tokens.css` — semantic token contract bridged into Tailwind v4 via `@theme inline`, e.g.:
  ```css
  @theme inline {
    --color-canvas: var(--sr-canvas);  --color-panel: var(--sr-panel);
    --color-ink: var(--sr-ink);        --color-ink-mid: var(--sr-ink-mid);
    --color-ink-dim: var(--sr-ink-dim);--color-line: var(--sr-line);
    --color-accent: var(--sr-accent);  --color-target: var(--sr-target);
    --color-danger: var(--sr-danger);
    --color-res: var(--sr-c-resource); --color-comp: var(--sr-c-component);
    --color-fluid: var(--sr-c-fluid);  --color-powder: var(--sr-c-powder);
    --font-disp: var(--sr-font-disp);  --font-data: var(--sr-font-data);
    --font-note: var(--sr-font-note);
  }
  ```
  `@theme inline` makes utilities like `bg-panel`, `text-ink-dim`, `font-disp` resolve to `var(--sr-*)` at use-site, so they re-resolve live when `data-theme` changes — no per-theme utility variants.
- `src/themes/blueprint.css` / `holotable.css` / `terminal.css` — each defines `[data-theme='X'] { --sr-*: ... }` (values from the mockups) PLUS all theme-specific structural CSS: backdrop layers, node chrome on the semantic class hooks, target treatment, edge classes, RF chrome overrides (`.react-flow__controls`, minimap, handles, selection, connection line), terminal's `text-transform: uppercase` (scope to display contexts; exempt inputs/textareas where confusing).
- `src/store/themeStore.ts` — zustand `{theme: 'blueprint'|'holotable'|'terminal', setTheme}`. Init: `localStorage.getItem('srp.theme')` if valid, else random pick (not persisted). `setTheme` persists. Effect sets `document.documentElement.dataset.theme` (on `<html>` so portals inherit).
- Fonts **self-hosted via `@fontsource`** (all six imported up front in `src/main.tsx` → no FOUT on theme switch): `@fontsource/big-shoulders-display` (400/600/700), `@fontsource/ibm-plex-mono` (400/500/600), `@fontsource/caveat` (500/600), `@fontsource/michroma` (400), `@fontsource/chakra-petch` (300/400/600), `@fontsource/vt323` (400).
- `src/components/ThemeBackdrop.tsx` — rendered once behind the flow; `inset-0 pointer-events-none` fixed layers, theme-scoped CSS (see table above). RF `<Background>` per theme: blueprint = two Background children (distinct `id`s) for the 24px/120px two-scale grid; terminal = one 36px lines Background; holotable = none (floor is the fixed backdrop). Remove `colorMode="dark"`.
- Component strategy: **one component per kind**, refactored from slate/violet literals to token utilities + stable semantic class hooks (`sr-node`, `sr-node--raw`, `sr-node--target`, `sr-node--factory`, `sr-node-head`, `sr-node-row`, `sr-badge`, `sr-panel`, `sr-section`, ...). ~90% of theme difference is pure CSS on those hooks. One `src/components/NodeChrome.tsx` switches on theme for the structural extras (blueprint corner ticks + TARGET OUTPUT callout; holotable reticle + TARGET LOCK tag; terminal alarm + blinking cursor).
- `src/lib/itemVisual.ts`: replace `TYPE_COLORS` Tailwind literals with semantic classes `sr-t-resource|component|fluid|powder|ammo|weapon|default`, colored per theme (invent Ammo/Weapon hues per theme — mockups omit them).
- Clip-paths/corner ticks go on an INNER wrapper div — no clipping on the node root, or RF `Handle`s and the ticks (which sit outside the border) get cut off.

### 5.2 Custom edges + hover
- `src/edges/ThemedEdge.tsx`, registered `edgeTypes={{ default: ThemedEdge }}` in `App.tsx`; reads theme and delegates to `BlueprintEdge` / `HoloEdge` / `TerminalEdge` (see mockup table for exact rendering). Blueprint arrowhead = SVG `<marker>` defined once in an `EdgeMarkerDefs` component (hidden `<svg><defs>` inside ReactFlow). Rate label = plain SVG `<text>` (+ blueprint's dimension tick) at the path midpoint (`labelX/labelY` from `getBezierPath`, or computed for the orthogonal path), rendered ONLY when the edge is hot.
- Terminal lane stagger: `src/edges/useEdgeLanes.ts` memoizes `Map<edgeId, {lane, i}>` from `usePlanStore(s => s.edges)` (group by `source` in array order); recomputes only on topology change. Don't use `getSmoothStepPath` — it centers midX and can't stagger.
- Drop `animated: true` in `buildEdge` (ThemedEdge replaces the rendering; harmless in old snapshots).
- Hover: new `src/store/uiStore.ts` with `hoveredNodeId: string|null` (+ `sidebarOpen`, dialog state for notes later). Set via RF `onNodeMouseEnter`/`onNodeMouseLeave` (fire per enter/leave, not per mousemove). Each edge subscribes with boolean selectors (`isHot = hovered && (hovered===source || hovered===target)`, `isDimmed = hovered !== null && !isHot`) → at most two re-renders per edge per hover cycle; CSS transitions do the fades. Nodes: dim class when someone else is hovered and this node is neither hovered nor adjacent (memoized neighbor `Set` per node from the edges array, `src/lib/useNeighbors.ts` or similar).
- `src/lib/edgeRates.ts` — `edgeRatePerMin(edge, nodes): number|null`, resolved from the consumer side: target itemNode → `balance.inputs.find(i => i.itemId === edge.targetHandle)?.neededPerMin`; target factoryNode → `balance.inputPorts` entry whose `portNodeId('input', portId) === edge.targetHandle`; target outputPort node (inside a factory) → viewed factory's `balance.outputPorts` rate for that portId (expose the viewed factory's balance via a planStore selector); fallback source-side inputPort → its `inputPorts` rate.
- `prefers-reduced-motion`: disable holo flow + terminal marching-ants continuous animations.

### 5.3 Layout restructure
- Move persistence logic (`buildSnapshot`, `parseSnapshot`, save/load/export/import handlers) from `PersistenceBar.tsx` to `src/lib/persistence.ts` unchanged; then delete `PersistenceBar.tsx`.
- `src/components/layout/TopBar.tsx`: `[MenuGlyph toggle] [title "StarRupture Planner" + subtitle "orbital base"] [editable plan name] ...center: [Breadcrumb when viewPath.length > 0]... [ThemeSwitcher] [v{version}]`. `MenuGlyph` switches per theme (see table; holotable's is invented — chamfered reticle).
- `src/components/layout/ThemeSwitcher.tsx`: three compact labeled options, token-styled.
- `src/components/layout/Breadcrumb.tsx` (rewrite of the current one): path segments + inline rename of the deepest crumb (keep existing draft/commit logic from the old component); NO action buttons; themed separators (`›` blueprint / chevron chips holotable / `▸` terminal).
- `src/components/layout/Sidebar.tsx` + `src/components/layout/sections/*`:
  1. `ActionsSection` — Add node, Auto layout; when inside a factory also + input port, + output port, Delete factory (reuse the confirm `Modal`).
  2. `PersistenceSection` — Save / Load / Export JSON / Import JSON.
  3. `ValidationSection` — rendered ONLY when `findMissingInputs(nodes, edges)` is non-empty; themed expander, count in header, expands to `item → consumer` rows. (Current per-view scoping is kept.)
  4. `PowerSection` — scoped total power (root = whole plan incl. all nested factories; inside a factory = that subtree).
  5. `RawIntakeSection` — raw rates aggregated over the scoped subtree (badge + name + rate/min rows like the mockups).
  6. `PortRatesSection` — only inside a factory: current factory's `balance.inputPorts` / `outputPorts` (item + rate/min).
- App shell: `TopBar` over horizontal flex `[Sidebar? | canvas]`. `sidebarOpen` default true, persisted `localStorage('srp.sidebar')`.
- `usePinnedPorts`: replace the `window.resize` listener with a `ResizeObserver` on `wrapperRef` so pinned ports track sidebar toggling.

### 5.4 Power
- `src/data/power.json`:
  ```json
  { "Fabricator": {"V1": 10, "V2": 10}, "Furnace": {"V1": 10, "V2": 10},
    "Smelter": {"V1": 10, "V2": 10}, "Chemicals at": {"V1": 10, "V2": 10},
    "Refinery": {"V1": 10, "V2": 10}, "Mega Press": {"V1": 10, "V2": 10},
    "Ore Extractor": {"V1": 10, "V2": 10}, "Helium Extractor": {"V1": 10, "V2": 10},
    "Sulphur Extractor": {"V1": 10, "V2": 10}, "Oil Pump": {"V1": 10, "V2": 10} }
  ```
  Keyed by machine display name (the only join key recipes/rawResources expose; `"Chemicals at"` is a known scrape artifact — keep it, comment in the loader). Type `MachinePower = Record<string, {V1: number, V2: number}>` in `src/engine/types.ts`.
- `src/engine/power.ts` (pure, unit-tested): `machinePower(machine, tier)` (unknown machine → 0 + one dev warning); `graphPower(nodes)` — recursive: production node → `balance.buildingCount × machinePower(recipe.machine, recipe.buildingTier ?? 'V1')` (buildingTier is always null today ⇒ V1 default; seam ready for real tier data); raw node → `1 × machinePower(machineForResource(itemId), rawConfig.version ?? 'V1')` (custom-rate raw nodes count as 1 extractor — note the limitation); factory node → recurse `data.inner.nodes`; note/port nodes → 0. Engine must not import the store — accept a minimal structural node type.
- Store helper `selectScopedNodes(rootGraph, viewPath)` (root nodes at `[]`, else the viewed factory's `inner.nodes`; `graphPower` recurses from there) feeds `PowerSection`.

### 5.5 End-product highlight
- `src/lib/endProducts.ts`: `computeEndProductIds(nodes, edges): Set<string>` = item nodes with `!data.isRaw` and no edge having `source === node.id`. Same rule at root and inside factories. Annotate `data.isEndProduct` on item nodes during `project()` in the store (recomputed every commit/navigation, negligible cost); `NodeChrome` renders the per-theme target treatment from it. Restyle limit-binding per theme, distinct from target (e.g. blueprint chalk ring / holotable amber edge glow / terminal inverse-video header).

### 5.6 Notes ("scribbles")
- New persisted RF node type `noteNode` living in `InnerGraph.nodes` with `parentId` = owning item node id. `NoteNodeData = { text: string }`. No handles, `draggable: true`, spawn at parent-relative ~`{x: 40, y: -70}`.
- `planStore.ts` integration (all small):
  - `AnyNode = ItemNodeType | FactoryNodeType | NoteNodeType`; `isNoteNode` guard.
  - Filter notes out of `balanceTree` input in `rebalanceRoot` (the engine's `writeBalance` returns unknown nodes unchanged), out of `findMissingInputs`, and out of `layoutNodes` ranking (their parent-relative position makes them follow the laid-out parent automatically).
  - `removeNode(id)`: cascade-delete nodes with `parentId === id`.
  - Ordering invariant (RF: parents before children): `addNote` appends (fine); add defensive `sortParentsFirst(nodes)` in `project()` for hand-edited imports.
  - Distance clamp in `setNodes` (a real position commit): for each noteNode, if `|position| > 250` scale the vector to length 250 (parent-relative → pure local math).
  - Actions: `addNote(parentId, text)`, `updateNoteText(id, text)`; reuse `removeNode` for delete.
- `src/components/NoteNode.tsx` (register in `NODE_TYPES`), one component, per-theme CSS (see mockup table row "Notes"). Max-width ~200px.
- `src/components/NoteDialog.tsx`: textarea + Save; edit mode adds Delete. Dialog state `noteDialog: {mode:'create', parentId} | {mode:'edit', noteId} | null` in uiStore.
- Wire-up: "Add note" button in `NodeConfigDialog` (it already only opens for item nodes); `onNodeDoubleClick` in `App.tsx` gets a `noteNode` case → edit dialog.
- Persistence: rides in snapshots automatically; pre-notes snapshots import cleanly (verified `parseSnapshot` tolerance).

## 6. Stages

Verify each stage with `npm run test`, `npm run lint`, and a manual smoke in `npm run dev`.

**Stage 1 — Theme foundation (no visual redesign yet).** `themeStore.ts` (random default + localStorage), `tokens.css`, three theme CSS files (token values + backdrop layers only), `ThemeBackdrop.tsx`, @fontsource deps + imports, `data-theme` wiring, a TEMPORARY switcher dropped into the existing PersistenceBar, remove `colorMode="dark"`, base RF chrome overrides.
*Verify:* switching swaps background/overlays/fonts live; cleared localStorage → random theme per hard refresh; explicit pick persists; app otherwise fully functional (slate nodes on themed backdrops is the accepted interim state).

**Stage 2 — Layout restructure.** `lib/persistence.ts`, `TopBar` + `MenuGlyph` + `ThemeSwitcher` (final position), `Sidebar` with sections 1/2/3/5/6 (power placeholder or omitted until Stage 5), Breadcrumb rewrite into top-bar center, factory actions into sidebar, delete `PersistenceBar.tsx`, sidebar toggle + ResizeObserver in `usePinnedPorts`.
*Verify:* every relocated function works (save/load + export→import round-trip, add node, auto layout, factory rename/+input/+output/delete-with-confirm); validation expander appears only with missing inputs and lists them; toggling the sidebar keeps pinned port nodes glued to the visible canvas edges.

**Stage 3 — Node + chrome theming.** Refactor `ItemNode`/`FactoryNode`/`PortNode` + dialogs (`Modal`, `Combobox`, `AddNodeDialog`, `NodeConfigDialog`, `PortConfigDialog`) + Sidebar/TopBar internals from slate/violet literals to tokens + semantic class hooks; `itemVisual.ts` → `sr-t-*` classes; per-theme node CSS for raw/production/factory/port variants; `NodeChrome.tsx`; `isEndProduct` annotation in `project()` + per-theme target treatment; limit-binding restyle; minimap/controls/handles themed.
*Verify:* all node kinds visually distinct in all three themes; end-product highlight on unconsumed production nodes at root AND inside factories (node not wired to an output port), never on raw/factory nodes; limit-binding highlight still visible and distinct.

**Stage 4 — Custom edges + hover system.** `uiStore.hoveredNodeId` + `onNodeMouseEnter/Leave`, `src/edges/` (ThemedEdge + three renderers + EdgeMarkerDefs + useEdgeLanes), `lib/edgeRates.ts`, dim/hot classes on nodes + edges, hover rate labels, rate-scaled holo dash speed, drop `animated:true` in `buildEdge`, reduced-motion guards.
*Verify:* hovering any node highlights its edges with rate labels and dims the rest, in all three themes; an OLD exported plan JSON imports and renders themed edges; drag-connect still works; terminal parallel traces from one source don't overlap; React DevTools profiler shows only touched edges/nodes re-render on hover.

**Stage 5 — Power.** `data/power.json` (all 10s), `engine/power.ts` + unit tests (production node, raw V1/V2 extractor, nested factories recursion, ceil counts, unknown machine → 0), `PowerSection` root + factory-scoped.
*Verify:* tests pass; sidebar total equals a hand-computed Σ ceil(buildingCount) × 10 including nested factories; entering a factory scopes the number to its subtree.

**Stage 6 — Notes.** Store/type changes (union, guards, engine/validation/layout filters, cascade delete, 250px clamp in `setNodes`, `sortParentsFirst`), `addNote`/`updateNoteText`, `NoteNode.tsx` + per-theme styles, `NoteDialog.tsx`, NodeConfigDialog "Add note" button, double-click-to-edit, store tests (snapshot round-trip with notes, pre-notes snapshot import, cascade delete, clamp).
*Verify:* create/edit/delete notes on raw + production nodes; not offered on factory nodes; dragging the parent carries its notes; a note can't be dragged beyond ~250px; deleting the parent removes its notes; export→import round-trips notes; old snapshots import cleanly.

**Stage 7 — Polish.** Per-theme load-in animations (blueprint draft-in wipe, holotable materialize sweep, terminal power-on flicker — all reduced-motion gated), blueprint edge one-shot draw-in, empty-state styling, cross-check against mockups (explicitly NO blueprint title block, NO cost/machine-total rows), dead-code sweep (old TYPE_COLORS consumers, leftover slate/violet literals), version bump.
*Verify:* full manual checklist across all three themes; `npm run build` clean.

## 7. Risks / gotchas (carry these into implementation)

- `setNodes`/`setEdges` trigger a full rebalance — hover, theming, and lane data must be derived state only. The note-position clamp is the one thing that DOES belong in `setNodes`.
- RF's stylesheet is unlayered → RF overrides as plain CSS in theme files with `[data-theme=…]` prefixes; import order in `index.css`: RF css → tokens.css → theme css files.
- Terminal global `uppercase` would uppercase user-entered text display — scope to chrome/labels; exempt plan-name input, note textarea/body if it reads badly.
- Holotable chamfer clip-path and blueprint corner ticks: decorate an inner wrapper; keep RF Handles on the unclipped node root.
- Animated edges (holo flow, terminal ants) are main-thread stroke-dashoffset animations — fine at current plan sizes; reduced-motion gate included; pausing when zoomed far out is a possible follow-up, not in scope.
- `data.isEndProduct` annotation changes node data identity every projection — memoized node components must not rely on `data` reference stability.
- Theme is UI-only: never store it in plan snapshots; exported plan JSONs stay theme-neutral.

## 8. Final end-to-end verification

In `npm run dev`, for EACH of the three themes: build a chain raw → production → end node (check raw/production/end styles), create a sub-factory with input+output ports and a nested sub-sub-factory, verify sidebar scoping (power, intake, port rates) inside it, verify end-product highlight inside the factory for an unwired producer, hover nodes (edge highlight + rates + dimming), add/edit/drag/delete notes, toggle the sidebar (pinned ports stay glued), rename plan + factory, save/load, export → import, and import a pre-overhaul JSON export. Then `npm run test`, `npm run lint`, `npm run build`.
