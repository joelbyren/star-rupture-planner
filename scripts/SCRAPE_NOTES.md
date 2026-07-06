# Scrape Notes

## Source

- Site: https://starrupture.tools ("StarRupture Database")
- Pages fetched (the whole scrape is these two requests):
  - https://starrupture.tools/items — all items
  - https://starrupture.tools/buildings — all buildings incl. recipes, power, temperature

## How the data is extracted

The site is a Next.js app-router SPA — the served HTML body is an empty shell,
so HTML parsing (cheerio etc.) sees nothing. The dataset is embedded in the
React Server Components **flight payload**: `self.__next_f.push([1,"…"])`
script chunks. The scraper concatenates the chunks, splits them into
`<hexId>:<json>` lines, deep-searches for the page-props array (`items` /
`buildings`), and rehydrates deduplicated references (strings like
`"$29:props:buildings:0:requirements:0:item"` — chunk id, then a path where
`props` on a React element tuple means index 3). It throws if any reference
is left unresolved, so a silent format change fails loudly.

## Mapping decisions

- **Machine name** = building display name with the ` v.N` suffix stripped;
  the suffix sets `buildingTier` (`v.2` → `V2`, otherwise `V1`). Example:
  building `crafter-tier2` "Fabricator v.2" → machine `"Fabricator"`, tier `V2`.
  This is the join key between `recipes.json` and `power.json`.
- **Recipe id** = `recipe_{buildingId}_{recipeId}` (unique across tier variants).
- **Rate**: source recipes give `duration` in seconds per craft;
  `outputRatePerMin = output.quantity × 60 / duration`.
- **Power** (`power.json`): source `power` is MW, negative = consumption.
  We store the positive draw per machine, `{V1, V2}`; machines without a v.2
  building mirror V1 into V2. Generators/logistics buildings are not emitted —
  the engine only looks up crafting machines and extractors.
- **Extractors** (`categoryId === 'extraction'`) model ore patches as
  input-less "recipes" (one per purity: ×2/×4/×8 per 2s for ores). These are
  NOT emitted as recipes — their outputs stay leaf items so the app treats
  them as raw resources. Their measured rates are hardcoded in
  `src/engine/rawResources.ts` (`BASE_RATES`, V2 = ×2.5).
- **Item subset**: only items referenced by an emitted recipe or produced by
  an extractor are emitted (~160 of ~470). Blueprints, gems, valuables and
  story items are dropped — recipe-less items surface in the app as raw
  resources and would flood the add-node dialog. `Item.type` is the site's
  `categoryLabel` (Resource, Consumable, Valuable, …).
- `confidence` and `lastVerified` are always `null` — this source doesn't
  publish them. `sourceUrl` points at the crafting building's page.

## Quirks worth knowing

- The game data swaps two names: building `refinery` is *displayed* as
  "Pressurizer" and building `pressurizer` as "Refinery". The scraper uses
  display names, so trust `machine` as shown — don't "fix" this.
- Duplicate producers are real: ~30 items are craftable in multiple
  machines/tiers (e.g. glass in Furnace and Furnace v.2 with different
  inputs). The app's recipe picker + tier preferences handle this.
- Foraged organics (crab-egg, glowcap, prism-herb, …) are recipe inputs with
  no extractor building — they appear as raw leaf items with a guessed
  default supply rate; use the node's custom mode for real numbers.

## Data quality

Community-sourced from an early-access build of Star Rupture; it will drift
between patches. Re-scrape with `--refresh` after game updates.

## Caching

Raw HTML pages are cached in `.cache/scrape/` keyed by URL slug.
Re-runs read from cache and make zero network requests.
Pass `--refresh` to bypass the cache and re-fetch everything.

## Re-running

```
npx tsx scripts/scrape-recipes.ts           # uses cache
npx tsx scripts/scrape-recipes.ts --refresh # re-fetches both pages
```

Output files: `src/data/items.json`, `src/data/recipes.json`, `src/data/power.json`.
