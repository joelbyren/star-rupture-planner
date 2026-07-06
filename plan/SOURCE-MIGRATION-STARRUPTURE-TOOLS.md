# Handoff: Migrate data source to starrupture.tools

> Audience: me/an agent picking this up with fresh context. Status as of end of 2026-07-06.
> The **scraper rewrite is done and working**. The **downstream code + tests + docs are NOT yet migrated** and currently reference the old item/recipe/machine ids, so `npm test` / `npm run build` will fail against the new data. This doc is the full plan to finish.

## What & why

We're switching the game-data source from `starruptureplanner.com` to **`starrupture.tools`** (aka "StarRupture Database"). The new site exposes far richer data — crucially **per-building power draw** (the thing the old source never gave us, so `power.json` was all placeholder `10`s) and **native V1/V2 recipe tiers** (we previously hand-authored V2 recipes into `recipes.json`).

## DONE — the scraper (`scripts/scrape-recipes.ts`)

Fully rewritten and verified. `npx tsx scripts/scrape-recipes.ts --refresh` fetches 2 pages and regenerates all three data files. Working-tree currently has regenerated `src/data/{items,recipes,power}.json` (git shows them modified — that's the new data, keep it).

### How the new source works (important — it's not plain HTML)

`starrupture.tools` is a **Next.js app-router SPA**. The served HTML is an empty shell — cheerio/`WebFetch` see nothing. The full dataset is embedded in the **React Server Components "flight" payload**: a series of `self.__next_f.push([1,"…"])` script tags. The scraper:

1. Concatenates every `__next_f` string chunk (`flightStream`).
2. Splits into `"<hexId>:<json>"` lines (`flightChunks`).
3. Deep-searches parsed chunks for the props array we want (`extractProps(html, 'items' | 'buildings')`).
4. **Rehydrates deduplicated references**: repeated objects appear as strings like `"$29:props:buildings:0:requirements:0:item"` (chunk 29 → element-tuple props at index 3 → walk the path). `resolveRefs`/`walk` resolves these in place, with cycle detection and a post-check that throws if any `$…` reference survives.

Only **2 requests total** (`/items`, `/buildings`) instead of one-per-item. Cache + retry/backoff + 403 handling carried over unchanged from the old scraper.

### Source data shape (what the flight payload gives us)

- **`/items`** → 468 items: `{ id, name, stack, category, categoryLabel, level, … }`. Category labels: Resource(139), Blueprint(91), Consumable(61), Valuable(46), Other(43), Gem Combat(34), Gem Survival(27), Gem Movement(24), Story Item(3).
- **`/buildings`** → 191 buildings: `{ id, name, url, categoryId, power, temperature, recipes[] }`.
  - `power`: **kW, negative = consumption, positive = generation** (e.g. Smelter `-5`, Wind Turbine v.2 `+3200`).
  - Each recipe: `{ id, duration (SECONDS), inputs[{item,quantity}], output{item,quantity,displayName} }`. **Rate = output.quantity × 60 / duration.**
  - Buildings embed full item objects inside recipes, so items missing from `/items` can still be resolved.

### Decisions baked into the scraper (REVIEW THESE)

1. **Machine name = building name with the `v.N` suffix stripped**; tier = V1 unless the name ends `v.2`+. So `crafter`→"Fabricator" V1, `crafter-tier2`→"Fabricator" V2. This is how `power.json` and `Recipe.machine` join.
2. **Recipe id = `recipe_{buildingId}_{recipeId}`** (guarantees uniqueness across tier variants; old scheme was `recipe_{slug}`).
3. **`buildingTier` is now always `'V1'` or `'V2'`, never `null`.** (Old data used `null`≈V1.)
4. **`confidence` and `lastVerified` are always `null`** — the new source doesn't expose them.
5. **Extractors are skipped for recipe emission.** Buildings with `categoryId === 'extraction'` model ore patches as input-less "recipes"; their outputs stay leaf/raw items (see raw-resource section).
6. **Items are filtered to the production-relevant subset** (161 of 468): only items that are a recipe output/input or an extractor output. Blueprints, gems, story items, and non-craftable consumables are dropped so the add-node dialog isn't flooded. ⚠️ **Confirm this is desired** — if the planner should list everything, change `toItems` to emit all `sourceItems`.

### Current output (verified)

```
Items emitted:   161   Recipes emitted: 169 (17 crafting machines)   Power entries: 18 (incl 6 extractors)
Leaf items (22): calcium-ore, crab-egg, elementary-building-material, fox-egg, glowcap, goethite-ore,
  grubbler, helium-ore, hydrobulb, magic-oil-ore, oxallop, polifruit, prickler, prism-herb, purplant,
  serpent-root, star-tears, sulheart, sulphur-ore, titanium-ore, vulpir-loot, wolfram-ore
```
Glass sanity check passes: Furnace V1 = 20/min (1 helium-ore + 2 calcium-powder), Furnace V2 = 80/min.

## NOT DONE — downstream migration (this is tomorrow's work)

The rest of the codebase hardcodes the **old** ids/names. All of the following must be updated, or tests/build break.

### The id + name scheme changed completely

| Concept | Old | New |
|---|---|---|
| Component item | `comp_rotor`, `wire_wolfram`, `rod_titanium` | `rotor`, `wolfram-wire`, `titanium-rod` |
| Ore/raw | `ore_titanium`, `ore_wolfram`, `gas_helium3`, `ore_sulfur`, `fluid_crude_oil` | `titanium-ore`, `wolfram-ore`, `helium-ore`, `sulphur-ore`, `magic-oil-ore` |
| Intermediate | `ingot_wolfram`, `bar_titanium` | `wolfram-bar`, `titanium-bar` (smelter output) |
| Recipe id | `recipe_comp_rotor`, `recipe_comp_rotor_v2` | `recipe_crafter_rotor`, `recipe_crafter-tier2_rotor-v2` |
| Item `type` | `Component`, `Resource`, `Fluid`… | `Resource`, `Consumable`, `Valuable`, `Blueprint`, `Gem …`, `Other` (from `categoryLabel`, capitalized) |

IDs are now kebab-case game-native slugs. There is **no mechanical old→new map** — names differ (`ingot_wolfram`→`wolfram-bar`). Rebuild references from the regenerated `src/data/items.json`.

### Machine name changes (affects `power.json` joins + `rawResources.ts` + `settingsStore.ts`)

| Old machine name | New machine name |
|---|---|
| `Ore Extractor` | `Ore Excavator` |
| `Helium Extractor` | `Helium-3 Extractor` |
| `Sulphur Extractor` | `Sulfur Extractor` (spelling changed) |
| `Oil Pump` | `Oil Extractor` |
| `Chemicals at` (scrape artifact) | gone — real chem machines are `Compounder` + `Refinery` |

⚠️ Naming gotcha in source: building `refinery` is *named* "Pressurizer" and building `pressurizer` is *named* "Refinery". The scraper uses the **name**, so `Recipe.machine`/`power.json` say "Pressurizer"/"Refinery" per the display names. Don't "fix" this.

### Files to update

1. **`src/engine/rawResources.ts`** — the big one. `MACHINE_NAMES`, `BASE_RATES`, `DEFAULT_MACHINE` all keyed on old ids/names.
   - Keys → new ids (`helium-ore`, `sulphur-ore`, `magic-oil-ore`, `titanium-ore`, …); machine values → new names; `DEFAULT_MACHINE` `'Ore Extractor'`→`'Ore Excavator'`.
   - **⚠️ Correctness bug surfaced by real data:** the hardcoded `BASE_RATE=120` + `PURITY_MULT {impure:0.5, normal:1, pure:2}` + `VERSION_MULT {V1:1, V2:2}` model is wrong for several resources. Measured extractor rates from the source:
     - Ore Excavator (calcium/titanium/wolfram-ore): impure 60 / normal 120 / pure 240 per min ✓ matches purity mult. **But V2 (Ore Excavator v.2) = 300/min, i.e. ×2.5 not ×2.** And V2 has no purity split (single recipe).
     - Helium-3 Extractor: **240/min, single recipe (no purity variants).**
     - Laser Drill (goethite-ore): **15/min** — old default assumed 120 → 8× too high.
     - Oil Extractor (magic-oil-ore): **10/min** — old assumed 120 → 12× too high.
     - Sulfur Extractor (sulphur-ore): **240/min** — old `ore_sulfur:120` → 2× too low.
   - **Recommended:** have the scraper emit a new data file (e.g. `src/data/extractors.json`) with measured `{itemId → {machine, ratesByPurityAndTier}}` instead of hardcoding rates in `rawResources.ts`. That keeps raw rates truthful across patches. Decide scope with the user first.
   - Note: several leaf items are **foraged organics** (crab-egg, glowcap, prism-herb, …) with no extractor — they'll fall through to the default rate. Confirm intended behavior.

2. **`src/store/settingsStore.ts`** — `TIER_MACHINES = ['Ore Extractor', 'Fabricator', 'Furnace', 'Mega Press']` → replace `'Ore Extractor'` with `'Ore Excavator'`. Consider expanding now that many machines have real V2 tiers (Compounder, Constructorizer, Fabricator, Furnace, Ore Excavator all have v.2 with distinct power).

3. **`src/engine/types.ts`** — `Recipe.buildingTier` comment says "Always null until the source exposes variant data" and there's a `TODO: recipe variants (V1/V2) not present in this source`. **Both are now false** — tiers are native. Update comment; consider tightening type to `BuildingTier` (non-null) if nothing else relies on null. Verify `MachinePower`/tier consumers still hold.

4. **`src/engine/power.ts`** — remove/replace the "`Chemicals at` is a known scrape artifact" comment (lines ~10-11); that machine no longer exists.

5. **Tests** (all reference old ids — will fail until fixed):
   - `src/store/planStore.test.ts`, `src/lib/persistence.test.ts`, `src/store/factory.test.ts`, `src/store/prereqRun.test.ts` — use real ids `comp_rotor`/`recipe_comp_rotor`/`wire_wolfram`. Remap to `rotor`/`recipe_crafter_rotor`/`wolfram-wire` etc. **Verify the rotor chain still matches** the new recipe shapes: rotor V1 = 1 (titanium-rod ×2 + wolfram-wire ×2) @ 10/min; wolfram-wire V1 = 2 (wolfram-bar ×1) @ 30/min; titanium-rod V1 = 1 (titanium-bar ×1) @ 30/min; wolfram-bar = 2 (wolfram-ore ×2) @ 60/min from Smelter.
   - `src/lib/tierSettings.test.ts` — expects `['recipe_comp_rotor','recipe_comp_rotor_v2']` etc.; remap ids and re-derive expected sort order.
   - `src/lib/prereqTree.test.ts` — full V1 chain expectations (7 items) with old ids.
   - `src/engine/power.test.ts` — uses `gas_helium3`, `ore_titanium`, `recipe_comp_glass`. Note `power.json` values are now REAL (Furnace V1=20, not placeholder 10) so any numeric power assertions change.
   - `src/engine/balanceGraph.test.ts` — mostly synthetic ids (`A`/`B`/`M`), lower risk, but scan for real ones.

6. **`scripts/SCRAPE_NOTES.md`** — rewrite for the new source: URL, flight-payload approach, 2-page fetch, the machine-name/tier/power notes, that `confidence`/`lastVerified` are now null, and the item-subset filtering decision.

7. **`README.md`** — lines ~47 and ~67-86 describe "cheerio scraper … from starruptureplanner.com" and claim `buildingTier` is always null / no V2 variants. Update source URL, drop the cheerio mention (no longer used), and fix the V1/V2 claims. Also `cheerio` may now be an unused dependency — check `package.json` and remove if nothing else imports it.

## Suggested order for tomorrow

1. Decide the two open questions with the user: (a) emit all 468 items or the 161-item production subset? (b) fix raw-extractor rates via a scraper-emitted `extractors.json`, or just correct the constants in `rawResources.ts`?
2. `rawResources.ts` + `settingsStore.ts` (engine correctness).
3. Comments in `types.ts` / `power.ts`.
4. Migrate tests; run `npm test` until green.
5. `npm run lint` + `npm run build`.
6. Rewrite `SCRAPE_NOTES.md` + `README.md`; prune `cheerio` if unused.
7. `/verify` the app end-to-end (add a rotor node, check power totals reflect real kW).

## Scratchpad artifacts (this session, outside the repo)

Under `…/scratchpad/`: `items.html`, `buildings.html` (raw fetched pages), `buildings-resolved.json`, `items-resolved.json` (fully rehydrated flight data — handy for grepping the full dataset without re-fetching), and `analyze.mjs` (the standalone flight parser used to explore). Not needed once the scraper is trusted, but useful for answering "what does the source actually say about X".
