"use client";

import { useMemo, useState } from "react";
import { Avatar } from "./Avatar";
import { Pager } from "./Pager";
import { collections, chainLabels, chainLogos, explorers, shortId, type Chain } from "@/data/mock";
import { fmtEth } from "@/lib/format";
import type { CollectionStats } from "@/lib/types";

const ChainBadge = ({ chain }: { chain: Chain }) => (
  <span className="inline-flex items-center gap-1.5">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={chainLogos[chain]} alt="" width={14} height={14} className="h-3.5 w-3.5 rounded-full object-contain" />
    {chainLabels[chain]}
  </span>
);

const PER_PAGE_WALL = 24;
const PER_PAGE_TABLE = 25;

const cols = "lg:grid-cols-[40px_minmax(0,1fr)_120px_90px_70px_110px_90px]";

type Filter = "all" | Chain;
const tabs: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "robinhood", label: "Robinhood" },
  { key: "ethereum", label: "Ethereum" },
  { key: "solana", label: "Solana" },
];

type View = "wall" | "table";

export function CollectionsList({ stats, initialQuery = "" }: { stats: Record<string, CollectionStats>; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [page, setPage] = useState(1);
  const [chain, setChain] = useState<Filter>("all");
  const [view, setView] = useState<View>("wall");

  const counts = useMemo(
    () => ({
      all: collections.length,
      robinhood: collections.filter((c) => c.chain === "robinhood").length,
      ethereum: collections.filter((c) => c.chain === "ethereum").length,
      solana: collections.filter((c) => c.chain === "solana").length,
    }),
    [],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return collections
      .filter((c) => chain === "all" || c.chain === chain)
      .filter(
        (c) => !q || c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q) || c.symbol?.toLowerCase().includes(q),
      )
      .map((c, i) => ({ c, rank: i + 1 }));
  }, [query, chain]);

  const perPage = view === "wall" ? PER_PAGE_WALL : PER_PAGE_TABLE;
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const current = Math.min(page, pages);
  const visible = rows.slice((current - 1) * perPage, current * perPage);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setChain(t.key);
              setPage(1);
            }}
            className={`rounded-md border px-4 py-1.5 text-sm transition ${
              chain === t.key ? "border-foreground bg-foreground text-white" : "border-line text-muted hover:bg-surface"
            }`}
          >
            {t.label} <span className="opacity-60">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex min-w-[240px] max-w-md flex-1 items-center gap-3 rounded-md border border-line bg-white px-4 py-2.5 text-sm focus-within:border-foreground/50">
          <span aria-hidden className="text-muted">⌕</span>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name or address"
            aria-label="Search collections"
            className="w-full bg-transparent outline-none placeholder:text-muted"
          />
        </label>

        <div className="flex rounded-md border border-line p-0.5" role="tablist" aria-label="View">
          {(["wall", "table"] as View[]).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => {
                setView(v);
                setPage(1);
              }}
              className={`rounded-[5px] px-3 py-1.5 text-sm capitalize transition ${view === v ? "bg-foreground text-white" : "text-muted hover:text-foreground"}`}
            >
              {v}
            </button>
          ))}
        </div>

        <span className="hidden text-xs text-muted sm:block">{rows.length} collections</span>
        <div className="ml-auto">
          <Pager page={current} pages={pages} onChange={setPage} />
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-line px-5 py-14 text-center text-sm text-muted">No collections match your search.</p>
      ) : view === "wall" ? (
        <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-6">
          {visible.map(({ c }) => {
            const s = c.chain === "robinhood" ? stats[c.address.toLowerCase()] : undefined;
            return (
              <li key={c.id}>
                <a href={explorers[c.chain] + c.address} target="_blank" rel="noreferrer" className="frame-link block" title={c.name}>
                  <div className="mat !p-2">
                    <Avatar seed={Number(c.id.slice(1)) + 100} hue={c.hue} image={c.image} alt={c.name} grid={10} className="aspect-square" />
                  </div>
                  <p className="mt-3 truncate text-sm font-medium">{c.name}</p>
                  <p className="placard mt-1 flex items-center gap-1.5 truncate">
                    {s?.coins ? (
                      <>
                        <span className="diamond shrink-0" aria-hidden /> {s.coins} {s.coins === 1 ? "coin" : "coins"} · {fmtEth(s.ethInVault)} ETH
                      </>
                    ) : (
                      <>
                        {chainLabels[c.chain]}
                        {c.supply ? ` · ${c.supply.toLocaleString("en-US")}` : ""}
                      </>
                    )}
                  </p>
                </a>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-line bg-white">
          <div className={`placard hidden grid-cols-1 gap-4 border-b border-line bg-surface px-5 py-3 lg:grid ${cols}`}>
            <span>#</span>
            <span>Collection</span>
            <span>Contract</span>
            <span className="text-right">Supply</span>
            <span className="text-right">Coins</span>
            <span className="text-right">ETH in vaults</span>
            <span className="text-right">NFTs held</span>
          </div>
          {visible.map(({ c, rank }) => (
            <div
              key={c.id}
              className={`grid grid-cols-[32px_minmax(0,1fr)] items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 lg:gap-4 lg:px-5 ${cols}`}
            >
              <span className="font-mono text-sm text-muted">{rank}</span>
              <div className="flex min-w-0 items-center gap-3">
                <Avatar seed={Number(c.id.slice(1)) + 100} hue={c.hue} image={c.image} alt={c.name} grid={8} className="h-11 w-11 shrink-0 rounded-xl" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="flex items-center text-xs text-muted">
                    <ChainBadge chain={c.chain} />
                    <span className="lg:hidden">
                      {" · "}
                      {c.supply ? `${c.supply.toLocaleString("en-US")} items` : "Supply n/a"}
                    </span>
                  </p>
                </div>
              </div>
              <a
                href={explorers[c.chain] + c.address}
                target="_blank"
                rel="noreferrer"
                title={c.address}
                className="hidden truncate font-mono text-xs text-muted underline-offset-2 hover:text-foreground hover:underline lg:block"
              >
                {shortId(c)}
              </a>
              <span className="hidden text-right text-sm lg:block">
                {c.supply ? c.supply.toLocaleString("en-US") : <span className="text-muted">n/a</span>}
              </span>
              <span className="hidden text-right text-sm tabular-nums lg:block">{c.chain === "robinhood" ? (stats[c.address.toLowerCase()]?.coins ?? 0) : <span className="text-muted">-</span>}</span>
              <span className="hidden text-right text-sm lg:block">
                {c.chain === "robinhood" ? (
                  (() => {
                    const s = stats[c.address.toLowerCase()];
                    return (
                      <>
                        <span className="tabular-nums">{fmtEth(s?.ethInVault ?? 0)} ETH</span>
                        {s?.vault ? (
                          <a
                            href={explorers.robinhood + s.vault}
                            target="_blank"
                            rel="noreferrer"
                            title={`Vault ${s.vault}`}
                            className="block font-mono text-[11px] text-muted underline-offset-2 hover:text-accent hover:underline"
                          >
                            {s.vault.slice(0, 6)}…{s.vault.slice(-4)} ↗
                          </a>
                        ) : null}
                      </>
                    );
                  })()
                ) : (
                  <span className="text-muted">-</span>
                )}
              </span>
              <span className="hidden text-right text-sm tabular-nums lg:block">{c.chain === "robinhood" ? (stats[c.address.toLowerCase()]?.nftsHeld ?? 0) : <span className="text-muted">-</span>}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
