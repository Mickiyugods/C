// Server-side readers for everything the site shows about launched coins. They read the chain directly
// (events from the Launcher, Vault and RaffleDistributor plus a few view calls), so there is no database to
// keep in sync. Import this file from server components and route handlers only.

import { createPublicClient, defineChain, formatEther, getAbiItem, http, type Address, type PublicClient } from "viem";
import { contracts, CHAIN_ID, DEPLOY_BLOCK, isConfigured } from "./contracts";
import { launcherAbi, vaultAbi, feeRouterAbi, raffleDistributorAbi, ponsCurveAbi, collectionRegistryAbi, erc20Abi } from "./abis";
import type { Analytics, Coin, CollectionStats, Policy, RaffleRow, RaffleState } from "./types";

const rpcUrl = process.env.CURATO_RPC_URL ?? process.env.ROBINHOOD_RPC_URL;

const chain = defineChain({
  id: CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl ?? "http://127.0.0.1:8545"] } },
  // The canonical Multicall3 is deployed on Robinhood Chain; viem needs to know it to batch reads.
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});

let _client: PublicClient | undefined;
export function client(): PublicClient {
  if (!rpcUrl) throw new Error("ROBINHOOD_RPC_URL (or CURATO_RPC_URL) is not set");
  return (_client ??= createPublicClient({ chain, transport: http(rpcUrl, { batch: true }) }) as PublicClient);
}

// ------------------------------------------------------------------ tiny TTL cache

const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

// ------------------------------------------------------------------ helpers

const CHUNK = 200_000n;

async function logsChunked<T>(fetch: (from: bigint, to: bigint) => Promise<T[]>): Promise<T[]> {
  const c = client();
  const head = await c.getBlockNumber();
  const out: T[] = [];
  for (let from = DEPLOY_BLOCK; from <= head; from += CHUNK) {
    const to = from + CHUNK - 1n > head ? head : from + CHUNK - 1n;
    out.push(...(await fetch(from, to)));
  }
  return out;
}

const eth = (wei: bigint) => Number(formatEther(wei));

// ------------------------------------------------------------------ coins

export async function getCoins(): Promise<Coin[]> {
  if (!isConfigured) return [];
  return cached("coins", 5_000, loadCoins);
}

