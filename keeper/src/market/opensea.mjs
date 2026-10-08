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

/** Cheapest valid listings first. Needs OPENSEA_API_KEY. */
export async function listingsFor(collection) {
  if (!config.openSeaKey) throw new Error("OPENSEA_API_KEY is not set");
  const url = new URL(`https://api.opensea.io/api/v2/orders/${config.openSeaChain}/seaport/listings`);
  url.searchParams.set("asset_contract_address", collection);
  url.searchParams.set("order_by", "eth_price");
  url.searchParams.set("order_direction", "asc");
  url.searchParams.set("limit", "50");

  const res = await fetch(url, { headers: { "x-api-key": config.openSeaKey, accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`OpenSea answered ${res.status}`);
  const json = await res.json();
  return (json.orders ?? [])
    .map((o) => normalizeOrder(o, collection))
    .filter(Boolean)
    .sort((a, b) => (a.price < b.price ? -1 : a.price > b.price ? 1 : 0));
}
