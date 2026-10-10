import Link from "next/link";
import { Avatar } from "./Avatar";
import { collections as allCollections, collectionUrl } from "@/data/mock";
import { fmtEth } from "@/lib/format";
import type { CollectionStats } from "@/lib/types";

const SHOWN = 12;

/** Collections that coins can pair with, the busiest first, hung as a wall of framed works. */
export function TopCollections({ stats }: { stats: Record<string, CollectionStats> }) {
  const of = (address: string) => stats[address.toLowerCase()];
  const ranked = allCollections
    .filter((c) => c.chain === "robinhood")
    .map((c, i) => ({ c, i, s: of(c.address) }))
    .sort((a, b) => (b.s?.coins ?? 0) - (a.s?.coins ?? 0) || (b.s?.ethInVault ?? 0) - (a.s?.ethInVault ?? 0) || a.i - b.i)
    .slice(0, SHOWN);
  const total = allCollections.filter((c) => c.chain === "robinhood").length;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="placard">On view</p>
          <h2 className="font-display mt-3 text-3xl font-semibold md:text-4xl">Collections a coin can curate</h2>
        </div>
        <Link href="/collections" className="text-sm font-medium underline underline-offset-4 hover:opacity-70">
          All {total} collections
        </Link>
      </div>

      <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-6">
        {ranked.map(({ c, s }) => (
          <li key={c.id}>
            <a href={collectionUrl(c)} target="_blank" rel="noreferrer" className="frame-link block">
              <div className="mat !p-2">
                <Avatar
                  seed={Number(c.id.slice(1)) + 100}
                  hue={c.hue}
                  image={c.image}
                  alt={c.name}
                  grid={10}
                  className="aspect-square"
                />
              </div>
              <p className="mt-3 truncate text-sm font-medium">{c.name}</p>
              <p className="placard mt-1 flex items-center gap-1.5">
                {s?.coins ? (
                  <>
                    <span className="diamond" aria-hidden /> {s.coins} {s.coins === 1 ? "coin" : "coins"} · {fmtEth(s.ethInVault)} ETH
                  </>
                ) : c.supply ? (
                  `${c.supply.toLocaleString("en-US")} items`
                ) : (
                  "Robinhood Chain"
                )}
              </p>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