async function loadCoins(): Promise<Coin[]> {
  const c = client();
  const launcher = contracts.launcher!;

  const launched = await logsChunked((fromBlock, toBlock) =>
    c.getLogs({ address: launcher, event: getAbiItem({ abi: launcherAbi, name: "CoinLaunched" }), fromBlock, toBlock }),
  );
  if (launched.length === 0) return [];

  const [metadata, socialLogs] = await Promise.all([
    logsChunked((fromBlock, toBlock) =>
      c.getLogs({ address: launcher, event: getAbiItem({ abi: launcherAbi, name: "CoinMetadata" }), fromBlock, toBlock }),
    ),
    logsChunked((fromBlock, toBlock) =>
      c.getLogs({ address: launcher, event: getAbiItem({ abi: launcherAbi, name: "CoinSocials" }), fromBlock, toBlock }),
    ).catch(() => []),
  ]);
  const meta = new Map(metadata.map((l) => [l.args.coin!.toLowerCase(), l.args]));
  const socialsMap = new Map(socialLogs.map((l) => [l.args.coin!.toLowerCase(), l.args]));

  // curve state and launch time
  const calls = launched.flatMap((l) => [
    { address: l.args.curve as Address, abi: ponsCurveAbi, functionName: "getReserves" as const },
    { address: l.args.curve as Address, abi: ponsCurveAbi, functionName: "sellableTokens" as const },
    { address: launcher, abi: launcherAbi, functionName: "coinInfo" as const, args: [l.args.coin as Address] },
  ]);
  const results = await c.multicall({ contracts: calls, allowFailure: true });

  // ETH harvested per router
  const routers = launched.map((l) => l.args.router as Address);
  const harvests = await logsChunked((fromBlock, toBlock) =>
    c.getLogs({ address: routers, event: getAbiItem({ abi: feeRouterAbi, name: "Harvested" }), fromBlock, toBlock }),
  );
  const fees = new Map<string, bigint>();
  for (const h of harvests) {
    const k = h.address.toLowerCase();
    fees.set(k, (fees.get(k) ?? 0n) + (h.args.received ?? 0n));
  }

  const SUPPLY = 1_000_000_000;
  return launched
    .map((l, i): Coin => {
      const a = l.args;
      const reserves = results[i * 3].result as readonly [bigint, bigint] | undefined;
      const sellable = results[i * 3 + 1].result as bigint | undefined;
      const info = results[i * 3 + 2].result as { launchedAt: bigint } | undefined;
      const graduated = sellable !== undefined && sellable === 0n;
      const m = meta.get(String(a.coin).toLowerCase());
      const marketCapEth =
        !graduated && reserves && reserves[1] > 0n ? SUPPLY * (Number(reserves[0]) / Number(reserves[1])) : null;
      return {
        address: a.coin as string,
        name: m?.name ?? "",
        symbol: m?.symbol ?? "",
        logo: m?.logo ?? "",
        description: m?.description ?? "",
        creator: a.creator as string,
        collection: a.collection as string,
        curve: a.curve as string,
        router: a.router as string,
        vault: a.vault as string,
        policy: (Number(a.policy) === 2 ? "burn" : "airdrop") as Policy,
        creatorTaxBps: Number(a.creatorTaxBps),
        launchedAt: info ? Number(info.launchedAt) : 0,
        graduated,
        marketCapEth,
        feesRoutedEth: eth(fees.get(String(a.router).toLowerCase()) ?? 0n),
        socials: (() => {
          const s = socialsMap.get(String(a.coin).toLowerCase());
          return {
            twitter: s?.twitter ?? "",
            telegram: s?.telegram ?? "",
            discord: s?.discord ?? "",
            website: s?.website ?? "",
            farcaster: s?.farcaster ?? "",
          };
        })(),
      };
    })
    .sort((x, y) => y.launchedAt - x.launchedAt);
}

export async function getCoin(address: string): Promise<Coin | undefined> {
  const all = await getCoins();
  return all.find((c) => c.address.toLowerCase() === address.toLowerCase());
}

// ------------------------------------------------------------------ collections

/** Which of these collections the registry currently lets new coins pair with (lowercase addresses). */
export async function getListedCollections(addresses: string[]): Promise<string[]> {
  if (!isConfigured) return [];
  return cached(`listed:${addresses.length}`, 30_000, async () => {
    const results = await client().multicall({
      contracts: addresses.map((a) => ({ address: contracts.registry!, abi: collectionRegistryAbi, functionName: "isListed" as const, args: [a as Address] })),
      allowFailure: true,
    });
    return addresses.filter((_, i) => results[i].result === true).map((a) => a.toLowerCase());
  });
}

export async function getCollectionStats(): Promise<Record<string, CollectionStats>> {
  if (!isConfigured) return {};
  return cached("collectionStats", 15_000, loadCollectionStats);
}

async function loadCollectionStats(): Promise<Record<string, CollectionStats>> {
  const c = client();
  const coins = await getCoins();
  const byCollection = new Map<string, { vault: string; coins: number }>();
  for (const coin of coins) {
    const k = coin.collection.toLowerCase();
    const row = byCollection.get(k) ?? { vault: coin.vault, coins: 0 };
    row.coins++;
    byCollection.set(k, row);
  }
  if (byCollection.size === 0) return {};

  const vaults = [...byCollection.values()].map((v) => v.vault as Address);
  const [bought, burned, released, balances] = await Promise.all([
    logsChunked((fromBlock, toBlock) => c.getLogs({ address: vaults, event: getAbiItem({ abi: vaultAbi, name: "Bought" }), fromBlock, toBlock })),
    logsChunked((fromBlock, toBlock) => c.getLogs({ address: vaults, event: getAbiItem({ abi: vaultAbi, name: "Burned" }), fromBlock, toBlock })),
    logsChunked((fromBlock, toBlock) => c.getLogs({ address: vaults, event: getAbiItem({ abi: vaultAbi, name: "Released" }), fromBlock, toBlock })),
    Promise.all(vaults.map((v) => c.getBalance({ address: v }))),
  ]);

  const count = (logs: { address: string }[], vault: string) => logs.filter((l) => l.address.toLowerCase() === vault.toLowerCase()).length;

  const out: Record<string, CollectionStats> = {};
  [...byCollection.entries()].forEach(([collection, v], i) => {
    const b = count(bought, v.vault);
    const bu = count(burned, v.vault);
    const r = count(released, v.vault);
    out[collection] = {
      coins: v.coins,
      vault: v.vault,
      ethInVault: eth(balances[i]),
      nftsBought: b,
      nftsBurned: bu,
      nftsDelivered: r,
      nftsHeld: Math.max(0, b - bu - r),
    };
  });
  return out;
}

