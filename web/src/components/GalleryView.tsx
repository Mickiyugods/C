"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar } from "./Avatar";
import { Mat } from "./Mat";
import { collections } from "@/data/mock";
import { fmtEth, short } from "@/lib/format";
import type { Purchase } from "@/lib/chain";

type Status = Purchase["status"];

const badge: Record<Status, string> = {
  held: "In the vault",
  delivered: "Sent to the giveaway",
  burned: "Burned",
};

type FilterKey = "all" | Status;
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "held", label: "In the vault" },
  { key: "delivered", label: "Sent to the giveaway" },
  { key: "burned", label: "Burned" },
];

const PAGE = 12; // fills the 4-column grid in tidy rows; "Load more" reveals the rest

// OpenSea item page for an NFT the vault bought. Vaults only ever hold Robinhood Chain NFTs, so the link
// is built straight from the purchase (not from our curated collection list) and always resolves for real buys.
function itemUrl(collection: string, tokenId: string) {
  return `https://opensea.io/assets/robinhood/${collection}/${tokenId}`;
}

export function GalleryView({ purchases, symbols }: { purchases: Purchase[]; symbols: Record<string, string> }) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [shown, setShown] = useState(PAGE);

  if (purchases.length === 0) {
    return (
      <p className="mt-10 rounded-2xl border border-dashed border-line bg-surface/50 px-6 py-14 text-center text-sm text-muted">
        No NFT has been bought yet. They show up here after a vault sweeps its first floor listing.
      </p>
    );
  }

  const counts: Record<FilterKey, number> = {
    all: purchases.length,
    held: purchases.filter((p) => p.status === "held").length,
    delivered: purchases.filter((p) => p.status === "delivered").length,
    burned: purchases.filter((p) => p.status === "burned").length,
  };
  const totalSpent = purchases.reduce((s, p) => s + p.priceEth, 0);
  const visible = filter === "all" ? purchases : purchases.filter((p) => p.status === filter);

  const stats: [string, string][] = [
    ["NFTs acquired", String(purchases.length)],
    ["ETH spent", `${fmtEth(totalSpent)} ETH`],
    ["In the vault", String(counts.held)],
    ["Given away", String(counts.delivered)],
    ["Burned", String(counts.burned)],
  ];

  return (
    <div>
      {/* Summary: what the vaults have bought and where it went. */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-5">
        {stats.map(([k, v]) => (
          <div key={k} className="bg-white px-5 py-4">
            <dt className="placard">{k}</dt>
            <dd className="font-display mt-1.5 text-2xl font-medium tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => {
              setFilter(f.key);
              setShown(PAGE);
            }}
            className={`rounded-full border px-4 py-1.5 text-sm transition ${
              filter === f.key ? "border-foreground bg-foreground text-white" : "border-line text-muted hover:bg-surface"
            }`}
          >
            {f.label} <span className="tabular-nums opacity-60">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-line bg-surface/50 px-6 py-14 text-center text-sm text-muted">
          Nothing here yet for this filter.
        </p>
      ) : (
        <>
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {visible.slice(0, shown).map((p) => {
            const col = collections.find((c) => c.address.toLowerCase() === p.collection.toLowerCase());
            const sym = symbols[p.coin.toLowerCase()];
            const os = itemUrl(p.collection, p.tokenId);
            return (
              // A div card with the coin link as a full-card overlay (::after), so the OpenSea link can sit
              // above it without nesting anchors.
              <div key={`${p.coin}-${p.tokenId}`} className="relative rounded-2xl border border-line bg-white p-2.5 transition hover:border-foreground/40">
                <Mat placard={<><span>#{p.tokenId}</span><span>{fmtEth(p.priceEth)} ETH</span></>}>
                  <Avatar seed={Number(p.tokenId) + 7} hue={col?.hue ?? 30} image={col?.image} alt={col?.name ?? ""} grid={10} className="aspect-square" />
                </Mat>
                <Link href={`/coin/${p.coin}`} className="after:absolute after:inset-0">
                  <p className="font-display mt-3 truncate text-lg font-semibold">
                    {col?.name ?? short(p.collection)} <span className="text-muted">#{p.tokenId}</span>
                  </p>
                </Link>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-block rounded-md bg-surface px-2.5 py-0.5 text-xs text-muted">{badge[p.status]}</span>
                  {sym ? (
                    <Link href={`/coin/${p.coin}`} className="relative z-10 font-mono text-xs text-muted hover:text-foreground hover:underline">
                      ${sym}
                    </Link>
                  ) : null}
                </div>
                {os ? (
                  <a
                    href={os}
                    target="_blank"
                    rel="noreferrer"
                    title={`View #${p.tokenId} on OpenSea`}
                    className="relative z-10 mt-2 inline-flex items-center gap-1 text-xs text-muted transition hover:text-foreground hover:underline"
                  >
                    OpenSea
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14 5h5v5M19 5l-8 8M19 13v4.5A1.5 1.5 0 0 1 17.5 19h-11A1.5 1.5 0 0 1 5 17.5v-11A1.5 1.5 0 0 1 6.5 5H11" /></svg>
                  </a>
                ) : null}
              </div>
            );
          })}
        </div>
        {visible.length > shown ? (
          <div className="mt-6 flex justify-center">
            <button
              onClick={() => setShown((n) => n + PAGE)}
              className="rounded-full border border-line px-5 py-2 text-xs font-medium text-muted transition hover:bg-surface hover:text-foreground"
            >
              Load more ({visible.length - shown})
            </button>
          </div>
        ) : null}
        </>
      )}
    </div>
  );
}
