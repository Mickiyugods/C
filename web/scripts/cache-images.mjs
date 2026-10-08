import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Downloads each collection logo once, shrinks it, and serves it from /logos so the
// site does not depend on a third-party CDN being fast or open.
const dataFile = new URL("../src/data/onchain.json", import.meta.url);
const outDir = new URL("../public/logos/", import.meta.url);
mkdirSync(outDir, { recursive: true });

const rows = JSON.parse(readFileSync(dataFile, "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function download(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
      if (r.status !== 429 && r.status < 500) return null;
    } catch {
      /* retry */
    }
    await sleep(1500 * attempt);
  }
  return null;
}

const todo = rows.filter((r) => r.logo && /^https?:/.test(r.logo));
let ok = 0;
let fail = 0;
let finished = 0;

async function handle(r) {
  const file = `${r.chain}-${r.address}.webp`;
  const target = new URL(file, outDir);
  if (!existsSync(target)) {
    const buf = await download(r.logo);
    if (!buf) return void fail++;
    try {
      await sharp(buf).resize(192, 192, { fit: "cover" }).webp({ quality: 82 }).toFile(fileURLToPath(target));
    } catch {
      return void fail++; // not a decodable raster image
    }
  }
  r.logoSource ??= r.logo;
  r.logo = `/logos/${file}`;
  ok++;
}

let next = 0;
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (next < todo.length) {
      await handle(todo[next++]);
      if (++finished % 25 === 0) console.log(`${finished}/${todo.length} (ok ${ok}, failed ${fail})`);
    }
  }),
);

writeFileSync(dataFile, JSON.stringify(rows, null, 2) + "\n");
console.log(`done: cached ${ok}, failed ${fail}, of ${todo.length} logos`);