// ------------------------------------------------------------------ raffles

const raffleStates: RaffleState[] = ["pending", "pending", "posted", "requested", "drawn", "settled"];

export async function getRaffles(limit = 100): Promise<RaffleRow[]> {
  if (!isConfigured) return [];
  return cached("raffles", 10_000, () => loadRaffles(limit));
}

async function loadRaffles(limit: number): Promise<RaffleRow[]> {
  const c = client();
  const distributor = contracts.distributor!;
  const count = Number(await c.readContract({ address: distributor, abi: raffleDistributorAbi, functionName: "raffleCount" }));
  if (count === 0) return [];

  const ids = Array.from({ length: Math.min(count, limit) }, (_, i) => count - i);
  const results = await c.multicall({
    contracts: ids.map((id) => ({ address: distributor, abi: raffleDistributorAbi, functionName: "raffle" as const, args: [BigInt(id)] })),
    allowFailure: true,
  });

  return ids.flatMap((id, i) => {
    const r = results[i].result as
      | { collection: string; coin: string; tokenId: bigint; state: number; winner: string; postedAt: bigint; drawRound: bigint }
      | undefined;
    if (!r) return [];
    const state = raffleStates[Number(r.state)] ?? "pending";
    return [
      {
        id,
        collection: r.collection,
        coin: r.coin,
        tokenId: r.tokenId.toString(),
        state,
        winner: state === "settled" ? r.winner : null,
        postedAt: Number(r.postedAt),
        drawRound: Number(r.drawRound),
      },
    ];
  });
}

// ------------------------------------------------------------------ analytics

export async function getAnalytics(): Promise<Analytics> {
  const [coins, stats] = await Promise.all([getCoins(), getCollectionStats()]);
  const rows = Object.values(stats);
  return {
    coins: coins.length,
    graduated: coins.filter((x) => x.graduated).length,
    feesRoutedEth: coins.reduce((s, x) => s + x.feesRoutedEth, 0),
    ethInVaultsEth: rows.reduce((s, x) => s + x.ethInVault, 0),
    nftsBought: rows.reduce((s, x) => s + x.nftsBought, 0),
    nftsBurned: rows.reduce((s, x) => s + x.nftsBurned, 0),
    nftsDelivered: rows.reduce((s, x) => s + x.nftsDelivered, 0),
    collectionsWithCoins: rows.length,
  };
}

// ------------------------------------------------------------------ NFTs the vaults bought

export type Purchase = {
  collection: string;
  coin: string;
  tokenId: string;
  priceEth: number;
  status: "held" | "delivered" | "burned";
  block: number;
};

export async function getPurchases(): Promise<Purchase[]> {
  if (!isConfigured) return [];
  return cached("purchases", 15_000, loadPurchases);
}

