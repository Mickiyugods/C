import { PageHeader } from "@/components/PageHeader";
import { LiveRefresh } from "@/components/coin/LiveRefresh";
import { GalleryView } from "@/components/GalleryView";
import { getPurchases, getCoins, type Purchase } from "@/lib/chain";
import type { Coin } from "@/lib/types";

export const metadata = { title: "Gallery" };

export const dynamic = "force-dynamic";

export default async function Page() {
  let purchases: Purchase[] = [];
  let coins: Coin[] = [];
  try {
    [purchases, coins] = await Promise.all([getPurchases(), getCoins()]);
  } catch (e) {
    console.error("Could not read the gallery:", e);
  }
  // coin address -> ticker, so each card can show which coin's fees paid for the NFT.
  const symbols: Record<string, string> = Object.fromEntries(coins.map((c) => [c.address.toLowerCase(), c.symbol]));

  return (
    <>
      <PageHeader eyebrow="The collection" title={<>The <em className="text-accent">gallery</em></>}>
        Every NFT a vault has bought with a coin&apos;s fees, newest first, and what happened to it.
      </PageHeader>
      <section className="mx-auto max-w-6xl px-5 py-14">
        {/* New acquisitions appear without a manual reload. */}
        <LiveRefresh intervalMs={10000} />
        <GalleryView purchases={purchases} symbols={symbols} />
      </section>
    </>
  );
}
