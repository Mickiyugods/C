import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { leafHash, buildTree, rootOf, proofFor, verifyProof } from "../src/merkle.mjs";
import { buildSnapshot, winnerOf } from "../src/snapshot.mjs";
import { decompressSignature, roundAt, timeOf, GENESIS_TIME } from "../src/drand.mjs";

const addr = (n) => `0x${n.toString(16).padStart(40, "0")}`;
const ZERO = "0x0000000000000000000000000000000000000000";

// ---------------------------------------------------------------- merkle

test("every leaf of every tree size has a proof that verifies, and tampering breaks it", () => {
  for (let n = 1; n <= 17; n++) {
    const leaves = Array.from({ length: n }, (_, i) => leafHash(i, addr(i + 1), i * 10, i * 10 + 10));
    const levels = buildTree(leaves);
    const root = rootOf(levels);
    for (let i = 0; i < n; i++) {
      const proof = proofFor(levels, i);
      assert.ok(verifyProof(proof, root, leaves[i]), `n=${n} i=${i}`);
      const forged = leafHash(i, addr(9999), i * 10, i * 10 + 10);
      assert.ok(!verifyProof(proof, root, forged), `forged leaf accepted n=${n} i=${i}`);
    }
  }
});

test("a single leaf tree has the leaf as its root and an empty proof", () => {
  const leaf = leafHash(0, addr(1), 0, 100);
  const levels = buildTree([leaf]);
  assert.equal(rootOf(levels), leaf);
  assert.deepEqual(proofFor(levels, 0), []);
});

test("an empty tree is rejected", () => {
  assert.throws(() => buildTree([]));
});

// ---------------------------------------------------------------- snapshot

test("balances are rebuilt from transfers, excluded addresses are dropped, ranges tile", () => {
  const curve = addr(100);
  const transfers = [
    { from: ZERO, to: curve, value: 1000n }, // mint to the curve
    { from: curve, to: addr(3), value: 300n },
    { from: curve, to: addr(1), value: 100n },
    { from: curve, to: addr(2), value: 200n },
    { from: addr(3), to: addr(1), value: 50n }, // 1 now holds 150, 3 holds 250
    { from: addr(2), to: "0x000000000000000000000000000000000000dEaD", value: 200n }, // 2 burns everything
  ];
  const snap = buildSnapshot(transfers, [curve]);

  assert.deepEqual(
    snap.holders.map((h) => [h.holder.toLowerCase(), h.start, h.end]),
    [
      [addr(1), 0n, 150n],
      [addr(3), 150n, 400n],
    ],
    "sorted by address, curve and burned balances excluded",
  );
  assert.equal(snap.totalWeight, 400n);
  assert.equal(snap.holders[0].end, snap.holders[1].start, "ranges are contiguous");
});

test("the snapshot is deterministic whatever order equal data arrives in", () => {
  const a = [
    { from: ZERO, to: addr(5), value: 10n },
    { from: ZERO, to: addr(4), value: 20n },
  ];
  const b = [...a].reverse();
  assert.equal(buildSnapshot(a).root, buildSnapshot(b).root);
});

test("the winner is the holder whose range contains the ticket, with a valid proof", () => {
  const transfers = Array.from({ length: 6 }, (_, i) => ({ from: ZERO, to: addr(i + 1), value: BigInt((i + 1) * 100) }));
  const snap = buildSnapshot(transfers);
  for (const ticket of [0n, 99n, 100n, 299n, 300n, snap.totalWeight - 1n]) {
    const w = winnerOf(snap, ticket);
    assert.ok(ticket >= w.start && ticket < w.end);
    assert.ok(verifyProof(w.proof, snap.root, leafHash(w.index, w.holder, w.start, w.end)));
  }
  assert.throws(() => winnerOf(snap, snap.totalWeight));
});

test("a snapshot with nobody eligible is an error, not an empty tree", () => {
  assert.throws(() => buildSnapshot([{ from: ZERO, to: addr(1), value: 5n }], [addr(1)]));
});

// ---------------------------------------------------------------- drand

test("decompressing the real beacon of round 100000 gives exactly the bytes the contracts are tested with", () => {
  const compressed = "b389ee950d02e062419be63c5c71aecc7b2751edb81743927488bc74738af69e84d9d13b4b87e09e39ec97ec35f98968";
  const vectors = readFileSync(new URL("../../contracts/test/DrandVectors.sol", import.meta.url), "utf8");
  const sigA = vectors.match(/SIG_A = hex"([0-9a-f]+)"/)[1];
  assert.equal(decompressSignature(compressed), `0x${sigA}`);
});

test("round timing matches the Solidity library", () => {
  assert.equal(roundAt(GENESIS_TIME), 1);
  assert.equal(roundAt(GENESIS_TIME + 2), 1);
  assert.equal(roundAt(GENESIS_TIME + 3), 2);
  assert.equal(timeOf(100000), GENESIS_TIME + 99999 * 3);
  assert.equal(roundAt(timeOf(5_000_000)), 5_000_000);
  assert.equal(roundAt(1000), 0);
});
