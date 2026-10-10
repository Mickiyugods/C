"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pager } from "./Pager";
import { Avatar } from "./Avatar";
import { collections, collectionUrl } from "@/data/mock";
import { fmtEth, fmtUsdCompact, timeAgo } from "@/lib/format";
import type { Coin } from "@/lib/types";

const sorts = [
  { key: "marketCap", label: "Market cap" },
  { key: "feesRouted", label: "Fees routed" },
  { key: "newest", label: "Newest" },
] as const;
type SortKey = (typeof sorts)[number]["key"];

const PER_PAGE = 10;

const collectionBy = new Map(collections.map((c) => [c.address.toLowerCase(), c]));

function sortCoins(list: Coin[], key: SortKey) {
  const arr = [...list];
  if (key === "newest") return arr.sort((a, b) => b.launchedAt - a.launchedAt);
  if (key === "marketCap") return arr.sort((a, b) => (b.marketCapEth ?? -1) - (a.marketCapEth ?? -1));
  return arr.sort((a, b) => b.feesRoutedEth - a.feesRoutedEth);
}

function seedOf(address: string) {
  return parseInt(address.slice(2, 10), 16);
}

function Thumb({ c }: { c: Coin }) {
  return (
    <span className="block h-11 w-11 shrink-0 rounded-md border border-line bg-mat p-[3px]">
      <Avatar
        seed={seedOf(c.address)}
        hue={seedOf(c.address) % 360}
        image={/^https?:\/\//.test(c.logo) ? c.logo : undefined}
        alt=""
        grid={12}
        className="h-full w-full rounded-[3px]"
      />
    </span>
  );
}

function mcap(c: Coin, ethUsd: number) {
  if (c.graduated) return "Graduated";
  if (c.marketCapEth !== null && ethUsd > 0) return fmtUsdCompact(c.marketCapEth * ethUsd);
  return c.marketCapEth === null ? "-" : `${fmtEth(c.marketCapEth)} ETH`;
}

export function TopTokens({ coins, ethUsd = 0 }: { coins: Coin[]; ethUsd?: number }) {
  const [sort, setSort] = useState<SortKey>("marketCap");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? coins.filter((c) => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q) || c.address.toLowerCase().includes(q))
      : coins;
    return sortCoins(base, sort);
  }, [coins, query, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, pages);
  const offset = (current - 1) * PER_PAGE;
  const visible = filtered.slice(offset, offset + PER_PAGE);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <p className="placard">The register</p>
          <h2 className="font-display mt-3 text-3xl font-semibold md:text-4xl">Coins and what they curate</h2>
        </div>
        {coins.length > 0 ? (
          <label className="flex w-full items-center gap-3 rounded-lg border border-line bg-white px-4 py-2.5 text-sm focus-within:border-foreground/50 sm:w-80">
            <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="9" cy="9" r="6" />
              <path d="m14 14 4 4" strokeLinecap="round" />
            </svg>
            <input
              ref={input}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search name, ticker, or address"
              aria-label="Search coins"
              className="w-full bg-transparent outline-none placeholder:text-muted"
            />
            <kbd className="hidden whitespace-nowrap rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted sm:block">Ctrl K</kbd>
          </label>
        ) : null}
      </div>

      {coins.length === 0 ? (
        <div className="mt-8 flex flex-col items-start gap-5 rounded-2xl border border-dashed border-line bg-white px-7 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display text-xl font-semibold">The register is empty</p>
            <p className="mt-1 max-w-md text-sm text-muted">Each coin launched on Curato is listed here with the collection it curates and the fees it has routed.</p>
          </div>
          <Link href="/launch" className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium whitespace-nowrap text-white hover:opacity-90">
            Launch the first coin
          </Link>
        </div>
      ) : (
        <div className="mt-8 rounded-2xl border border-line bg-white p-4 sm:p-6">
          <div role="tablist" aria-label="Sort coins" className="flex gap-6 border-b border-line text-sm">
            {sorts.map((s) => (
              <button
                key={s.key}
                role="tab"
                aria-selected={sort === s.key}
                onClick={() => {
                  setSort(s.key);
                  setPage(1);
                }}
                className={`-mb-px cursor-pointer border-b-2 pb-3 transition ${
                  sort === s.key ? "border-foreground font-medium text-foreground" : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <p className="py-14 text-center text-sm text-muted">No coin matches “{query}”.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="hidden md:table-header-group">
                <tr className="placard text-left">
                  <th className="w-10 py-3 font-normal">#</th>
                  <th className="py-3 font-normal">Coin</th>
                  <th className="py-3 font-normal">Curates</th>
                  <th className="py-3 text-right font-normal">Market cap</th>
                  <th className="py-3 text-right font-normal">Fees routed</th>
                  <th className="py-3 text-right font-normal">Launched</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c, i) => (
                  <tr key={c.address} className="relative border-t border-line transition hover:bg-surface/70">
                    <td className="hidden py-4 font-mono text-xs text-muted tabular-nums md:table-cell">{offset + i + 1}</td>
                    <td className="py-4 pr-4">
                      <Link href={`/coin/${c.address}`} className="flex items-center gap-3 after:absolute after:inset-0">
                        <Thumb c={c} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{c.name}</span>
                          <span className="block font-mono text-xs text-muted">${c.symbol}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="hidden py-4 pr-4 md:table-cell">
                      {(() => {
                        const col = collectionBy.get(c.collection.toLowerCase());
                        const label = col?.name ?? `${c.collection.slice(0, 8)}…`;
                        return (
                          <span className="flex items-center gap-2 text-muted">
                            <span className="diamond shrink-0" aria-hidden />
                            {col ? (
                              <a
                                href={collectionUrl(col)}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                title={`View ${label} on OpenSea`}
                                className="relative z-10 inline-flex min-w-0 items-center gap-1 transition hover:text-foreground hover:underline"
                              >
                                <span className="truncate">{label}</span>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 opacity-60"><path d="M14 5h5v5M19 5l-8 8M19 13v4.5A1.5 1.5 0 0 1 17.5 19h-11A1.5 1.5 0 0 1 5 17.5v-11A1.5 1.5 0 0 1 6.5 5H11" /></svg>
                              </a>
                            ) : (
                              <span className="truncate">{label}</span>
                            )}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="py-4 text-right font-medium tabular-nums">
                      {mcap(c, ethUsd)}
                      <span className="block text-xs font-normal text-muted md:hidden">{fmtEth(c.feesRoutedEth)} ETH routed</span>
                    </td>
                    <td className="hidden py-4 text-right tabular-nums md:table-cell">{fmtEth(c.feesRoutedEth)} ETH</td>
                    {/* The relative time differs by a second between server and browser, which is expected. */}
                    <td className="hidden py-4 text-right text-muted tabular-nums md:table-cell" suppressHydrationWarning>
                      {c.launchedAt ? timeAgo(c.launchedAt) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {pages > 1 ? (
            <div className="mt-4 flex justify-end border-t border-line pt-4">
              <Pager page={current} pages={pages} onChange={setPage} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
