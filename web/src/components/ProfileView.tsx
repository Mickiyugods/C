"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatEther, type Address } from "viem";
import { useWallet } from "@/lib/wallet";
import { RaffleList } from "./RaffleList";
import { CopyButton } from "./coin/HeaderBits";
import { tokenBalance } from "@/lib/launch";
import { fmtEth, fmtUsdCompact, short, subPrice } from "@/lib/format";
import type { Coin, RaffleRow } from "@/lib/types";

const EXPLORER = "https://robinhoodchain.blockscout.com/address/";
const SUPPLY = 1_000_000_000;

type Holding = { coin: Coin; tokens: number };

export function ProfileView({ coins, raffles, ethUsd }: { coins: Coin[]; raffles: RaffleRow[]; ethUsd: number }) {
  const wallet = useWallet();
  const [holdings, setHoldings] = useState<Holding[] | null>(null);

  // Read the connected wallet's balance in every coin once it connects (or the coin set changes).
  const coinsKey = coins.map((c) => c.address).join(",");
  useEffect(() => {
    if (!wallet.address) {
      setHoldings(null);
      return;
    }
    let live = true;
    const me = wallet.address as Address;
    Promise.all(
      coins.map((c) =>
        tokenBalance(c.address as Address, me)
          .then((b) => ({ coin: c, tokens: Number(formatEther(b)) }))
          .catch(() => ({ coin: c, tokens: 0 })),
      ),
    ).then((rows) => live && setHoldings(rows.filter((r) => r.tokens > 0)));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.address, coinsKey]);

  if (!wallet.address) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface/50 px-6 py-14 text-center">
        <p className="font-display text-xl font-medium">Connect your wallet</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">See the coins you hold and launched, the giveaways you&apos;re in, and the NFTs you won.</p>
        <button onClick={wallet.connect} className="mt-5 rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-white hover:opacity-85">
          Connect wallet
        </button>
        {wallet.error ? <p className="mt-3 text-xs text-accent">{wallet.error}</p> : null}
      </div>
    );
  }

  const me = wallet.address.toLowerCase();
  const mine = coins.filter((c) => c.creator.toLowerCase() === me);
  const wins = raffles.filter((r) => r.winner?.toLowerCase() === me);
  const symbols: Record<string, string> = Object.fromEntries(coins.map((c) => [c.address.toLowerCase(), c.symbol]));

  const priceOf = (c: Coin) => (c.marketCapEth != null ? c.marketCapEth / SUPPLY : 0);
  const held = (holdings ?? []).slice().sort((a, b) => b.tokens * priceOf(b.coin) - a.tokens * priceOf(a.coin));
  const holdingsValueEth = held.reduce((s, h) => s + h.tokens * priceOf(h.coin), 0);
  const feesFromMine = mine.reduce((s, c) => s + c.feesRoutedEth, 0);

  // Active giveaways for coins you hold.
  const heldAddrs = new Set(held.map((h) => h.coin.address.toLowerCase()));
  const myDraws = raffles.filter((r) => r.state !== "settled" && heldAddrs.has(r.coin.toLowerCase()));

  const stats: [string, string][] = [
    ["Holdings", ethUsd > 0 ? fmtUsdCompact(holdingsValueEth * ethUsd) : `${fmtEth(holdingsValueEth)} ETH`],
    ["Coins launched", String(mine.length)],
    ["Fees routed", `${fmtEth(feesFromMine)} ETH`],
    ["NFTs won", String(wins.length)],
  ];

  const value = (eth: number) => (ethUsd > 0 ? `$${subPrice(eth * ethUsd)}` : `${subPrice(eth)} ETH`);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-sm text-muted" title={wallet.address}>
          {short(wallet.address)}
        </span>
        <span className="flex items-center gap-2 text-muted">
          <CopyButton text={wallet.address} />
          <a href={EXPLORER + wallet.address} target="_blank" rel="noreferrer" aria-label="Open in explorer" className="transition hover:text-foreground">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14 5h5v5M19 5l-8 8M19 13v4.5A1.5 1.5 0 0 1 17.5 19h-11A1.5 1.5 0 0 1 5 17.5v-11A1.5 1.5 0 0 1 6.5 5H11" /></svg>
          </a>
        </span>
        <button onClick={wallet.disconnect} className="ml-auto rounded-md border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-surface hover:text-foreground">
          Disconnect
        </button>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
        {stats.map(([k, v]) => (
          <div key={k} className="bg-white px-5 py-4">
            <dt className="placard">{k}</dt>
            <dd className="font-display mt-1.5 text-2xl font-medium tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-10 font-display text-2xl font-medium">Coins you hold</h2>
      {holdings === null ? (
        <p className="mt-3 text-sm text-muted">Reading your balances…</p>
      ) : held.length ? (
        <ul className="mt-4 divide-y divide-line rounded-2xl border border-line text-sm">
          {held.map(({ coin, tokens }) => (
            <li key={coin.address}>
              <Link href={`/coin/${coin.address}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-surface/60">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{coin.name}</span> <span className="font-mono text-xs text-muted">${coin.symbol}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block tabular-nums">{tokens.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${coin.symbol}</span>
                  <span className="block text-xs text-muted tabular-nums">{value(tokens * priceOf(coin))}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">You don&apos;t hold any Curato coins yet.</p>
      )}

      {myDraws.length ? (
        <>
          <h2 className="mt-10 font-display text-2xl font-medium">Giveaways you&apos;re in</h2>
          <p className="mt-2 text-sm text-muted">Active draws for coins you hold — odds follow your balance.</p>
          <div className="mt-4">
            <RaffleList raffles={myDraws} symbols={symbols} empty="" />
          </div>
        </>
      ) : null}

      <h2 className="mt-10 font-display text-2xl font-medium">Coins you launched</h2>
      {mine.length ? (
        <ul className="mt-4 divide-y divide-line rounded-2xl border border-line text-sm">
          {mine.map((c) => (
            <li key={c.address}>
              <Link href={`/coin/${c.address}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-surface/60">
                <span className="font-medium">
                  {c.name} <span className="font-mono text-xs text-muted">${c.symbol}</span>
                </span>
                <span className="font-mono text-xs text-muted">{fmtEth(c.feesRoutedEth)} ETH routed</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">You have not launched a coin yet.</p>
      )}

      <h2 className="mt-12 font-display text-2xl font-medium">NFTs you won</h2>
      <div className="mt-4">
        <RaffleList raffles={wins} symbols={symbols} empty="No wins yet. Hold a coin with the Airdrop policy to take part in its giveaways." />
      </div>
    </div>
  );
}
