import { readFileSync, writeFileSync } from "node:fs";

// Adds every Solana NFT collection CoinGecko tracks to src/data/onchain.json, ranked by market cap,
// with its name, image and supply. CoinGecko does not publish Solana collection addresses, so a
// collection is identified by its CoinGecko id and links to its CoinGecko page. Solana collections are
// view-only on Curato (coins pair with Robinhood Chain collections).
//
// The free API is rate limited, so requests are spaced out and retried. The run resumes: collections
// already in the file are not fetched again, and progress is saved every few collections.
// Run `node scripts/cache-images.mjs` afterwards to cache the logos locally.
const dataFile = new URL("../src/data/onchain.json", import.meta.url);
const API = "https://api.coingecko.com/api/v3";
const KEEP = Number(process.env.KEEP ?? Infinity);
const SAVE_EVERY = 10;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path) {
  for (let attempt = 1; attempt <= 8; attempt++) {
    const r = await fetch(API + path, { signal: AbortSignal.timeout(20000) }).catch(() => null);
    const body = r ? await r.json().catch(() => null) : null;
    // CoinGecko sometimes reports the rate limit inside the body instead of the status code.
    const limited = !r || r.status === 429 || r.status >= 500 || body?.status?.error_code === 429;
    if (!limited) return r.ok ? body : null;
    await sleep(20000 * attempt);
  }
  return null;
}

// The full ranked list, page by page.
const list = [];
for (let page = 1; ; page++) {
  const rows = await get(`/nfts/list?asset_platform_id=solana&order=market_cap_usd_desc&per_page=250&page=${page}`);
  await sleep(6500);
  if (!Array.isArray(rows) || rows.length === 0) break;
  list.push(...rows);
}
console.log(`ranked list: ${list.length}`);

const all = JSON.parse(readFileSync(dataFile, "utf8"));
const others = all.filter((r) => r.chain !== "solana");
const known = new Map(all.filter((r) => r.chain === "solana").map((r) => [r.slug, r]));

function save(done) {
  // Keep CoinGecko's ranking order; anything not reached yet is left out.
  const ranked = list.map((item) => done.get(item.id)).filter(Boolean);
  writeFileSync(dataFile, JSON.stringify([...others, ...ranked], null, 2) + "\n");
}

const done = new Map();
let fetched = 0;
for (const item of list) {
  if (done.size >= KEEP) break;
  if (known.has(item.id)) {
    done.set(item.id, known.get(item.id));
    continue;
  }
  const nft = await get(`/nfts/${item.id}`);
  await sleep(6500);
  if (!nft) {
    console.log("skip", item.id, "(not reachable)");
    continue;
  }
  // CoinGecko serves a "missing_*.png" placeholder when a collection has no artwork; treat it as none.
  const real = (u) => (u && !/\/missing_[^/]*$/.test(u) ? u : undefined);
  const image = real(nft.image?.small_2x) ?? real(nft.image?.small);
  done.set(item.id, {
    chain: "solana",
    slug: item.id,
    address: item.id,
    name: (nft.name ?? item.name).trim(),
    symbol: nft.symbol ?? item.symbol ?? null,
    supply: nft.total_supply ?? null,
    ...(image ? { image, logo: image } : {}),
  });
  console.log("ok", item.id);
  if (++fetched % SAVE_EVERY === 0) save(done);
}

save(done);
console.log(`saved ${done.size} Solana collections`);