async function loadPurchases(): Promise<Purchase[]> {
  const c = client();
  const coins = await getCoins();
  if (coins.length === 0) return [];

  const vaultToCollection = new Map(coins.map((x) => [x.vault.toLowerCase(), x.collection]));
  const vaults = [...vaultToCollection.keys()] as Address[];

  const [bought, burned, released] = await Promise.all([
    logsChunked((fromBlock, toBlock) => c.getLogs({ address: vaults, event: getAbiItem({ abi: vaultAbi, name: "Bought" }), fromBlock, toBlock })),
    logsChunked((fromBlock, toBlock) => c.getLogs({ address: vaults, event: getAbiItem({ abi: vaultAbi, name: "Burned" }), fromBlock, toBlock })),
    logsChunked((fromBlock, toBlock) => c.getLogs({ address: vaults, event: getAbiItem({ abi: vaultAbi, name: "Released" }), fromBlock, toBlock })),
  ]);

  const key = (vault: string, tokenId: bigint | undefined) => `${vault.toLowerCase()}:${tokenId}`;
  const burnedSet = new Set(burned.map((l) => key(l.address, l.args.tokenId)));
  const releasedSet = new Set(released.map((l) => key(l.address, l.args.tokenId)));

  return bought
    .map((l): Purchase => {
      const k = key(l.address, l.args.tokenId);
      return {
        collection: vaultToCollection.get(l.address.toLowerCase()) ?? "",
        coin: String(l.args.coin),
        tokenId: String(l.args.tokenId),
        priceEth: eth(l.args.price ?? 0n),
        status: burnedSet.has(k) ? "burned" : releasedSet.has(k) ? "delivered" : "held",
        block: Number(l.blockNumber),
      };
    })
    .sort((a, b) => b.block - a.block);
}

// ------------------------------------------------------------------ one coin

export type Trade = { side: "buy" | "sell"; trader: string; ethValue: number; tokens: number; ts: number; tx: string; price: number };
export type Holder = { address: string; balance: number; pct: number; tag?: string };
export type CoinMarket = {
  priceEth: number; // marginal ETH per token
  realQuoteEth: number; // ETH raised toward graduation
  graduationEth: number;
  progress: number; // 0..1
  holders: number;
  trades: number;
  ethUsd: number; // USD per ETH, 0 if the rate could not be read
  reserveQuoteEth: number; // effective quote reserve (ETH) for quoting trades
  reserveToken: number; // effective token reserve
  feeBps: number; // curve fee in basis points
  toVaultEth: number; // cumulative fees routed to the vault (80%)
  toTreasuryEth: number; // cumulative fees routed to the treasury (20%)
};

/** USD per ETH from CoinGecko, cached for a minute so live refreshes don't hammer the API. */
export async function getEthUsd(): Promise<number> {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd", {
      next: { revalidate: 60 },
    });
    if (!r.ok) return 0;
    const j = await r.json();
    return Number(j?.ethereum?.usd) || 0;
  } catch {
    return 0;
  }
}

export type DevTransfer = { ts: number; to: string; tx: string };

export type CoinDetails = {
  coin: Coin;
  vaultBalanceEth: number;
  purchases: { tokenId: string; priceEth: number }[];
  market: CoinMarket;
  trades: Trade[];
  holders: Holder[];
  devTransfers: DevTransfer[];
  series: { t: number; price: number }[];
};

const SUPPLY = 1_000_000_000;
const ZERO = "0x0000000000000000000000000000000000000000";

/** Timestamps for a set of block numbers, fetched once each. */
async function blockTimes(blocks: bigint[]): Promise<Map<bigint, number>> {
  const c = client();
  const uniq = [...new Set(blocks.map((b) => b.toString()))].map((s) => BigInt(s));
  const times = await Promise.all(uniq.map((n) => c.getBlock({ blockNumber: n }).then((b) => [n, Number(b.timestamp)] as const)));
  return new Map(times);
}

