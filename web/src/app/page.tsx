import Link from "next/link";
import { brand, launchParams } from "@/config/brand";
import { collections } from "@/data/mock";
import { Discover } from "@/components/Discover";
import { Mat } from "@/components/Mat";
import { Avatar } from "@/components/Avatar";
import { getAnalytics, getPurchases, type Purchase } from "@/lib/chain";
import { fmtEth, short } from "@/lib/format";
import type { Analytics } from "@/lib/types";

// Everything on this page is read from the chain on every request.
export const dynamic = "force-dynamic";

const EMPTY: Analytics = {
  coins: 0,
  graduated: 0,
  feesRoutedEth: 0,
  ethInVaultsEth: 0,
  nftsBought: 0,
  nftsBurned: 0,
  nftsDelivered: 0,
  collectionsWithCoins: 0,
};

async function load() {
  const [purchases, analytics] = await Promise.all([
    getPurchases().catch((e) => {
      console.error("Could not read purchases:", e);
      return [] as Purchase[];
    }),
    getAnalytics().catch((e) => {
      console.error("Could not read analytics:", e);
      return EMPTY;
    }),
  ]);
  return { purchases: purchases.slice(0, 3), analytics };
}

function Frame({ p, className = "", sizes }: { p?: Purchase; className?: string; sizes: "lg" | "sm" }) {
  if (!p) {
    return (
      <Mat className={className} placard={<span>{sizes === "lg" ? "Awaiting first acquisition" : " "}</span>}>
        <div className="aspect-square rounded-[3px] border border-dashed border-ink-line" />
      </Mat>
    );
  }
  const col = collections.find((c) => c.address.toLowerCase() === p.collection.toLowerCase());
  return (
    <Link href={`/coin/${p.coin}`} className={`frame-link block ${className}`}>
      <Mat
        placard={
          <>
            <span className="truncate">
              {col?.name ?? short(p.collection)} #{p.tokenId}
            </span>
            <span className="shrink-0">{fmtEth(p.priceEth)} ETH</span>
          </>
        }
      >
        <Avatar
          seed={Number(p.tokenId) + 7}
          hue={col?.hue ?? 30}
          image={col?.image}
          alt={col?.name ?? short(p.collection)}
          grid={10}
          className="aspect-square"
        />
      </Mat>
    </Link>
  );
}

const stages = [
  {
    title: "Launch",
    body: "Pick one NFT collection and what each NFT becomes. Your coin goes live on Pons in a single transaction.",
  },
  {
    title: "Trade",
    body: `Every trade pays a fee, and you set the creator share up to ${launchParams.maxCreatorTaxPct}%. It all accrues to the coin's router.`,
  },
  {
    title: "Split",
    body: `Anyone can harvest. ${brand.split.vault}% goes to the coin's vault and ${brand.split.treasury}% to the ${brand.name} treasury. Never to a wallet.`,
  },
  {
    title: "Acquire",
    body: "The vault buys floor listings through Seaport, within price caps it cannot exceed. Then each NFT is burned or given away.",
  },
];

export default async function Home() {
  const { purchases, analytics } = await load();

  const ledger = [
    { label: "Coins launched", value: analytics.coins.toLocaleString("en-US") },
    { label: "Fees routed", value: `${fmtEth(analytics.feesRoutedEth)} ETH` },
    { label: "NFTs acquired", value: analytics.nftsBought.toLocaleString("en-US") },
    { label: "Held in vaults", value: `${fmtEth(analytics.ethInVaultsEth)} ETH` },
  ];

  return (
    <>
      <div className="px-3 pt-3 sm:px-4 sm:pt-4">
        <div className="ink overflow-hidden rounded-2xl">
          <section className="mx-auto grid max-w-6xl items-center gap-14 px-6 pt-16 pb-16 lg:grid-cols-[1.25fr_1fr] lg:gap-14 lg:px-10 lg:pt-24 lg:pb-20">
            <div>
              <p className="placard rise flex items-center gap-2" style={{ "--i": 0 } as React.CSSProperties}>
                <span className="diamond" aria-hidden /> A launchpad for collectors
              </p>
              <h1
                className="font-display rise mt-8 text-[clamp(3rem,6.6vw,5.6rem)] leading-[0.92] font-medium"
                style={{ "--i": 1 } as React.CSSProperties}
              >
                Every coin <em className="text-accent">curates</em>
                <br />a collection.
              </h1>
              <p className="rise mt-8 max-w-md text-[1.05rem] leading-relaxed text-on-ink-muted" style={{ "--i": 2 } as React.CSSProperties}>
                A coin&apos;s trading fees go to a vault that buys floor NFTs from the collection you choose. No wallet
                takes a cut; the split is fixed in the contract.
              </p>
              <div className="rise mt-10 flex flex-wrap items-center gap-3" style={{ "--i": 3 } as React.CSSProperties}>
                <Link href="/launch" className="rounded-md bg-on-ink px-6 py-3 font-medium text-ink transition hover:bg-white">
                  Launch a coin
                </Link>
                <Link href="/explore" className="rounded-md border border-ink-line px-6 py-3 font-medium text-on-ink transition hover:border-on-ink-muted">
                  Explore coins
                </Link>
              </div>
            </div>

            <div className="rise" style={{ "--i": 3 } as React.CSSProperties}>
              <div className="grid grid-cols-[1.55fr_1fr] items-end gap-4">
                <Frame p={purchases[0]} sizes="lg" />
                <div className="grid gap-4">
                  <Frame p={purchases[1]} sizes="sm" />
                  <Frame p={purchases[2]} sizes="sm" />
                </div>
              </div>
              <div className="mt-5 flex items-baseline justify-between border-t border-ink-line pt-3">
                <p className="placard !text-on-ink">Latest acquisitions</p>
                <Link href="/gallery" className="placard underline-offset-4 hover:!text-on-ink hover:underline">
                  View gallery
                </Link>
              </div>
            </div>
          </section>

          <dl aria-label="Live totals" className="grid grid-cols-2 border-t border-ink-line lg:grid-cols-4">
            {ledger.map((s, i) => (
              <div
                key={s.label}
                className={`px-6 py-7 lg:px-10 ${i % 2 === 1 ? "border-l border-ink-line" : ""} ${i > 0 ? "lg:border-l lg:border-ink-line" : ""} ${i >= 2 ? "border-t border-ink-line lg:border-t-0" : ""}`}
              >
                <dt className="placard">{s.label}</dt>
                <dd className="font-display mt-2 text-4xl font-medium tabular-nums">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <section className="mx-auto max-w-6xl px-5 py-24">
        <div className="max-w-xl">
          <p className="placard">How a coin curates</p>
          <h2 className="font-display mt-4 text-4xl leading-tight font-semibold">From first trade to a framed floor NFT.</h2>
        </div>
        <ol className="mt-14 grid gap-10 md:grid-cols-4 md:gap-6">
          {stages.map((s, i) => (
            <li key={s.title} className="relative">
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-md border border-line bg-surface font-mono text-xs text-muted">{i + 1}</span>
                {i < stages.length - 1 ? <span aria-hidden className="hidden h-px flex-1 bg-line md:block" /> : null}
              </div>
              <h3 className="font-display mt-5 text-xl font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-12 text-sm text-muted">
          Contracts have no owner and cannot be upgraded.{" "}
          <Link href="/docs" className="font-medium text-foreground underline underline-offset-4">
            Read how the vault is limited
          </Link>
          .
        </p>
      </section>

      <div className="border-t border-line bg-surface/60 pb-4">
        <Discover variant="collections" />
      </div>

    </>
  );
}
