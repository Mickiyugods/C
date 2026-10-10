import { PageHeader } from "@/components/PageHeader";
import { CollectionsList } from "@/components/CollectionsList";
import { getCollectionStats } from "@/lib/chain";
import type { CollectionStats } from "@/lib/types";

export const metadata = { title: "Collections" };

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: PageProps<"/collections">) {
  const q = (await searchParams).q;
  const initialQuery = typeof q === "string" ? q : "";
  let stats: Record<string, CollectionStats> = {};
  try {
    stats = await getCollectionStats();
  } catch (e) {
    console.error("Could not read collection stats:", e);
  }

  return (
    <>
      <PageHeader eyebrow="The collection" title={<>Collections <em className="text-accent">on view</em></>}>
        Robinhood Chain collections a new coin can be paired with, plus leading Ethereum and Solana collections for
        reference. Each coin curates exactly one Robinhood Chain collection.
      </PageHeader>
      <section className="mx-auto max-w-6xl px-5 py-14">
        <div>
          <CollectionsList stats={stats} initialQuery={initialQuery} />
        </div>

        <div id="suggest" className="mt-14 rounded-2xl bg-surface p-7">
          <h2 className="font-display text-2xl font-medium">Suggest a collection</h2>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Missing a collection? Submissions will open once the registry contract is live. Until then, this list is
            curated by hand.
          </p>
        </div>
      </section>
    </>
  );
}
