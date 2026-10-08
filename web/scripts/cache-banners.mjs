import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Downloads each collection banner once, shrinks it, and serves it from /banners.
const dataFile = new URL("../src/data/onchain.json", import.meta.url);
const outDir = new URL("../public/banners/", import.meta.url);
mkdirSync(outDir, { recursive: true });

const rows = JSON.parse(readFileSync(dataFile, "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function download(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
      if (r.status !== 429 && r.status < 500) return null;
    } catch {
      /* retry */
    }
    await sleep(1500 * attempt);
  }
  return null;
}

const todo = rows.filter((r) => r.bannerSource);
let ok = 0;
let fail = 0;
let finished = 0;

async function handle(r) {
  const file = `${r.chain}-${r.address}.webp`;
  const target = new URL(file, outDir);
  if (!existsSync(target)) {
    const buf = await download(r.bannerSource);
    if (!buf) return void fail++;
    try {
      await sharp(buf).resize(640, 240, { fit: "cover" }).webp({ quality: 78 }).toFile(fileURLToPath(target));
    } catch {
      return void fail++;
    }
  }
  r.banner = `/banners/${file}`;
  ok++;
}

let next = 0;
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (next < todo.length) {
      await handle(todo[next++]);
      if (++finished % 50 === 0) console.log(`${finished}/${todo.length} (ok ${ok}, failed ${fail})`);
    }
  }),
);

writeFileSync(dataFile, JSON.stringify(rows, null, 2) + "\n");
console.log(`done: cached ${ok}, failed ${fail}, of ${todo.length} banners`);
