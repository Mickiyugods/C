import { readFileSync, writeFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/).filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const KEY = env.ROBINHOOD_RPC_URL.split("/").pop();
const nets = { robinhood: "robinhood-mainnet", ethereum: "eth-mainnet" };

const file = new URL("../src/data/onchain.json", import.meta.url);
const rows = JSON.parse(readFileSync(file, "utf8"));

let next = 0;
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (next < rows.length) {
      const r = rows[next++];
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch(
            `https://${nets[r.chain]}.g.alchemy.com/nft/v3/${KEY}/getContractMetadata?contractAddress=${r.address}`,
            { signal: AbortSignal.timeout(20000) },
          );
          if (res.status === 429) { await new Promise((x) => setTimeout(x, 1500 * attempt)); continue; }
          const m = (await res.json()).openSeaMetadata ?? {};
          if (m.bannerImageUrl) r.bannerSource = m.bannerImageUrl;
          if (m.imageUrl && !r.logo) r.logo = m.imageUrl;
          break;
        } catch {
          await new Promise((x) => setTimeout(x, 1000 * attempt));
        }
      }
    }
  }),
);

writeFileSync(file, JSON.stringify(rows, null, 2) + "\n");
for (const c of ["robinhood", "ethereum"]) {
  const s = rows.filter((r) => r.chain === c);
  console.log(`${c}: ${s.length} collections, ${s.filter((r) => r.bannerSource).length} with banner`);
}
