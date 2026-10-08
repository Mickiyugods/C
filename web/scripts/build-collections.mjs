import { readFileSync, writeFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/).filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const KEY = env.ROBINHOOD_RPC_URL.split("/").pop();

const GATEWAY = "https://gateway.pinata.cloud/ipfs/";
const MAX_INLINE_IMAGE = 40_000; // drop huge on-chain data URIs to keep the bundle small
const CONCURRENCY = 10;

const chains = {
  robinhood: { id: 4663, rpc: env.ROBINHOOD_RPC_URL, file: "robinhood-addresses.json" },
  ethereum: { id: 1, rpc: `https://eth-mainnet.g.alchemy.com/v2/${KEY}`, file: "ethereum-addresses.json" },
};

// Curated Robinhood collections first (kept in this order), then everything else found.
const curated = [
  "0x6dc3f3abf0945958be19b02f86be257c4a05fcf2",
  "0x539cdd042c2f3d93ebc5be7dfff0c79f3b4fabf0",
  "0xdd48c4e4b0b30c818cd2874a6195fe5927821e4f",
  "0x8c71d170fbd94bcba93bb08fc2cfd0e8620cd9ce",
  "0x116eaa62241751e0c98da43d458600c6c17cd361",
  "0x797a2e030b7e49107c8f07bf0300ea9cae88ca57",
  "0x0d63ab9be4c3b2889d780ee14de8534bc590feaf",
  "0xca75df55cc9c476db27a7375d1fc8e794cf80721",
  "0xe3b34c4bb0f12c82143745eee6a6cf4e3154b1fa",
  "0x9d1497d448a75e7d1a055d74cffa50bc15120845",
  "0x1dfe1ee1bba83152223e676f496feae62406bb56",
  "0x5b92776cf91208543074f97b6db652b28e4c459e",
  "0xe5143de9d3ccbc31ffb4e7fc66d8320e0e2693d2",
  "0xd0b2ef29166b67744ec5c27aabb179b14bdae606",
];

const readList = (file) => JSON.parse(readFileSync(new URL(`./${file}`, import.meta.url), "utf8")).map((a) => a.toLowerCase());

const targets = [
  ...[...new Set([...curated, ...readList(chains.robinhood.file)])].map((address) => ({ chain: "robinhood", address })),
  ...[...new Set(readList(chains.ethereum.file))].map((address) => ({ chain: "ethereum", address })),
];

const rpcCall = async (rpc, method, params) => {
  const r = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  return (await r.json()).result;
};
const call = (rpc, to, data) => rpcCall(rpc, "eth_call", [{ to, data }, "latest"]).catch(() => null);

const str = (h) => {
  if (!h || h.length < 130) return null;
  try {
    const x = h.slice(2);
    const l = parseInt(x.slice(64, 128), 16);
    return Buffer.from(x.slice(128, 128 + l * 2), "hex").toString().replace(/\0/g, "").trim() || null;
  } catch {
    return null;
  }
};
const toHttp = (u) => (u.startsWith("ipfs://") ? GATEWAY + u.slice(7).replace(/^ipfs\//, "") : u);

let gatewayChain = Promise.resolve();
const gatewayFetch = (url) => {
  const run = async () => {
    for (let attempt = 1; attempt <= 4; attempt++) {
      await new Promise((r) => setTimeout(r, 400 * attempt));
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (r.ok) return r;
        if (r.status !== 429 && r.status < 500) return null;
      } catch {
        /* retry */
      }
    }
    return null;
  };
  const p = gatewayChain.then(run);
  gatewayChain = p.then(() => {}, () => {});
  return p;
};

async function readMeta(uri) {
  if (uri.startsWith("data:application/json;base64,")) return JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString());
  if (uri.startsWith("data:application/json")) return JSON.parse(decodeURIComponent(uri.slice(uri.indexOf(",") + 1)));
  if (!/^(https?|ipfs):/.test(uri)) return null;
  const r =
    uri.startsWith("ipfs://") || uri.includes("/ipfs/")
      ? await gatewayFetch(toHttp(uri))
      : await fetch(toHttp(uri), { signal: AbortSignal.timeout(8000) }).catch(() => null);
  return r && r.ok ? await r.json() : null;
}

async function inspect({ chain, address }) {
  const rpc = chains[chain].rpc;
  const name = str(await call(rpc, address, "0x06fdde03"));
  if (!name) return null; // not a readable NFT contract
  const symbol = str(await call(rpc, address, "0x95d89b41"));
  const ts = await call(rpc, address, "0x18160ddd");
  const supply = ts && ts !== "0x" && ts.length <= 66 ? Number(BigInt(ts)) : null;

  let image = null;
  for (const id of [1, 0, 2]) {
    const uri = str(await call(rpc, address, "0xc87b56dd" + id.toString(16).padStart(64, "0")));
    if (!uri) continue;
    try {
      const m = await readMeta(uri);
      const img = m?.image || m?.image_url;
      if (img && !(img.startsWith("data:") && img.length > MAX_INLINE_IMAGE)) image = toHttp(img);
    } catch {
      /* metadata host unreachable */
    }
    break;
  }
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || address.slice(2, 8);
  return { chain, slug, address, name, symbol, supply, image };
}

const key = (c, a) => `${c}:${a}`;
let previous = new Map();
try {
  previous = new Map(
    JSON.parse(readFileSync(new URL("../src/data/onchain.json", import.meta.url), "utf8")).map((r) => [key(r.chain ?? "robinhood", r.address), r]),
  );
} catch {
  /* first run */
}

const out = new Array(targets.length);
let next = 0;
let done = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < targets.length) {
      const i = next++;
      try {
        const prev = previous.get(key(targets[i].chain, targets[i].address));
        out[i] = prev && prev.image ? { ...prev, chain: targets[i].chain } : await inspect(targets[i]);
      } catch {
        out[i] = null;
      }
      if (++done % 20 === 0) console.log(`${done}/${targets.length}`);
    }
  }),
);

const seen = new Set();
const unique = out.filter(Boolean).map((r) => {
  let slug = r.slug;
  for (let n = 2; seen.has(slug); n++) slug = `${r.slug}-${n}`;
  seen.add(slug);
  return { ...r, slug };
});

writeFileSync(new URL("../src/data/onchain.json", import.meta.url), JSON.stringify(unique, null, 2) + "\n");
for (const c of Object.keys(chains)) {
  const rows = unique.filter((r) => r.chain === c);
  console.log(`${c}: targets ${targets.filter((t) => t.chain === c).length} | readable ${rows.length} | with image ${rows.filter((r) => r.image).length}`);
}
