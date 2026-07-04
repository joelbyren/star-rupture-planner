/**
 * Star Rupture recipe scraper.
 * Usage: npx tsx scripts/scrape-recipes.ts [--refresh]
 *
 * Fetches item and crafting data from starruptureplanner.com and emits
 * src/data/items.json and src/data/recipes.json consumed by the calc engine.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { load } from 'cheerio';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(ROOT, '.cache', 'scrape');
const DATA_DIR = path.join(ROOT, 'src', 'data');
const BASE_URL = 'https://starruptureplanner.com';
const REFRESH = process.argv.includes('--refresh');
const DELAY_MS = 800;

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ---------------------------------------------------------------------------
// Output types (mirrors src/engine/types.ts)
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
  buildingTier: null;
  outputRatePerMin: number;
  outputs: RecipeIngredient[];
  inputs: RecipeIngredient[];
  confidence: string | null;
  lastVerified: string | null;
  sourceUrl: string;
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
// Step 1: Harvest slugs from /database
// ---------------------------------------------------------------------------

function extractSlugs(html: string): string[] {
  const $ = load(html);
  const slugs = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const m = href.match(/^\/items\/([^/?#]+)/);
    if (m) slugs.add(decodeURIComponent(m[1]!)); // capture group is mandatory in the pattern
  });
  return [...slugs];
}

// ---------------------------------------------------------------------------
// JSON-LD helpers
// ---------------------------------------------------------------------------

type JsonLdBlock = Record<string, unknown>;

function extractJsonLdBlocks(html: string): JsonLdBlock[] {
  const blocks: JsonLdBlock[] = [];
  const re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      blocks.push(JSON.parse(m[1]!) as JsonLdBlock); // capture group is mandatory in the pattern
    } catch {
      // malformed JSON-LD — skip
    }
  }
  return blocks;
}

const KNOWN_TYPES = ['Component', 'Resource', 'Fluid', 'Powder', 'Weapon', 'Ammo'];

/** Type from BreadcrumbList position-3 item, e.g. "/database?category=Component". */
function extractType(blocks: JsonLdBlock[], fullText: string): string {
  for (const b of blocks) {
    if (b['@type'] !== 'BreadcrumbList') continue;
    for (const item of (b.itemListElement as Array<{ position: number; name: string }>) ?? []) {
      if (KNOWN_TYPES.includes(item.name)) return item.name;
    }
  }
  // Fallback: first type word found in body text
  for (const t of KNOWN_TYPES) {
    if (fullText.includes(t)) return t;
  }
  return 'Resource';
}

/** lastVerified from TechArticle.dateModified. */
function extractLastVerified(blocks: JsonLdBlock[]): string | null {
  for (const b of blocks) {
    if (b['@type'] === 'TechArticle' && typeof b.dateModified === 'string') {
      return b.dateModified;
    }
  }
  return null;
}

/**
 * Machine name + output rate from FAQPage "How do you make X?" answer.
 * Answer text: "Glass is crafted in the Furnace at 20 items per minute (IPM)."
 */
function extractRecipeFromFaq(blocks: JsonLdBlock[]): { machine: string; rate: number } {
  for (const b of blocks) {
    if (b['@type'] !== 'FAQPage') continue;
    for (const q of (b.mainEntity as Array<{
      acceptedAnswer?: { text?: string };
    }>) ?? []) {
      const text = q?.acceptedAnswer?.text ?? '';
      const m = text.match(
        /crafted in (?:the )?([A-Za-z][A-Za-z0-9 ]*?) at (\d+(?:\.\d+)?) items? per minute/i,
      );
      if (m) return { machine: m[1]!.trim(), rate: parseFloat(m[2]!) }; // capture groups are mandatory
    }
  }
  return { machine: '', rate: 0 };
}

// ---------------------------------------------------------------------------
// HTML ingredient parsing
// ---------------------------------------------------------------------------

/**
 * Extract ingredient list from a named section of the raw HTML.
 *
 * The site renders each row as:
 *   <a href="/items/SLUG">Name</a><span class="...">x<!-- -->N</span>
 *
 * We find the section by its label div, slice to the next label, then regex
 * for item-link + quantity-span pairs. The React comment artifact <!-- --> is
 * handled by allowing it between x and the digit.
 */
