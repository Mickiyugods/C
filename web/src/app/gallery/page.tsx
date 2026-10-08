import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Mat } from "@/components/Mat";
import { collections } from "@/data/mock";
import { getPurchases, type Purchase } from "@/lib/chain";
import { PageHeader } from "@/components/PageHeader";
import { fmtEth, short } from "@/lib/format";

export const metadata = { title: "Gallery" };

export const dynamic = "force-dynamic";

const badge: Record<Purchase["status"], string> = {
  held: "In the vault",
  delivered: "Sent to the giveaway",
  burned: "Burned",
};

export default async function Page() {
  let purchases: Purchase[] = [];
  try {
    purchases = await getPurchases();
  } catch (e) {
    console.error("Could not read purchases:", e);
  }

  return (
    <>
      <PageHeader eyebrow="The collection" title={<>The <em className="text-accent">gallery</em></>}>
        Every NFT a vault has bought with a coin&apos;s fees, newest first, and what happened to it.
      </PageHeader>
      <section className="mx-auto max-w-6xl px-5 py-14">

        {purchases.length === 0 ? (
          <p className="mt-10 rounded-xl border border-dashed border-line bg-surface/50 px-6 py-14 text-center text-sm text-muted">
            No NFT has been bought yet. They show up here after a vault sweeps its first floor listing.
          </p>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {purchases.map((p) => {
              const col = collections.find((c) => c.address.toLowerCase() === p.collection.toLowerCase());
              return (
                <Link
                  key={`${p.coin}-${p.tokenId}`}
                  href={`/coin/${p.coin}`}
                  className="rounded-xl border border-line bg-white p-2.5 transition hover:border-foreground/40"
                >
                  <Mat placard={<><span>#{p.tokenId}</span><span>{fmtEth(p.priceEth)} ETH</span></>}>
                    <Avatar
                      seed={Number(p.tokenId) + 7}
                      hue={col?.hue ?? 30}
                      image={col?.image}
                      alt={col?.name ?? ""}
                      grid={10}
                      className="aspect-square"
                    />
                  </Mat>
                  <p className="font-display mt-3 truncate text-lg font-semibold">
                    {col?.name ?? short(p.collection)} <span className="text-muted">#{p.tokenId}</span>
                  </p>
                  <p className="mt-2 inline-block rounded-md bg-surface px-2.5 py-0.5 text-xs text-muted">{badge[p.status]}</p>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
