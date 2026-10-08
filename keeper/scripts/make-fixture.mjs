import { mkdirSync, writeFileSync } from "node:fs";
import { buildSnapshot } from "../src/snapshot.mjs";
import { proofFor } from "../src/merkle.mjs";

// Builds a snapshot with the keeper's own code and writes it where the Solidity tests can read it, so the
// contract is checked against exactly what the keeper would post. Re-run after changing merkle.mjs/snapshot.mjs:
//   node scripts/make-fixture.mjs && (cd ../contracts && forge test --match-contract KeeperCompat)

const ZERO = "0x0000000000000000000000000000000000000000";
const holders = 13; // an odd count exercises the promoted-node case
const transfers = [];
for (let i = 1; i <= holders; i++) {
  transfers.push({ from: ZERO, to: `0x${(i * 7919).toString(16).padStart(40, "0")}`, value: BigInt(i * 1000 + (i % 3) * 37) * 10n ** 18n });
}
const snap = buildSnapshot(transfers);

const out = {
  root: snap.root,
  totalWeight: snap.totalWeight.toString(),
  holders: snap.holders.map((h) => ({
    index: h.index,
    holder: h.holder,
    start: h.start.toString(),
    end: h.end.toString(),
    proof: proofFor(snap.levels, h.index),
  })),
};

const dir = new URL("../../contracts/test/fixtures/", import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL("keeper-snapshot.json", dir), JSON.stringify(out, null, 2));
console.log(`fixture: ${out.holders.length} holders, root ${out.root}`);