function parseIngredientSection(html: string, label: string): RecipeIngredient[] {
  const startIdx = html.indexOf(`>${label}<`);
  if (startIdx === -1) return [];

  // Slice to whichever next section label comes first
  const SECTION_LABELS = ['Inputs', 'Outputs', 'How to Craft', 'Production Chain', 'Used In', 'Similar Items'];
  let endIdx = html.length;
  for (const l of SECTION_LABELS) {
    if (l === label) continue;
    const idx = html.indexOf(`>${l}<`, startIdx + 1);
    if (idx !== -1 && idx < endIdx) endIdx = idx;
  }

  const section = html.slice(startIdx, endIdx);
  const results: RecipeIngredient[] = [];

  // Match: href="/items/SLUG">LinkText</a><span...>x<!-- -->N</span>
  const re =
    /href="\/items\/([^"?#]+)"[^>]*>[^<]+<\/a><span[^>]*>x(?:<!--[^>]*-->)?(\d+)<\/span>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(section)) !== null) {
    results.push({ itemId: decodeURIComponent(m[1]!), quantity: parseInt(m[2]!, 10) }); // capture groups are mandatory
  }

  return results;
}

/**
 * Quantity for the output item from the Outputs section.
 * The output is always the item itself (no <a> link in the HTML);
 * we just pull the x<!-- -->N quantity.
 */
function extractOutputQuantity(html: string, slug: string): RecipeIngredient {
  const startIdx = html.indexOf('>Outputs<');
  if (startIdx !== -1) {
    const window = html.slice(startIdx, startIdx + 600);
    const m = window.match(/x(?:<!--[^>]*-->)?(\d+)<\/span>/i);
    if (m) return { itemId: slug, quantity: parseInt(m[1]!, 10) }; // capture group is mandatory
  }
  return { itemId: slug, quantity: 1 };
}

/**
 * HTML fallback for machine + rate when the page has no FAQ JSON-LD.
 * Looks for the pattern: <span>MachineName</span></a><span class="...">N<!-- --> IPM</span>
 */
function extractMachineFromHtml(html: string): { machine: string; rate: number } {
  // Match: >MachineName</span></a><span...>N<!-- --> IPM</span>
  const m = html.match(/>([A-Za-z][A-Za-z0-9 ]+?)<\/span><\/a><span[^>]*>(\d+(?:\.\d+)?)(?:<!--[^>]*-->)?\s*IPM<\/span>/i);
  if (m) return { machine: m[1]!.trim(), rate: parseFloat(m[2]!) }; // capture groups are mandatory

  // Broader fallback: any "N IPM" span preceded by a plausible machine name
  const m2 = html.match(/([A-Za-z][A-Za-z0-9 ]+?)\s+(\d+(?:\.\d+)?)\s*IPM/i);
  if (m2) return { machine: m2[1]!.trim(), rate: parseFloat(m2[2]!) }; // capture groups are mandatory

  return { machine: '', rate: 0 };
}

// ---------------------------------------------------------------------------
// Step 2: Parse an item page
// ---------------------------------------------------------------------------

