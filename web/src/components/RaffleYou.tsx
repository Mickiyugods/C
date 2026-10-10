"use client";

import { useEffect, useState } from "react";
import { formatEther, type Address } from "viem";
import { useWallet } from "@/lib/wallet";
import { tokenBalance } from "@/lib/launch";

const SUPPLY = 1_000_000_000;

// Per-wallet line inside a raffle box: shows the connected holder their entry + rough odds while the draw
// runs, and celebrates a win once it settles. Delivery is automatic on-chain; this is just for visibility.
export function RaffleYou({ coin, symbol, winner, opened }: { coin: string; symbol?: string; winner: string | null; opened: boolean }) {
  const wallet = useWallet();
  const [bal, setBal] = useState<bigint | null>(null);

  useEffect(() => {
    if (!wallet.address) {
      setBal(null);
      return;
    }
    let live = true;
    tokenBalance(coin as Address, wallet.address as Address)
      .then((b) => live && setBal(b))
      .catch(() => live && setBal(null));
    return () => {
      live = false;
    };
  }, [wallet.address, coin]);

  if (!wallet.address) return null;
  const me = wallet.address.toLowerCase();

  if (opened) {
    if (winner && winner.toLowerCase() === me) {
      return (
        <div className="mt-3 rounded-lg border border-[#1d9e75]/50 bg-[#1d9e75]/15 px-3 py-2 text-xs font-medium text-on-ink">
          🎉 You won this giveaway — the NFT is already in your wallet.
        </div>
      );
    }
    return null;
  }

  const tokens = bal !== null ? Number(formatEther(bal)) : 0;
  if (tokens <= 0) return null;
  const pct = (tokens / SUPPLY) * 100;
  return (
    <div className="mt-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-on-ink">
      <span className="font-medium">You&apos;re in this draw</span>
      <span className="text-on-ink-muted">
        {" "}
        — you hold {tokens.toLocaleString("en-US", { maximumFractionDigits: 0 })} {symbol ? `$${symbol}` : "tokens"} (~
        {pct < 0.01 ? "<0.01" : pct.toFixed(2)}% of supply). Bigger share, better odds.
      </span>
    </div>
  );
}
