import { config } from "../config.mjs";
import { vaultAbi } from "../abis.mjs";
import { loadCoins, publicClient, write, log } from "../chain.mjs";
import { listingsFor } from "../market/opensea.mjs";

const HOUR = 3600;
let warned = false;

/**
 * The cap the keeper may post right now, given the vault's own rules: it can fall at any time, but may rise
 * by at most 10% once per hour, and never above the hard ceiling.
 */
export function nextCap({ cap, lastRaiseAt, hardMaxCap, desired, now }) {
  let target = desired > hardMaxCap ? hardMaxCap : desired;
  if (cap === 0n) return target;
  if (target > cap) {
    const mayRaise = now >= lastRaiseAt + BigInt(HOUR);
    const limit = mayRaise ? (cap * 11_000n) / 10_000n : cap;
    target = target < limit ? target : limit;
  }
  return target;
}

/** Posts a fresh price cap for each vault and buys the cheapest listings the vault is allowed to afford. */
export async function market(source = { listingsFor }) {
  if (!config.openSeaKey && source.listingsFor === listingsFor) {
    if (!warned) log("market: OPENSEA_API_KEY is not set, so price caps and purchases are skipped");
    warned = true;
    return;
  }

  const coins = await loadCoins();
  const byVault = new Map();
  for (const c of coins) {
    const row = byVault.get(c.vault) ?? { collection: c.collection, coins: [] };
    row.coins.push(c.coin);
    byVault.set(c.vault, row);
  }

  for (const [vault, { collection, coins: vaultCoins }] of byVault) {
    try {
      const listings = await source.listingsFor(collection);
      if (listings.length === 0) continue;
      const floor = listings[0].price;

      const [cap, capPostedAt, lastRaiseAt, hardMaxCap] = await Promise.all([
        publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "cap" }),
        publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "capPostedAt" }),
        publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "lastRaiseAt" }),
        publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "hardMaxCap" }),
      ]);
      const now = BigInt((await publicClient.getBlock()).timestamp);

      const desired = (floor * (10_000n + config.capMarginBps)) / 10_000n;
      const target = nextCap({ cap, lastRaiseAt, hardMaxCap, desired, now });
      const stale = now - capPostedAt >= BigInt(config.capRefreshSeconds);

      let effectiveCap = cap;
      if (target !== cap || stale) {
        await write(`post cap ${target} for ${vault}`, { address: vault, abi: vaultAbi, functionName: "postCap", args: [target] });
        effectiveCap = target;
      }

      // buy: cheapest first, charging whichever coin has the most to spend
      const balances = new Map();
      for (const coin of vaultCoins) {
        balances.set(coin, await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "balanceOf", args: [coin] }));
      }
      let bought = 0;
      for (const l of listings) {
        if (bought >= config.maxBuysPerTick) break;
        if (l.price > effectiveCap) break; // sorted: nothing further is cheaper
        const [coin, balance] = [...balances.entries()].sort((a, b) => (a[1] > b[1] ? -1 : 1))[0];
        if (balance < l.price) continue;
        try {
          await write(`buy #${l.tokenId} for ${l.price} wei (coin ${coin})`, { address: vault, abi: vaultAbi, functionName: "buy", args: [l.order, coin] });
          balances.set(coin, balance - l.price);
          bought++;
        } catch (e) {
          log(`buy #${l.tokenId} skipped: ${(e.shortMessage ?? e.message).split("\n")[0]}`);
        }
      }
    } catch (e) {
      log(`market for vault ${vault} failed: ${(e.shortMessage ?? e.message).split("\n")[0]}`);
    }
  }
}
