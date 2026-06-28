# Scrape Notes

## Source

- URL: https://starruptureplanner.com/database
- Per-item pages: https://starruptureplanner.com/items/{slug}

## Data quality

This data is **community-sourced** from an early-access build of Star Rupture.
It will drift between patches. Always check `lastVerified` and `confidence` fields
on individual records before trusting them.

The site does not model alternate recipes per item — each item has exactly one
recipe. The "V1/V2" labels visible on the site refer to **power-generation
buildings**, not item recipe variants. `buildingTier` is therefore `null` for all
scraped recipes; see the `TODO` comment in `src/engine/types.ts`.

## Caching

Raw HTML pages are cached in `.cache/scrape/` keyed by URL slug.
Re-runs read from cache and make zero network requests.
Pass `--refresh` to bypass the cache and re-fetch everything.

## Re-running

```
npx tsx scripts/scrape-recipes.ts           # uses cache
npx tsx scripts/scrape-recipes.ts --refresh # re-fetches all pages
```

Output files: `src/data/items.json`, `src/data/recipes.json`.
