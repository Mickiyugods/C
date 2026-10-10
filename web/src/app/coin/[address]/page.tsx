import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Mat } from "@/components/Mat";
import { HarvestButton } from "@/components/HarvestButton";
import { PriceChart } from "@/components/coin/PriceChart";
import { TradePanel } from "@/components/coin/TradePanel";
import { Activity } from "@/components/coin/Activity";
import { LiveRefresh } from "@/components/coin/LiveRefresh";
import { CopyButton, SocialLinks } from "@/components/coin/HeaderBits";
import { collections, collectionUrl } from "@/data/mock";
import { getCoinDetails } from "@/lib/chain";
import { fmtEth, fmtUsd, fmtUsdCompact, short, subPrice, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

const EXPLORER = "https://robinhoodchain.blockscout.com/address/";

export async function generateMetadata({ params }: PageProps<"/coin/[address]">) {
  const { address } = await params;
  try {
    const details = /^0x[0-9a-fA-F]{40}$/.test(address) ? await getCoinDetails(address) : null;
    if (details) {
      const { coin } = details;
      const title = `${coin.name} ($${coin.symbol})`;
      const description = coin.description || `${coin.name} curates ${coin.symbol} on Curato — trading fees fund a vault that buys floor NFTs, split 80% vault / 20% treasury.`;
      const images = /^https?:\/\//.test(coin.logo) ? [coin.logo] : undefined;
      return {
        title,
        description,
        openGraph: { title, description, images, type: "website" as const },
        twitter: { card: images ? ("summary_large_image" as const) : ("summary" as const), title, description, images },
      };
    }
  } catch {
    // fall through to the generic title
  }
  return { title: "Coin" };
}

export default async function Page({ params }: PageProps<"/coin/[address]">) {
  const { address } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) notFound();

  let details;
  try {
    details = await getCoinDetails(address);
  } catch (e) {
    console.error("Could not read the coin:", e);
  }
  if (!details) notFound();

  const { coin, vaultBalanceEth, purchases, market, trades, holders, devTransfers } = details;
  const collection = collections.find((c) => c.address.toLowerCase() === coin.collection.toLowerCase());
  const collectionHref = collection ? collectionUrl(collection) : null;
  const seed = parseInt(coin.address.slice(2, 10), 16);
  const marketCap = coin.graduated ? null : coin.marketCapEth;
  const pct = Math.round(market.progress * 100);

  const usd = market.ethUsd > 0;
  const marketCapLabel = marketCap === null ? "Graduated" : usd ? fmtUsdCompact(marketCap * market.ethUsd) : `${fmtEth(marketCap)} ETH`;
  const priceLabel = usd ? fmtUsd(market.priceEth * market.ethUsd) : `${subPrice(market.priceEth)} ETH`;

  const stats: [string, string][] = [
    ["Holders", String(market.holders)],
    ["Trades", String(market.trades)],
    ["Supply", "1B"],
    ["Fees routed", `${fmtEth(coin.feesRoutedEth)} ETH`],
    ["In vault", `${fmtEth(vaultBalanceEth)} ETH`],
  ];

  const rows: [string, React.ReactNode][] = [
    ["Sweeps", collection ? collection.name : <span className="font-mono">{short(coin.collection)}</span>],
    ["NFT policy", coin.policy === "airdrop" ? "Airdrop to holders" : "Burn"],
    ["Creator tax", `${(coin.creatorTaxBps / 100).toFixed(2)}%`],
    ["Launched", coin.launchedAt ? timeAgo(coin.launchedAt) : "-"],
    [
      "Creator",
      <a key="cr" className="font-mono underline-offset-2 hover:underline" href={EXPLORER + coin.creator} target="_blank" rel="noreferrer">
        {short(coin.creator)}
      </a>,
    ],
    ["Status", coin.graduated ? "Graduated to Uniswap v4" : "On the bonding curve"],
  ];

  return (
    <>
      {/* Pons-style light identity header */}
      <header className="border-b border-line">
        <div className="mx-auto max-w-6xl px-5 pt-6 pb-5">
          <div className="flex items-center justify-between gap-3">
            <Link href="/explore" className="placard transition hover:text-foreground">
              ← The register
            </Link>
            <LiveRefresh />
          </div>
          <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="mat w-16 shrink-0 !p-1.5">
                <Avatar seed={seed} hue={seed % 360} image={/^https?:\/\//.test(coin.logo) ? coin.logo : undefined} alt={coin.name} grid={12} className="aspect-square" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <h1 className="font-display text-3xl leading-none font-medium md:text-4xl">{coin.name}</h1>
                  <span className="text-lg font-medium tracking-wide text-muted">{coin.symbol}</span>
                  <SocialLinks socials={coin.socials} />
                </div>
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                  <span className="flex items-center gap-1.5">
                    <span className="diamond" aria-hidden /> Curates{" "}
                    {collection ? (
                      collectionHref ? (
                        <a href={collectionHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                          {collection.name}
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14 5h5v5M19 5l-8 8M19 13v4.5A1.5 1.5 0 0 1 17.5 19h-11A1.5 1.5 0 0 1 5 17.5v-11A1.5 1.5 0 0 1 6.5 5H11" /></svg>
                        </a>
                      ) : (
                        collection.name
                      )
                    ) : (
                      short(coin.collection)
                    )}
                  </span>
                  {coin.launchedAt ? (<><span aria-hidden>·</span><span>{timeAgo(coin.launchedAt)}</span></>) : null}
                  <span aria-hidden>·</span>
                  <span>ETH pair</span>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1.5 font-mono">
                    <a href={EXPLORER + coin.address} target="_blank" rel="noreferrer" className="hover:text-foreground hover:underline">{short(coin.address)}</a>
                    <CopyButton text={coin.address} />
                    <a href={EXPLORER + coin.address} target="_blank" rel="noreferrer" aria-label="Open in explorer" className="transition hover:text-foreground">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14 5h5v5M19 5l-8 8M19 13v4.5A1.5 1.5 0 0 1 17.5 19h-11A1.5 1.5 0 0 1 5 17.5v-11A1.5 1.5 0 0 1 6.5 5H11" /></svg>
                    </a>
                  </span>
                </p>
              </div>
            </div>
            <div className="shrink-0 sm:text-right">
              <p className="text-sm text-muted">Market cap</p>
              <p className="font-display text-3xl font-medium tabular-nums md:text-4xl">{marketCapLabel}</p>
              {marketCap === null ? null : <p className="mt-1 font-mono text-xs text-muted tabular-nums">{priceLabel} price</p>}
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-8 px-5 py-10 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-8">
          {/* Harvest — Curato's signature ink panel (ink + terracotta + ivory) for the key action */}
          <div className="ink flex flex-col gap-4 rounded-2xl border border-accent/50 !p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="placard flex items-center gap-1.5"><span className="diamond" aria-hidden /> Fees</p>
              <p className="font-display mt-1.5 text-2xl font-medium text-on-ink">Harvest this coin</p>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-on-ink-muted">
                Anyone can pull this coin&apos;s accrued fees out of Pons — <span className="text-on-ink">80%</span> to the vault, <span className="text-on-ink">20%</span> to the treasury, in one transaction.
              </p>
            </div>
            <div className="shrink-0">
              <HarvestButton router={coin.router} onInk />
            </div>
          </div>

          <PriceChart trades={trades} ethUsd={market.ethUsd} creator={coin.creator} devTransfers={devTransfers} />

          {coin.graduated ? null : (
            <div className="rounded-2xl border border-line bg-white p-5">
              <div className="mb-2 flex items-center justify-between text-sm text-muted">
                <span>Bonding curve</span>
                <span className="tabular-nums">{pct}% of {fmtEth(market.graduationEth)} ETH</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, pct)}%` }} />
              </div>
            </div>
          )}

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
            {stats.map(([k, v]) => (
              <div key={k} className="bg-white px-5 py-4">
                <dt className="placard">{k}</dt>
                <dd className="font-display mt-1.5 text-2xl font-medium tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="rounded-2xl border border-line bg-white p-5">
            <Activity trades={trades} holders={holders} symbol={coin.symbol} creator={coin.creator} />
          </div>
        </div>

        <aside className="space-y-8">
          <TradePanel
            coin={coin.address}
            curve={coin.curve}
            symbol={coin.symbol}
            ethUsd={market.ethUsd}
            reserveQuoteEth={market.reserveQuoteEth}
            reserveToken={market.reserveToken}
            feeBps={market.feeBps}
            creatorTaxBps={coin.creatorTaxBps}
            graduated={coin.graduated}
          />

          <div className="rounded-2xl border border-line bg-white p-5">
            <h2 className="font-display text-2xl font-medium">Details</h2>
            {coin.description ? <p className="mt-3 text-sm leading-relaxed text-muted">{coin.description}</p> : null}
            <dl className="mt-4 divide-y divide-line text-sm">
              {rows.map(([k, v], i) => (
                <div key={i} className="flex justify-between gap-6 py-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-2xl border border-line bg-white p-5">
            <h2 className="font-display text-2xl font-medium">Acquired by this vault</h2>
            {purchases.length ? (
              <ul className="mt-4 grid grid-cols-2 gap-4">
                {purchases.map((p) => (
                  <li key={p.tokenId}>
                    <Mat placard={<><span>#{p.tokenId}</span><span>{fmtEth(p.priceEth)} ETH</span></>}>
                      <Avatar
                        seed={Number(p.tokenId) + 7}
                        hue={collection?.hue ?? 30}
                        image={collection?.image}
                        alt={collection ? `${collection.name} #${p.tokenId}` : `Token #${p.tokenId}`}
                        grid={10}
                        className="aspect-square"
                      />
                    </Mat>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 px-1 py-6 text-center text-sm text-muted">
                The vault has not bought an NFT for this coin yet. Purchases appear here, framed, as soon as they happen.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-line bg-white p-5">
            <h2 className="font-display text-2xl font-medium">Contracts</h2>
            <dl className="mt-4 divide-y divide-line text-sm">
              {[
                ["Coin", coin.address],
                ["Bonding curve", coin.curve],
                ["Fee router", coin.router],
                ["Collection vault", coin.vault],
                ["Dev wallet", coin.creator],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-6 py-3">
                  <dt className="text-muted">{k}</dt>
                  <dd>
                    <a className="font-mono text-xs underline-offset-2 hover:underline" href={EXPLORER + v} target="_blank" rel="noreferrer">
                      {short(v)} ↗
                    </a>
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-2xl border border-line bg-white p-5">
            <h2 className="font-display text-2xl font-medium">Fees harvested</h2>
            <dl className="mt-4 divide-y divide-line text-sm">
              <div className="flex justify-between gap-6 py-3">
                <dt className="text-muted">Total harvested</dt>
                <dd className="font-medium tabular-nums">{fmtEth(coin.feesRoutedEth)} ETH</dd>
              </div>
              <div className="flex justify-between gap-6 py-3">
                <dt className="flex items-center gap-1.5 text-muted"><span className="diamond" aria-hidden /> To vault (80%)</dt>
                <dd className="font-medium tabular-nums">{fmtEth(market.toVaultEth)} ETH</dd>
              </div>
              <div className="flex justify-between gap-6 py-3">
                <dt className="flex items-center gap-1.5 text-muted"><span className="diamond" aria-hidden /> To treasury (20%)</dt>
                <dd className="font-medium tabular-nums">{fmtEth(market.toTreasuryEth)} ETH</dd>
              </div>
            </dl>
          </div>
        </aside>
      </section>
    </>
  );
}