function parseItemPage(
  html: string,
  slug: string,
  url: string,
): { item: ScrapedItem; recipe: ScrapedRecipe | null } {
  const $ = load(html);
  const fullText = $('body').text();
  const blocks = extractJsonLdBlocks(html);

  // Name
  const name = $('h1').first().text().trim() || slug;

  // Type
  const type = extractType(blocks, fullText);

  // Stack size
  let stackSize: number | null = null;
  const stackMatch = fullText.match(/Stack\s*[:\-]?\s*(\d+)/i);
  if (stackMatch) stackSize = parseInt(stackMatch[1]!, 10); // capture group is mandatory

  // Confidence (visible badge on the page)
  let confidence: string | null = null;
  const confMatch = fullText.match(/(High|Medium|Low)\s+Confidence/i);
  if (confMatch) confidence = confMatch[0].trim();

  // Last verified
  let lastVerified = extractLastVerified(blocks);
  if (!lastVerified) {
    const lvm = fullText.match(/Last\s+Verified\s*[:\-]?\s*(\d{4}-\d{2}-\d{2})/i);
    if (lvm) lastVerified = lvm[1]!; // capture group is mandatory
  }

  // Machine + output rate (JSON-LD first, HTML fallback)
  let machine: string;
  let outputRatePerMin: number;
  const faq = extractRecipeFromFaq(blocks);
  if (faq.machine) {
    machine = faq.machine;
    outputRatePerMin = faq.rate;
  } else {
    const htmlResult = extractMachineFromHtml(html);
    machine = htmlResult.machine;
    outputRatePerMin = htmlResult.rate;
  }

  const item: ScrapedItem = { id: slug, name, type, stackSize };

  // No machine → leaf resource, no recipe
  if (!machine) return { item, recipe: null };

  const inputs = parseIngredientSection(html, 'Inputs');
  const outputs = [extractOutputQuantity(html, slug)];

  return {
    item,
    recipe: {
      id: `recipe_${slug}`,
      outputItemId: slug,
      machine,
      buildingTier: null,
      outputRatePerMin,
      outputs,
      inputs,
      confidence,
      lastVerified,
      sourceUrl: url,
    },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Star Rupture Recipe Scraper ===');
  console.log(`Cache dir: ${CACHE_DIR}`);
  if (REFRESH) console.log('(--refresh: bypassing cache)\n');
  else console.log('(use --refresh to force re-fetch)\n');

  // Step 1: database index
  const dbUrl = `${BASE_URL}/database`;
  const dbHtml = await fetchHtml(dbUrl, true).catch((e: Error) => {
    console.error(`\nFATAL: could not fetch ${dbUrl}: ${e.message}`);
    if (e.message.includes('403')) {
      console.error('Received 403 Forbidden even with browser headers. Report this before escalating.');
    }
    process.exit(1);
  });

  const slugs = extractSlugs(dbHtml);
  if (slugs.length === 0) {
    console.error('No item slugs found on /database — page structure may have changed.');
    process.exit(1);
  }
  console.log(`\nFound ${slugs.length} slugs on /database\n`);

  // Step 2: fetch + parse each item page
  const items: ScrapedItem[] = [];
  const recipes: ScrapedRecipe[] = [];
  const leafItems: string[] = [];
  const failures: Array<{ slug: string; reason: string }> = [];

  for (const slug of slugs) {
    const itemUrl = `${BASE_URL}/items/${slug}`;
    try {
      const html = await fetchHtml(itemUrl);
      const { item, recipe } = parseItemPage(html, slug, itemUrl);
      items.push(item);
      if (recipe) {
        recipes.push(recipe);
      } else {
        leafItems.push(slug);
      }
    } catch (e) {
      const reason = (e as Error).message;
      console.error(`  FAILED: ${slug} — ${reason}`);
      failures.push({ slug, reason });
      if (reason.includes('403')) {
        console.error('\nStopping due to 403. Report before escalating.');
        break;
      }
    }
  }

  // Step 3: write output
  fs.writeFileSync(
    path.join(DATA_DIR, 'items.json'),
    JSON.stringify(items, null, 2) + '\n',
    'utf-8',
  );
  fs.writeFileSync(
    path.join(DATA_DIR, 'recipes.json'),
    JSON.stringify(recipes, null, 2) + '\n',
    'utf-8',
  );

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Items found:            ${items.length}`);
  console.log(`Recipes emitted:        ${recipes.length}`);
  console.log(`Leaf items (no recipe): ${leafItems.length}`);
  if (leafItems.length) console.log(`  Leaves: ${leafItems.join(', ')}`);
  if (failures.length) {
    console.log(`\nUnexpected parse failures (${failures.length}):`);
    for (const { slug, reason } of failures) {
      console.log(`  ${slug}: ${reason}`);
    }
  } else {
    console.log('Unexpected failures:    0');
  }

  // Glass sanity check
  const glassRecipe = recipes.find(
    (r) => r.outputItemId === 'glass' || r.outputItemId.toLowerCase().includes('glass'),
  );
  if (glassRecipe) {
    console.log('\n=== Glass sanity check ===');
    console.log(JSON.stringify(glassRecipe, null, 2));
  } else {
    console.log('\n[note] No "glass" recipe found. All recipe IDs:');
    console.log(' ', recipes.map((r) => r.outputItemId).join(', ') || '(none)');
  }
}

main().catch((e: Error) => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
