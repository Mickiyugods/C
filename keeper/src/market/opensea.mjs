import { config } from "../config.mjs";

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Converts one OpenSea API order into the exact shape Vault.buy accepts, or returns null when the vault would
 * reject it anyway (so we never waste gas on it). The vault only buys plain listings: FULL_OPEN, one ERC-721 of
 * the collection, fixed price, paid entirely in ETH, still inside its time window.
 */
export function normalizeOrder(o, collection, nowSeconds = Math.floor(Date.now() / 1000)) {
  const p = o?.protocol_data?.parameters;
  const signature = o?.protocol_data?.signature;
  if (!p || !signature) return null;

  if (Number(p.orderType) !== 0) return null; // FULL_OPEN only
  if (!Array.isArray(p.offer) || p.offer.length !== 1) return null;
  const offer = p.offer[0];
  if (Number(offer.itemType) !== 2 || offer.token.toLowerCase() !== collection.toLowerCase()) return null;
  if (BigInt(offer.startAmount) !== 1n || BigInt(offer.endAmount) !== 1n) return null;

  if (!Array.isArray(p.consideration) || p.consideration.length === 0) return null;
  if (p.consideration.length !== Number(p.totalOriginalConsiderationItems)) return null;

  let price = 0n;
  for (const c of p.consideration) {
    if (Number(c.itemType) !== 0) return null; // ETH only
    if (BigInt(c.startAmount) !== BigInt(c.endAmount)) return null; // fixed price
    price += BigInt(c.startAmount);
  }

  if (Number(p.startTime) > nowSeconds || Number(p.endTime) <= nowSeconds + 60) return null; // not live, or about to expire

  const parameters = {
    offerer: p.offerer,
    zone: p.zone ?? ZERO,
    offer: [{ itemType: 2, token: offer.token, identifierOrCriteria: BigInt(offer.identifierOrCriteria), startAmount: 1n, endAmount: 1n }],
    consideration: p.consideration.map((c) => ({
      itemType: 0,
      token: c.token ?? ZERO,
      identifierOrCriteria: BigInt(c.identifierOrCriteria ?? 0),
      startAmount: BigInt(c.startAmount),
      endAmount: BigInt(c.endAmount),
      recipient: c.recipient,
    })),
    orderType: 0,
    startTime: BigInt(p.startTime),
    endTime: BigInt(p.endTime),
    zoneHash: p.zoneHash,
    salt: BigInt(p.salt),
    conduitKey: p.conduitKey,
    totalOriginalConsiderationItems: BigInt(p.totalOriginalConsiderationItems),
  };

  return { order: { parameters, signature }, price, tokenId: parameters.offer[0].identifierOrCriteria, hash: o.order_hash };
}

const API = "https://api.opensea.io/api/v2";
// How many of the cheapest listings to fetch a signature for each pass (one request per listing).
const FULFILL_LIMIT = 8;
// A FULL_OPEN listing can be filled by anyone, so the seller's signature is the same whatever fulfiller we
// name here. The vault fills the order on-chain as itself; this address is only used to fetch the signature.
const PROBE_FULFILLER = "0x000000000000000000000000000000000000dEaD";

async function os(path, init) {
  const headers = { "x-api-key": config.openSeaKey, accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}) };
  const res = await fetch(`${API}${path}`, { ...init, headers, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`OpenSea ${path.split("?")[0]} answered ${res.status}`);
  return res.json();
}

/** OpenSea's slug for a collection contract on this chain — the listings endpoints are keyed by slug. */
async function slugFor(collection) {
  const j = await os(`/chain/${config.openSeaChain}/contract/${collection}`);
  if (!j.collection) throw new Error(`OpenSea has no collection for ${collection}`);
  return j.collection;
}

/** Fetches the seller's signature for a listing and shapes it like the old orders API so normalizeOrder can read it. */
async function signedOrder(listing) {
  const body = JSON.stringify({
    listing: { hash: listing.order_hash, chain: listing.chain, protocol_address: listing.protocol_address },
    fulfiller: { address: PROBE_FULFILLER },
  });
  const j = await os(`/listings/fulfillment_data`, { method: "POST", body });
  const o = j?.fulfillment_data?.orders?.[0];
  if (!o?.parameters || !o?.signature) return null;
  return { protocol_data: { parameters: o.parameters, signature: o.signature }, order_hash: listing.order_hash };
}

/**
 * Cheapest valid listings first, each a fully signed Seaport order the vault can fulfill. Needs OPENSEA_API_KEY.
 * OpenSea's current API lists orders without the signature, so we resolve the collection slug, pull the cheapest
 * listings, then fetch each one's signature through the fulfillment endpoint before normalizing it.
 */
export async function listingsFor(collection) {
  if (!config.openSeaKey) throw new Error("OPENSEA_API_KEY is not set");
  const slug = await slugFor(collection);
  const { listings = [] } = await os(`/listings/collection/${slug}/best?limit=30`);

  const cheapest = listings
    .map((l) => ({ l, wei: BigInt(l?.price?.current?.value ?? "0") }))
    .filter((c) => c.wei > 0n)
    .sort((a, b) => (a.wei < b.wei ? -1 : a.wei > b.wei ? 1 : 0))
    .slice(0, FULFILL_LIMIT);

  const out = [];
  for (const { l } of cheapest) {
    try {
      const order = await signedOrder(l);
      const norm = order && normalizeOrder(order, collection);
      if (norm) out.push(norm);
    } catch {
      // skip a listing we cannot sign or normalize; keep scanning the rest
    }
  }
  return out.sort((a, b) => (a.price < b.price ? -1 : a.price > b.price ? 1 : 0));
}
