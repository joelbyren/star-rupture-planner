/**
 * Star Rupture data scraper.
 * Usage: npx tsx scripts/scrape-recipes.ts [--refresh]
 *
 * Fetches item and building data from starrupture.tools and emits
 * src/data/items.json, src/data/recipes.json and src/data/power.json
 * consumed by the calc engine.
 *
 * The site is a Next.js app-router SPA: the visible HTML is an empty shell,
 * but the full dataset is embedded in the React Server Components "flight"
 * payload (`self.__next_f.push([1, "..."])` script chunks). Two pages carry
 * everything we need:
 *   /items      → all items (id, name, category, stack size)
 *   /buildings  → all buildings incl. every crafting recipe (inputs, output,
 *                 duration in seconds) plus power draw and temperature
 * so the whole scrape is 2 requests instead of one per item.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(ROOT, '.cache', 'scrape');
const DATA_DIR = path.join(ROOT, 'src', 'data');
const BASE_URL = 'https://starrupture.tools';
const REFRESH = process.argv.includes('--refresh');
const DELAY_MS = 800;

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ---------------------------------------------------------------------------
// Output types (mirror src/engine/types.ts)
// ---------------------------------------------------------------------------

interface ScrapedItem {
  id: string;
  name: string;
  type: string;
  stackSize: number | null;
}

interface RecipeIngredient {
  itemId: string;
  quantity: number;
}

interface ScrapedRecipe {
  id: string;
  outputItemId: string;
  machine: string;
  buildingTier: 'V1' | 'V2';
  outputRatePerMin: number;
  outputs: RecipeIngredient[];
  inputs: RecipeIngredient[];
  confidence: string | null;
  lastVerified: string | null;
  sourceUrl: string;
}

/** Mirrors MachinePower in src/engine/types.ts. */
type ScrapedPower = Record<string, { V1: number; V2: number }>;

// ---------------------------------------------------------------------------
// Source types (shape of the flight-payload page props)
// ---------------------------------------------------------------------------

interface SourceItem {
  id: string;
  name: string;
  stack?: number;
  category?: string;
  categoryLabel?: string;
}

interface SourceIngredient {
  item: SourceItem;
  quantity: number;
}

interface SourceRecipe {
  id: string;
  /** Seconds per craft cycle. */
  duration: number;
  inputs: SourceIngredient[];
  output: SourceIngredient & { displayName?: string };
}

interface SourceBuilding {
  id: string;
  name: string;
  url: string;
  categoryId?: string;
  recipes: SourceRecipe[];
  /** kW; negative = consumption, positive = generation. */
  power: number;
}

// ---------------------------------------------------------------------------
// Cache + fetch
// ---------------------------------------------------------------------------

