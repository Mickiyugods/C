"use client";

import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { RaffleList } from "./RaffleList";
import { fmtEth, short } from "@/lib/format";
import type { Coin, RaffleRow } from "@/lib/types";

export function ProfileView({ coins, raffles }: { coins: Coin[]; raffles: RaffleRow[] }) {
  const wallet = useWallet();

  if (!wallet.address) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface/50 px-6 py-14 text-center">
        <p className="font-display text-xl font-medium">Connect your wallet</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">See the coins you launched and the NFTs you won.</p>
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

  return (
    <div>
      <p className="font-mono text-sm text-muted" title={wallet.address}>
        {short(wallet.address)}
      </p>

      <h2 className="mt-8 font-display text-2xl font-medium">Coins you launched</h2>
      {mine.length ? (
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line text-sm">
          {mine.map((c) => (
            <li key={c.address}>
              <Link href={`/coin/${c.address}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-surface/60">
                <span className="font-medium">
                  {c.name} <span className="font-mono text-xs text-muted">${c.symbol}</span>
                </span>
                <span className="font-mono text-xs text-muted">{fmtEth(c.feesRoutedEth)} ETH routed</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">You have not launched a coin yet.</p>
      )}

      <h2 className="mt-12 font-display text-2xl font-medium">NFTs you won</h2>
      <div className="mt-4">
        <RaffleList raffles={wins} empty="No wins yet. Hold a coin with the Airdrop policy to take part in its giveaways." />
      </div>
    </div>
  );
}
