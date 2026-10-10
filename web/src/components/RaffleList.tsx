import Link from "next/link";
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

const nameOf = (address: string) => collections.find((c) => c.address.toLowerCase() === address.toLowerCase())?.name ?? short(address);

export function RaffleList({ raffles, empty }: { raffles: RaffleRow[]; empty: string }) {
  if (!raffles.length) {
    return <p className="rounded-2xl border border-dashed border-line bg-surface/50 px-6 py-12 text-center text-sm text-muted">{empty}</p>;
  }
  return (
    <ul className="space-y-3">
      {raffles.map((r) => {
        const at = steps.findIndex((s) => s.key === r.state);
        return (
          <li key={r.id} className="rounded-2xl border border-line bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">
                {nameOf(r.collection)} <span className="text-muted">#{r.tokenId}</span>
              </p>
              <Link href={`/coin/${r.coin}`} className="font-mono text-xs text-muted hover:text-foreground">
                for coin {short(r.coin)}
              </Link>
            </div>
            <ol className="mt-4 grid grid-cols-5 gap-1.5 text-[11px]">
              {steps.map((s, i) => (
                <li key={s.key} className="min-w-0">
                  <span className={`block h-1.5 rounded-full ${i <= at ? "bg-foreground" : "bg-line"}`} />
                  <span className={`mt-1.5 block truncate ${i <= at ? "text-foreground" : "text-muted"}`}>{s.label}</span>
                </li>
              ))}
            </ol>
            {r.winner ? (
              <p className="mt-3 text-sm text-muted">
                Winner: <span className="font-mono text-foreground">{short(r.winner)}</span>. The NFT was sent to their wallet.
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