async function getTrades(curve: Address): Promise<Trade[]> {
  const c = client();
  const [buys, sells] = await Promise.all([
    logsChunked((fromBlock, toBlock) => c.getLogs({ address: curve, event: getAbiItem({ abi: ponsCurveAbi, name: "CurveBuy" }), fromBlock, toBlock })),
    logsChunked((fromBlock, toBlock) => c.getLogs({ address: curve, event: getAbiItem({ abi: ponsCurveAbi, name: "CurveSell" }), fromBlock, toBlock })),
  ]);
  const times = await blockTimes([...buys, ...sells].map((l) => l.blockNumber!));
  const rows: Trade[] = [
    ...buys.map((l): Trade => ({
      side: "buy",
      trader: String(l.args.recipient),
      ethValue: eth(l.args.quoteIn ?? 0n),
      tokens: Number(formatEther(l.args.tokensOut ?? 0n)),
      ts: times.get(l.blockNumber!) ?? 0,
      tx: l.transactionHash!,
      price: 0,
    })),
    ...sells.map((l): Trade => ({
      side: "sell",
      trader: String(l.args.seller),
      ethValue: eth(l.args.quoteOut ?? 0n),
      tokens: Number(formatEther(l.args.tokensIn ?? 0n)),
      ts: times.get(l.blockNumber!) ?? 0,
      tx: l.transactionHash!,
      price: 0,
    })),
  ];
  return rows.sort((a, b) => b.ts - a.ts || b.tokens - a.tokens);
}

async function getHolders(coin: Address, labels: Record<string, string> = {}): Promise<Holder[]> {
  const c = client();
  const transfers = await logsChunked((fromBlock, toBlock) =>
    c.getLogs({ address: coin, event: getAbiItem({ abi: erc20Abi, name: "Transfer" }), fromBlock, toBlock }),
  );
  const bal = new Map<string, bigint>();
  for (const t of transfers) {
    const from = String(t.args.from).toLowerCase();
    const to = String(t.args.to).toLowerCase();
    const v = t.args.value ?? 0n;
    if (from !== ZERO) bal.set(from, (bal.get(from) ?? 0n) - v);
    if (to !== ZERO) bal.set(to, (bal.get(to) ?? 0n) + v);
  }
  const total = SUPPLY;
  return [...bal.entries()]
    .filter(([, v]) => v > 0n)
    .map(([address, v]): Holder => {
      const balance = Number(formatEther(v));
      return { address, balance, pct: (balance / total) * 100, tag: labels[address.toLowerCase()] };
    })
    .sort((a, b) => b.balance - a.balance);
}

/** Token transfers the creator made that were not curve buys/sells — the "Dev transfers" markers. */
async function getDevTransfers(coin: Address, creator: Address, exclude: Address[]): Promise<DevTransfer[]> {
  const c = client();
  const skip = new Set([ZERO, ...exclude].map((a) => a.toLowerCase()));
  const logs = await logsChunked((fromBlock, toBlock) =>
    c.getLogs({ address: coin, event: getAbiItem({ abi: erc20Abi, name: "Transfer" }), args: { from: creator }, fromBlock, toBlock }),
  );
  const kept = logs.filter((l) => (l.args.value ?? 0n) > 0n && !skip.has(String(l.args.to).toLowerCase()));
  const times = await blockTimes(kept.map((l) => l.blockNumber!));
  return kept
    .map((l): DevTransfer => ({ ts: times.get(l.blockNumber!) ?? 0, to: String(l.args.to), tx: l.transactionHash! }))
    .sort((a, b) => b.ts - a.ts);
}

