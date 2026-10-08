import { encodeAbiParameters, keccak256, concat } from "viem";

// Merkle tree compatible with RaffleDistributor:
//   leaf   = keccak256(keccak256(abi.encode(index, holder, start, end)))   (double hash)
//   parent = keccak256(sorted(left, right))                                 (sorted pairs)
// An odd node on a level is promoted unchanged to the next level.

export function leafHash(index, holder, start, end) {
  const inner = keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }],
      [BigInt(index), holder, BigInt(start), BigInt(end)],
    ),
  );
  return keccak256(inner);
}

export function hashPair(a, b) {
  return BigInt(a) < BigInt(b) ? keccak256(concat([a, b])) : keccak256(concat([b, a]));
}

/** Builds every level of the tree. levels[0] are the leaves, the last level holds the root. */
export function buildTree(leaves) {
  if (leaves.length === 0) throw new Error("A tree needs at least one leaf");
  const levels = [leaves];
  while (levels[levels.length - 1].length > 1) {
    const prev = levels[levels.length - 1];
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      next.push(i + 1 < prev.length ? hashPair(prev[i], prev[i + 1]) : prev[i]);
    }
    levels.push(next);
  }
  return levels;
}

export const rootOf = (levels) => levels[levels.length - 1][0];

export function proofFor(levels, index) {
  const proof = [];
  let i = index;
  for (let l = 0; l < levels.length - 1; l++) {
    const sibling = i % 2 === 0 ? i + 1 : i - 1;
    if (sibling < levels[l].length) proof.push(levels[l][sibling]);
    i = Math.floor(i / 2);
  }
  return proof;
}

export function verifyProof(proof, root, leaf) {
  let h = leaf;
  for (const p of proof) h = hashPair(h, p);
  return h === root;
}
