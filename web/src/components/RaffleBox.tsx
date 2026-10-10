import Link from "next/link";
import { Avatar } from "./Avatar";
import { RaffleYou } from "./RaffleYou";
import { collections } from "@/data/mock";
import { short } from "@/lib/format";
import type { RaffleRow, RaffleState } from "@/lib/types";

const steps: { key: RaffleState; label: string }[] = [
  { key: "pending", label: "NFT bought" },
  { key: "posted", label: "Snapshot" },
  { key: "requested", label: "Draw pinned" },
  { key: "drawn", label: "Drawn" },
  { key: "settled", label: "Delivered" },
];

// A sealed "raffle box": the won NFT sits framed inside an ink box with a terracotta wax seal while the
// giveaway runs, then the box "opens" (terracotta glow + winner reveal) once the draw settles. The NFT is
// always visible — the box is the draw moment, not a mystery, so it stays on-brand and provably fair.
export function RaffleBox({ r, symbol }: { r: RaffleRow; symbol?: string }) {
  const col = collections.find((c) => c.address.toLowerCase() === r.collection.toLowerCase());
  const name = col?.name ?? short(r.collection);
  const at = steps.findIndex((s) => s.key === r.state);
  const opened = r.state === "settled";
  // Vaults only hold Robinhood Chain NFTs, so the box's NFT links to its OpenSea item page.
  const osHref = `https://opensea.io/assets/robinhood/${r.collection}/${r.tokenId}`;

  return (
    <div
      className={`ink relative overflow-hidden rounded-2xl border transition ${
        opened ? "border-accent/60 shadow-[0_18px_44px_-20px_rgb(200_100_62_/_0.5)]" : "border-ink-line"
      }`}
    >
      {/* lid seam */}
      <div className={`h-1 w-full ${opened ? "bg-accent" : "bg-ink-line"}`} />

      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <p className="placard flex items-center gap-2 !text-on-ink-muted">
          <span className={`diamond ${opened ? "!bg-accent" : ""}`} aria-hidden /> {opened ? "Opened" : "Sealed"} raffle
        </p>
        <Link href={`/coin/${r.coin}`} className="font-mono text-xs text-on-ink-muted transition hover:text-on-ink">
          {symbol ? `$${symbol}` : short(r.coin)}
        </Link>
      </div>

      <div className="flex gap-4 p-5">
        <div className="relative w-28 shrink-0 sm:w-32">
          <a href={osHref} target="_blank" rel="noreferrer" title={`View ${name} #${r.tokenId} on OpenSea`} className="mat !p-1.5 block transition hover:opacity-90">
            <Avatar seed={Number(r.tokenId) + 7} hue={col?.hue ?? 30} image={col?.image} alt={name} grid={10} className="aspect-square" />
          </a>
          {/* terracotta wax seal while sealed; a check once opened */}
          <span
            className={`absolute -right-2.5 -top-2.5 grid h-8 w-8 place-items-center rounded-full text-[11px] font-bold text-white shadow-lg ring-2 ring-ink ${
              opened ? "bg-[#1d9e75]" : "bg-accent"
            }`}
            aria-hidden
          >
            {opened ? "✓" : "✦"}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-medium text-on-ink">
            {name} <span className="text-on-ink-muted">#{r.tokenId}</span>
          </p>

          {opened && r.winner ? (
            <div className="mt-2 rounded-xl border border-accent/50 bg-accent/10 px-3 py-2">
              <p className="placard !text-accent">Winner</p>
              <p className="mt-0.5 font-mono text-sm text-on-ink">{short(r.winner)}</p>
              <p className="mt-1 text-xs leading-relaxed text-on-ink-muted">The NFT was sent straight to their wallet — nothing to claim.</p>
            </div>
          ) : (
            <p className="mt-1.5 text-sm leading-relaxed text-on-ink-muted">
              Opens to one holder of the coin when the draw lands. Odds follow balance; the winner is picked by a verifiable drand beacon.
            </p>
          )}

          <RaffleYou coin={r.coin} symbol={symbol} winner={r.winner} opened={opened} />

          <ol className="mt-4 grid grid-cols-5 gap-1.5 text-[11px]">
            {steps.map((s, i) => (
              <li key={s.key} className="min-w-0">
                <span className={`block h-1.5 rounded-full ${i <= at ? (opened ? "bg-accent" : "bg-on-ink") : "bg-ink-line"}`} />
                <span className={`mt-1.5 block truncate ${i <= at ? "text-on-ink" : "text-on-ink-muted"}`}>{s.label}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