fs.mkdirSync(CACHE_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

function urlToKey(url: string): string {
  return (
    url
      .replace(/^https?:\/\/[^/]+/, '')
      .replace(/\//g, '__')
      .replace(/[^a-z0-9_-]/gi, '-')
      .replace(/^-+/, '') || 'index'
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchHtml(url: string, isFirst = false): Promise<string> {
  const key = urlToKey(url) + '.html';
  const cachePath = path.join(CACHE_DIR, key);

  if (!REFRESH && fs.existsSync(cachePath)) {
    process.stdout.write(`  [cache] ${url}\n`);
    return fs.readFileSync(cachePath, 'utf-8');
  }

  if (!isFirst) await sleep(DELAY_MS);

  let lastError: Error = new Error('No attempts made');
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      const backoff = Math.pow(2, attempt) * 1000;
      process.stdout.write(`  [retry in ${backoff}ms] ${url}\n`);
      await sleep(backoff);
    }
    try {
      process.stdout.write(`  [fetch] ${url}\n`);
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error(
            `403 Forbidden at ${url} — browser headers did not help. Stop and report.`,
          );
        }
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const html = await res.text();
      fs.writeFileSync(cachePath, html, 'utf-8');
      return html;
    } catch (e) {
      lastError = e as Error;
      process.stdout.write(`  [warn] attempt ${attempt + 1}: ${lastError.message}\n`);
      if (lastError.message.includes('403')) throw lastError;
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Next.js flight-payload parsing
//
// The payload is streamed as script tags: self.__next_f.push([1, "chunk"]).
// Concatenating the string chunks yields lines of the form "<hexId>:<data>",
// where <data> for the chunks we care about is plain JSON. The page props
// live on a React element tuple ["$", "$L<ref>", null, {…props}] — props is
// tuple index 3.
//
// Repeated objects are deduplicated as reference strings, e.g.
// "$29:props:buildings:0:requirements:0:item" = chunk 29, walk props (tuple
// index 3 on an element), then buildings[0].requirements[0].item. resolveRefs
// rehydrates these in place.
// ---------------------------------------------------------------------------

function flightStream(html: string): string {
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  let out = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out += JSON.parse(m[1]!) as string; // capture group is mandatory in the pattern
  }
  return out;
}

function flightChunks(stream: string): Map<string, string> {
  const chunks = new Map<string, string>();
  let cur: { id: string; data: string } | null = null;
  for (const line of stream.split('\n')) {
    const m = line.match(/^([0-9a-f]+):(.*)$/i);
    if (m) {
      if (cur) chunks.set(cur.id, cur.data);
      cur = { id: m[1]!, data: m[2]! }; // capture groups are mandatory in the pattern
    } else if (cur) {
      cur.data += '\n' + line; // JSON payload containing a literal newline
    }
  }
  if (cur) chunks.set(cur.id, cur.data);
  return chunks;
}

type Json = unknown;

const REF_RE = /^\$[0-9a-f]+:/i;

/**
 * Find the page props object holding `key` (an array of >5 entries) anywhere
 * in the parsed chunks, and return it with every `$id:path` reference string
 * resolved to its actual value.
 */
function extractProps<T>(html: string, key: string): T[] {
  const chunks = flightChunks(flightStream(html));

  const parsed = new Map<string, Json>();
  const chunkById = (id: string): Json => {
    if (!parsed.has(id)) {
      const raw = chunks.get(id);
      if (raw === undefined) throw new Error(`flight chunk ${id} not found`);
      parsed.set(id, JSON.parse(raw));
    }
    return parsed.get(id);
  };

  // Locate the target array by brute-force deep search over all JSON chunks.
  let found: Json[] | null = null;
  const search = (node: Json): void => {
    if (found || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const c of node) search(c);
      return;
    }
    const obj = node as Record<string, Json>;
    if (Array.isArray(obj[key]) && (obj[key] as Json[]).length > 5) {
      found = obj[key] as Json[];
      return;
    }
    for (const v of Object.values(obj)) search(v);
  };
  for (const id of chunks.keys()) {
    let v: Json;
    try {
      v = chunkById(id);
    } catch {
      continue; // non-JSON chunk (module refs etc.)
    }
    search(v);
    if (found) break;
  }
  if (!found) throw new Error(`no "${key}" array found in flight payload — page structure may have changed`);

  const resolvePath = (ref: string): Json => {
    const [id, ...parts] = ref.slice(1).split(':');
    let node: Json = chunkById(id!);
    for (const p of parts) {
      if (node === null || typeof node !== 'object') return undefined;
      // React element tuples are ["$", type, key, props]; "props" = index 3.
      if (p === 'props' && Array.isArray(node)) {
        node = node[3];
        continue;
      }
      node = (node as Record<string, Json>)[p];
    }
    return node;
  };

  const resolving = new Set<string>();
  const walk = (node: Json): Json => {
    if (typeof node === 'string' && REF_RE.test(node)) {
      if (resolving.has(node)) throw new Error(`circular flight reference: ${node}`);
      const target = resolvePath(node);
      if (target === undefined) return node; // leave unresolved; validated below
      resolving.add(node);
      const out = walk(target);
      resolving.delete(node);
      return out;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node !== null && typeof node === 'object') {
      const out: Record<string, Json> = {};
      for (const [k, v] of Object.entries(node)) out[k] = walk(v);
      return out;
    }
    return node;
  };

  const resolved = walk(found) as T[];

  const leftovers = JSON.stringify(resolved).match(/"\$[0-9a-f]+:[^"]*"/gi) ?? [];
  if (leftovers.length > 0) {
    throw new Error(
      `${leftovers.length} unresolved flight reference(s) in "${key}", e.g. ${leftovers[0]}`,
    );
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Transformation
// ---------------------------------------------------------------------------

/**
 * "Fabricator v.2" → { machine: "Fabricator", tier: "V2" }. Buildings without
 * a version suffix are the base (V1) variant.
 */
function normalizeMachine(buildingName: string): { machine: string; tier: 'V1' | 'V2' } {
  const name = buildingName.trim();
  const m = name.match(/^(.*?)\s+v\.(\d+)$/i);
  if (m) return { machine: m[1]!.trim(), tier: Number(m[2]!) >= 2 ? 'V2' : 'V1' }; // capture groups are mandatory
  return { machine: name, tier: 'V1' };
}

/** Extractor buildings model ore patches as input-less "recipes" (one per purity). */
function isExtractor(b: SourceBuilding): boolean {
  return b.categoryId === 'extraction';
}

function toRecipes(buildings: SourceBuilding[]): ScrapedRecipe[] {
  const recipes: ScrapedRecipe[] = [];
  for (const b of buildings) {
    if (isExtractor(b) || !b.recipes?.length) continue;
    const { machine, tier } = normalizeMachine(b.name);
    for (const r of b.recipes) {
      recipes.push({
        id: `recipe_${b.id}_${r.id}`,
        outputItemId: r.output.item.id,
        machine,
        buildingTier: tier,
        outputRatePerMin: Number(((r.output.quantity * 60) / r.duration).toFixed(2)),
        outputs: [{ itemId: r.output.item.id, quantity: r.output.quantity }],
        inputs: r.inputs.map((i) => ({ itemId: i.item.id, quantity: i.quantity })),
        confidence: null,
        lastVerified: null,
        sourceUrl: `${BASE_URL}${b.url}`,
      });
    }
  }
  return recipes.sort(
    (a, b) =>
      a.outputItemId.localeCompare(b.outputItemId) ||
      a.machine.localeCompare(b.machine) ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Power draw per machine, keyed the same way as Recipe.machine. Covers every
 * crafting machine and every extractor. Source `power` is negative for
 * consumers; we store the positive draw. Machines without a v.2 building get
 * their V1 value mirrored into V2.
 */
function toPower(buildings: SourceBuilding[]): ScrapedPower {
  const power: ScrapedPower = {};
  const partial = new Map<string, { V1?: number; V2?: number }>();
  for (const b of buildings) {
    if (!isExtractor(b) && !b.recipes?.length) continue;
    const { machine, tier } = normalizeMachine(b.name);
    const draw = Math.max(0, -b.power);
    const entry = partial.get(machine) ?? {};
    entry[tier] = draw;
    partial.set(machine, entry);
  }
  for (const [machine, entry] of [...partial.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    power[machine] = { V1: entry.V1 ?? entry.V2 ?? 0, V2: entry.V2 ?? entry.V1 ?? 0 };
  }
  return power;
}

/**
 * Items referenced by any emitted recipe or produced by an extractor — the
 * factory-relevant subset. (The site lists ~470 items, most of which are
 * blueprints/gems/story items with no role in production chains; recipe-less
 * items surface in the app as raw resources, so emitting all of them would
 * flood the add-node dialog.)
 */
function toItems(
  sourceItems: SourceItem[],
  buildings: SourceBuilding[],
  recipes: ScrapedRecipe[],
): ScrapedItem[] {
  const wanted = new Set<string>();
  for (const r of recipes) {
    wanted.add(r.outputItemId);
    for (const i of r.inputs) wanted.add(i.itemId);
  }
  for (const b of buildings) {
    if (!isExtractor(b)) continue;
    for (const r of b.recipes ?? []) wanted.add(r.output.item.id);
  }

  const byId = new Map(sourceItems.map((i) => [i.id, i]));
  // Recipes embed their own copy of each item — fallback for anything the
  // /items listing doesn't carry.
  for (const b of buildings) {
    for (const r of b.recipes ?? []) {
      for (const si of [r.output.item, ...r.inputs.map((i) => i.item)]) {
        if (!byId.has(si.id)) byId.set(si.id, si);
      }
    }
  }

  const items: ScrapedItem[] = [];
  const missing: string[] = [];
  for (const id of [...wanted].sort()) {
    const src = byId.get(id);
    if (!src) {
      missing.push(id);
      continue;
    }
    const rawType = src.categoryLabel ?? src.category ?? 'Other';
    items.push({
      id: src.id,
      name: src.name,
      type: rawType.charAt(0).toUpperCase() + rawType.slice(1),
      stackSize: src.stack ?? null,
    });
  }
  if (missing.length) {
    throw new Error(`items referenced by recipes but not found anywhere: ${missing.join(', ')}`);
  }
  return items;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Star Rupture Data Scraper ===');
  console.log(`Source:    ${BASE_URL}`);
  console.log(`Cache dir: ${CACHE_DIR}`);
  if (REFRESH) console.log('(--refresh: bypassing cache)\n');
  else console.log('(use --refresh to force re-fetch)\n');

  const itemsHtml = await fetchHtml(`${BASE_URL}/items`, true);
  const buildingsHtml = await fetchHtml(`${BASE_URL}/buildings`);

  const sourceItems = extractProps<SourceItem>(itemsHtml, 'items');
  const buildings = extractProps<SourceBuilding>(buildingsHtml, 'buildings');
  console.log(`\nParsed ${sourceItems.length} items, ${buildings.length} buildings from flight payload`);

  const recipes = toRecipes(buildings);
  const power = toPower(buildings);
  const items = toItems(sourceItems, buildings, recipes);

  const write = (file: string, data: unknown) =>
    fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2) + '\n', 'utf-8');
  write('items.json', items);
  write('recipes.json', recipes);
  write('power.json', power);

  // Summary
  const craftingBuildings = buildings.filter((b) => !isExtractor(b) && b.recipes?.length);
  const extractors = buildings.filter(isExtractor);
  const leafItems = items.filter((i) => !recipes.some((r) => r.outputItemId === i.id));
  console.log('\n=== Summary ===');
  console.log(`Items emitted:          ${items.length}`);
  console.log(`Recipes emitted:        ${recipes.length} (from ${craftingBuildings.length} crafting machines)`);
  console.log(`Power entries:          ${Object.keys(power).length} (incl. ${extractors.length} extractor buildings)`);
  console.log(`Leaf items (no recipe): ${leafItems.length}`);
  if (leafItems.length) console.log(`  Leaves: ${leafItems.map((i) => i.id).join(', ')}`);

  // Glass sanity check (expected: Furnace, 3s × 1 → 20/min at V1)
  const glass = recipes.filter((r) => r.outputItemId === 'glass');
  if (glass.length > 0) {
    console.log('\n=== Glass sanity check ===');
    console.log(JSON.stringify(glass, null, 2));
  } else {
    console.log('\n[warn] No "glass" recipe found — page structure may have changed.');
  }
}

main().catch((e: Error) => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
