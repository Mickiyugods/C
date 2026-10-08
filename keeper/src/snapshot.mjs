import { getAddress } from "viem";
import { leafHash, buildTree, rootOf, proofFor } from "./merkle.mjs";

const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dEaD";

/**
 * Turns a list of ERC-20 transfers into balances, drops addresses that must never win a giveaway, and tiles
 * the remaining balances into weight ranges. Everything is deterministic: given the same transfers and the
 * same exclusions anyone gets the same root, which is what makes the snapshot checkable.
 *
 * @param transfers  [{ from, to, value }] in chain order, up to and including the snapshot block
 * @param exclude    addresses that hold coins but cannot win: the curve, Pons contracts, the router, the vault ...
 * @returns { holders: [{ index, holder, start, end }], totalWeight, levels, root }
 */
export function buildSnapshot(transfers, exclude = []) {
  const skip = new Set([ZERO, DEAD, ...exclude].map((a) => a.toLowerCase()));

  const balances = new Map();
  for (const t of transfers) {
    const from = t.from.toLowerCase();
    const to = t.to.toLowerCase();
    if (from !== ZERO) balances.set(from, (balances.get(from) ?? 0n) - t.value);
    if (to !== ZERO) balances.set(to, (balances.get(to) ?? 0n) + t.value);
  }

  const eligible = [...balances.entries()]
    .filter(([addr, bal]) => bal > 0n && !skip.has(addr))
    .sort(([a], [b]) => (a < b ? -1 : 1)); // ascending address: a stable, reproducible order

  let cursor = 0n;
  const holders = eligible.map(([addr, bal], index) => {
    const start = cursor;
    cursor += bal;
    return { index, holder: getAddress(addr), start, end: cursor };
  });
  if (holders.length === 0) throw new Error("No eligible holders at the snapshot block");

  const levels = buildTree(holders.map((h) => leafHash(h.index, h.holder, h.start, h.end)));
  return { holders, totalWeight: cursor, levels, root: rootOf(levels) };
}

/** The leaf and Merkle proof of the holder whose range contains `ticket`. */
export function winnerOf(snapshot, ticket) {
  const h = snapshot.holders.find((x) => ticket >= x.start && ticket < x.end);
  if (!h) throw new Error(`Ticket ${ticket} is outside the snapshot`);
  return { ...h, proof: proofFor(snapshot.levels, h.index) };
}
