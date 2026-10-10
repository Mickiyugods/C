import Link from "next/link";
import { getAnalytics, getCoins } from "@/lib/chain";
import { fmtEth, short } from "@/lib/format";
import { brand } from "@/config/brand";
import { PageHeader } from "@/components/PageHeader";
import { LiveRefresh } from "@/components/coin/LiveRefresh";
import type { Analytics, Coin } from "@/lib/types";

export const metadata = { title: "Analytics" };

export const dynamic = "force-dynamic";

const empty: Analytics = {
  coins: 0,
  graduated: 0,
  feesRoutedEth: 0,
  ethInVaultsEth: 0,
  nftsBought: 0,
  nftsBurned: 0,
  nftsDelivered: 0,
  collectionsWithCoins: 0,
};

export default async function Page() {
  let data = empty;
  let coins: Coin[] = [];
  try {
    [data, coins] = await Promise.all([getAnalytics(), getCoins()]);
  } catch (e) {
    console.error("Could not read analytics:", e);
  }

  // Grouped so the page reads as a report, not a wall of equal tiles.
  const groups: { label: string; stats: [string, string][] }[] = [
    {
      label: "Coins",
      stats: [
        ["Launched", String(data.coins)],
        ["Graduated to Uniswap v4", String(data.graduated)],
        ["Collections in use", String(data.collectionsWithCoins)],
      ],
    },
    {
      label: "Money",
      stats: [
        ["Fees routed", `${fmtEth(data.feesRoutedEth)} ETH`],
        ["Waiting in vaults", `${fmtEth(data.ethInVaultsEth)} ETH`],
        ["To treasury (" + String(brand.split.treasury) + "%)", `${fmtEth((data.feesRoutedEth * brand.split.treasury) / 100)} ETH`],
      ],
    },
    {
      label: "NFTs",
      stats: [
        ["Bought by vaults", String(data.nftsBought)],
        ["Sent to giveaways", String(data.nftsDelivered)],
        ["Burned", String(data.nftsBurned)],
      ],
    },
  ];

  const sorted = [...coins].sort((a, b) => b.feesRoutedEth - a.feesRoutedEth);

  return (
    <>
      <PageHeader eyebrow="On-chain record" title={<>The <em className="text-accent">ledger</em></>}>
        Every number here is read straight from {brand.name}&apos;s contracts on {brand.chain.name}. Nothing is
        estimated or stored off-chain.
      </PageHeader>

      <section className="mx-auto max-w-6xl px-5 py-14">
        {/* The ledger reads live from the chain; keep it current without a manual reload. */}
        <LiveRefresh intervalMs={10000} />
        <div className="space-y-px overflow-hidden rounded-2xl border border-line bg-line">
          {groups.map((g) => (
            <div key={g.label} className="grid gap-px bg-line sm:grid-cols-[160px_1fr]">
              <div className="bg-surface px-6 py-6">
                <p className="placard">{g.label}</p>
              </div>
              <dl className="grid gap-px bg-line sm:grid-cols-3">
                {g.stats.map(([label, value]) => (
                  <div key={label} className="bg-white px-6 py-6">
                    <dt className="text-xs text-muted">{label}</dt>
                    <dd className="font-display mt-2 text-3xl font-medium tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>

        <div id="payments" className="mt-16 scroll-mt-36">
          <h2 className="font-display text-3xl font-medium">Payments by coin</h2>
          <p className="mt-2 text-sm text-muted">
            Where each coin&apos;s routed fees went. The split is fixed in the contract: {brand.split.vault}% to the
            vault, {brand.split.treasury}% to the treasury.
          </p>
          <div className="mt-6 overflow-hidden rounded-2xl border border-line">
            <div className="placard hidden grid-cols-[minmax(0,1fr)_120px_120px_120px] gap-4 border-b border-line bg-surface px-5 py-3 md:grid">
              <span>Coin</span>
              <span className="text-right">Routed</span>
              <span className="text-right">To vault</span>
              <span className="text-right">To treasury</span>
            </div>
            {sorted.length ? (
              sorted.map((c) => (
                <Link
                  key={c.address}
                  href={`/coin/${c.address}`}
                  className="grid grid-cols-2 gap-2 border-b border-line px-5 py-3.5 text-sm last:border-b-0 hover:bg-surface/60 md:grid-cols-[minmax(0,1fr)_120px_120px_120px] md:gap-4"
                >
                  <span className="col-span-2 truncate font-medium md:col-span-1">
                    {c.name} <span className="font-mono text-xs text-muted">${c.symbol} · {short(c.address)}</span>
                  </span>
                  <span className="tabular-nums md:text-right">{fmtEth(c.feesRoutedEth)} ETH</span>
                  <span className="tabular-nums text-muted md:text-right">{fmtEth((c.feesRoutedEth * brand.split.vault) / 100)} ETH</span>
                  <span className="tabular-nums text-muted md:text-right">{fmtEth((c.feesRoutedEth * brand.split.treasury) / 100)} ETH</span>
                </Link>
              ))
            ) : (
              <p className="px-5 py-12 text-center text-sm text-muted">No fees have been routed yet.</p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