export async function getCoinDetails(address: string): Promise<CoinDetails | undefined> {
  const coin = await getCoin(address);
  if (!coin) return undefined;
  const c = client();
  const vault = coin.vault as Address;
  const curve = coin.curve as Address;
  const router = coin.router as Address;

  const [balance, bought, curveState, trades, holders, ethUsd, devTransfers, harvests] = await Promise.all([
    c.readContract({ address: vault, abi: vaultAbi, functionName: "balanceOf", args: [coin.address as Address] }),
    logsChunked((fromBlock, toBlock) =>
      c.getLogs({ address: vault, event: getAbiItem({ abi: vaultAbi, name: "Bought" }), args: { coin: coin.address as Address }, fromBlock, toBlock }),
    ),
    c
      .multicall({
        contracts: [
          { address: curve, abi: ponsCurveAbi, functionName: "getReserves" as const },
          { address: curve, abi: ponsCurveAbi, functionName: "realQuoteReserve" as const },
          { address: curve, abi: ponsCurveAbi, functionName: "graduationThreshold" as const },
          { address: curve, abi: ponsCurveAbi, functionName: "feeBps" as const },
        ],
        allowFailure: true,
      })
      .catch(() => []),
    getTrades(curve).catch(() => [] as Trade[]),
    getHolders(coin.address as Address, {
      [curve.toLowerCase()]: "Bonding curve",
      [vault.toLowerCase()]: "Vault",
    }).catch(() => [] as Holder[]),
    getEthUsd().catch(() => 0),
    getDevTransfers(coin.address as Address, coin.creator as Address, [curve, vault]).catch(() => [] as DevTransfer[]),
    logsChunked((fromBlock, toBlock) =>
      c.getLogs({ address: router, event: getAbiItem({ abi: feeRouterAbi, name: "Harvested" }), fromBlock, toBlock }),
    ).catch(() => []),
  ]);

  // cumulative fee split pulled by this coin's router over all harvests
  let toVaultWei = 0n;
  let toTreasuryWei = 0n;
  for (const h of harvests) {
    toVaultWei += (h.args.toVault as bigint | undefined) ?? 0n;
    toTreasuryWei += (h.args.toTreasury as bigint | undefined) ?? 0n;
  }

  const reserves = curveState[0]?.result as readonly [bigint, bigint] | undefined;
  const realQuote = (curveState[1]?.result as bigint | undefined) ?? 0n;
  const threshold = (curveState[2]?.result as bigint | undefined) ?? 0n;
  const feeBps = Number((curveState[3]?.result as bigint | undefined) ?? 0n);
  const priceEth = reserves && reserves[1] > 0n ? Number(reserves[0]) / Number(reserves[1]) : 0;
  const reserveQuoteEth = reserves ? Number(formatEther(reserves[0])) : 0;
  const reserveToken = reserves ? Number(formatEther(reserves[1])) : 0;
  const graduationEth = eth(threshold);
  const realQuoteEth = eth(realQuote);

  // Price each trade at the pool's spot (marginal) price, like the Pons chart — not the average
  // fill price (ethValue/tokens), which spikes on the very first buy. On a constant-product curve
  // the spot price is k / tokenReserve²; tokenReserve is reconstructed exactly from the token side
  // of each trade, walking backward from the current reserves.
  const chron = [...trades].sort((a, b) => a.ts - b.ts || a.tokens - b.tokens);
  const qNow = reserves ? Number(formatEther(reserves[0])) : 0;
  const tNow = reserves ? Number(formatEther(reserves[1])) : 0;
  const k = qNow * tNow;
  if (k > 0) {
    let tr = tNow;
    for (let i = chron.length - 1; i >= 0; i--) {
      chron[i].price = tr > 0 ? k / (tr * tr) : priceEth;
      tr += chron[i].side === "buy" ? chron[i].tokens : -chron[i].tokens;
    }
  } else {
    // graduated or reserves unavailable: fall back to average fill price
    for (const t of chron) t.price = t.tokens > 0 ? t.ethValue / t.tokens : 0;
  }
  const series = chron.filter((t) => t.price > 0).map((t) => ({ t: t.ts, price: t.price }));

  return {
    coin,
    vaultBalanceEth: eth(balance as bigint),
    purchases: bought.map((l) => ({ tokenId: String(l.args.tokenId), priceEth: eth(l.args.price ?? 0n) })),
    market: {
      priceEth,
      realQuoteEth,
      graduationEth,
      progress: graduationEth > 0 ? Math.min(1, realQuoteEth / graduationEth) : coin.graduated ? 1 : 0,
      holders: holders.filter((h) => !h.tag).length,
      trades: trades.length,
      ethUsd,
      reserveQuoteEth,
      reserveToken,
      feeBps,
      toVaultEth: eth(toVaultWei),
      toTreasuryEth: eth(toTreasuryWei),
    },
    trades,
    holders,
    devTransfers,
    series,
  };
}
