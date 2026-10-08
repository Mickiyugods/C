import { bls12_381 as bls } from "@noble/curves/bls12-381";

// drand quicknet: 3 second rounds, signatures on G1.
export const CHAIN_HASH = "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971";
export const GENESIS_TIME = 1692803367;
export const PERIOD = 3;
const ENDPOINTS = ["https://api.drand.sh", "https://drand.cloudflare.com", "https://api2.drand.sh"];

export const roundAt = (ts) => (ts < GENESIS_TIME ? 0 : Math.floor((ts - GENESIS_TIME) / PERIOD) + 1);
export const timeOf = (round) => GENESIS_TIME + (round - 1) * PERIOD;

const pad64 = (n) => n.toString(16).padStart(128, "0");

/** 48 byte compressed G1 point (as published by drand) to the 128 byte uncompressed form the contract expects. */
export function decompressSignature(compressedHex) {
  const p = bls.G1.ProjectivePoint.fromHex(compressedHex).toAffine();
  return `0x${pad64(p.x)}${pad64(p.y)}`;
}

/** Fetches a round from the public drand API and returns the uncompressed signature, or null if not published. */
export async function fetchSignature(round) {
  for (const base of ENDPOINTS) {
    try {
      const res = await fetch(`${base}/${CHAIN_HASH}/public/${round}`, { signal: AbortSignal.timeout(10_000) });
      if (res.status === 404) return null; // not published yet
      if (!res.ok) continue;
      const json = await res.json();
      return decompressSignature(json.signature);
    } catch {
      /* try the next endpoint */
    }
  }
  throw new Error(`Could not reach any drand endpoint for round ${round}`);
}
