"use client";

import { useState } from "react";
import { fmtEth, short, timeAgo } from "@/lib/format";
import type { Trade, Holder } from "@/lib/chain";

const EXPLORER = "https://robinhoodchain.blockscout.com/address/";

const DevTag = () => (
  <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-accent">Dev</span>
);

export function Activity({ trades, holders, symbol, creator }: { trades: Trade[]; holders: Holder[]; symbol: string; creator: string }) {
  const [tab, setTab] = useState<"trades" | "holders">("trades");
  const dev = creator.toLowerCase();

  return (
    <div>
      <div className="flex gap-6 border-b border-line text-sm">
        {(["trades", "holders"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 pb-3 capitalize transition ${tab === t ? "border-foreground font-medium text-foreground" : "border-transparent text-muted hover:text-foreground"}`}
          >
            {t} <span className="text-muted">{t === "trades" ? trades.length : holders.length}</span>
          </button>
        ))}
      </div>

      {tab === "trades" ? (
        trades.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">No trades yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="hidden sm:table-header-group">
              <tr className="placard text-left">
                <th className="py-3 font-normal">Side</th>
                <th className="py-3 font-normal">Trader</th>
                <th className="py-3 text-right font-normal">ETH</th>
                <th className="py-3 text-right font-normal">{symbol}</th>
                <th className="py-3 text-right font-normal">Age</th>
              </tr>
            </thead>
            <tbody>
              {trades.slice(0, 50).map((t, i) => (
                <tr key={`${t.tx}-${i}`} className="border-t border-line">
                  <td className="py-3">
                    <span className={`font-medium ${t.side === "buy" ? "text-[#0f6e56]" : "text-accent"}`}>{t.side === "buy" ? "Buy" : "Sell"}</span>
                  </td>
                  <td className="py-3">
                    <span className="flex items-center gap-1.5">
                      <a href={EXPLORER + t.trader} target="_blank" rel="noreferrer" className="font-mono text-xs text-muted hover:text-foreground hover:underline">
                        {short(t.trader)}
                      </a>
                      {t.trader.toLowerCase() === dev ? <DevTag /> : null}
                    </span>
                  </td>
                  <td className="py-3 text-right tabular-nums">{fmtEth(t.ethValue)}</td>
                  <td className="py-3 text-right tabular-nums text-muted">{t.tokens.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                  <td className="py-3 text-right tabular-nums text-muted" suppressHydrationWarning>
                    {t.ts ? timeAgo(t.ts) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : holders.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">No holders yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="hidden sm:table-header-group">
            <tr className="placard text-left">
              <th className="w-10 py-3 font-normal">#</th>
              <th className="py-3 font-normal">Holder</th>
              <th className="py-3 text-right font-normal">{symbol}</th>
              <th className="py-3 text-right font-normal">Share</th>
            </tr>
          </thead>
          <tbody>
            {holders.slice(0, 50).map((h, i) => (
              <tr key={h.address} className="border-t border-line">
                <td className="py-3 font-mono text-xs text-muted tabular-nums">{i + 1}</td>
                <td className="py-3">
                  <span className="flex items-center gap-1.5">
                    <a href={EXPLORER + h.address} target="_blank" rel="noreferrer" className="font-mono text-xs text-muted hover:text-foreground hover:underline">
                      {short(h.address)}
                    </a>
                    {h.address.toLowerCase() === dev ? <DevTag /> : null}
                  </span>
                </td>
                <td className="py-3 text-right tabular-nums text-muted">{h.balance.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                <td className="py-3 text-right tabular-nums">{h.pct.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
