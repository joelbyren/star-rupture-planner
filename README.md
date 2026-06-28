# StarRupture Planner

A factory-planning web app for the game StarRupture, in the style of Satisfactory planner tools.

## Quick start

```bash
npm install
npm run dev      # dev server at http://localhost:5173
npm test         # run engine tests
npm run build    # production build
```

## Project layout

```
src/
├── data/
│   ├── items.json        # All game items (id + name)
│   └── recipes.json      # All recipes (inputs, outputs, building tier)
├── engine/
│   ├── types.ts          # Pure TypeScript types — no UI deps
│   ├── calculate.ts      # Deterministic expansion engine
│   └── calculate.test.ts # Vitest tests for the engine
├── store/
│   └── planStore.ts      # Zustand store — domain model + React Flow canvas state
├── components/
│   ├── FactoryNode.tsx   # Custom React Flow node
│   ├── SidePanel.tsx     # Target picker + chain summary
│   └── PersistenceBar.tsx # Save / Load / Export / Import buttons
├── db/
│   └── db.ts             # Dexie (IndexedDB) schema
└── App.tsx               # Root layout + React Flow canvas
```

## How the engine stays decoupled

`src/engine/` is a strict no-UI zone:

- **Zero imports** from React, Zustand, `@xyflow/react`, or any component file.
- `calculate.ts` takes plain `Recipe[]` and a target `{itemId, ratePerMin}` and returns a plain `NodeResult` tree.
- Tests in `calculate.test.ts` run with Vitest and exercise only the engine — no rendering.

The Zustand store in `src/store/planStore.ts` owns the bridge: it calls the engine, then transforms the `NodeResult` tree into React Flow `nodes` and `edges`. React components read from the store; they never call the engine directly.

```
recipes.json ──▶ engine/calculate.ts ──▶ planStore.ts ──▶ React Flow canvas
                  (pure functions)       (Zustand)          (UI)
```

## How to add a recipe

1. Open `src/data/recipes.json`.
2. Add a new entry following the schema:

```json
{
  "id": "my-recipe-id",
  "itemId": "output-item-id",
  "buildingTier": "V1",
  "inputs":  [{ "itemId": "some-item", "ratePerMin": 30 }],
  "outputs": [{ "itemId": "output-item-id", "ratePerMin": 20 }]
}
```

3. If the output item is new, add it to `src/data/items.json`:

```json
{ "id": "output-item-id", "name": "My Item" }
```

4. Restart the dev server — the item appears in the Target Item dropdown and the engine picks up the recipe automatically. No code changes needed.

**V1 / V2 variants:** if you add a second recipe with the same `itemId` but `"buildingTier": "V2"`, the factory node for that item will show a dropdown letting the user switch tiers. Switching immediately recomputes the whole chain.

## Persistence

- **Save / Load** — persists to IndexedDB (Dexie) in the browser. Data survives page reloads on the same machine.
- **Export JSON** — downloads the current plan as a `.json` file. Use this to share plans between users or machines.
- **Import JSON** — imports a previously exported `.json` file and restores the full plan.

The export format is the `PlanSnapshot` type defined in `src/store/planStore.ts`.

## Architecture notes

- **SubFactory** — the type and store shape for sub-factories is scaffolded in `src/engine/types.ts`. A sub-factory is its own graph document; in a parent graph it appears as a single node with declared I/O handles. The UI is not yet wired up.
- **LP optimiser** — a TODO comment in `src/engine/calculate.ts` marks where a `javascript-lp-solver` pass would slot in to minimise resource usage or building count across the full graph. The `NodeResult` shape already supports it.
