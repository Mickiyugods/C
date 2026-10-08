import { LaunchForm } from "@/components/LaunchForm";
import { collections } from "@/data/mock";
import { getListedCollections } from "@/lib/chain";

export const metadata = { title: "Launch a coin" };
export const dynamic = "force-dynamic";

export default async function Page() {
  // Only collections the registry has listed can be paired; anything else would be rejected by the Launcher.
  let listed: string[] | null = null;
  try {
    const robinhood = collections.filter((c) => c.chain === "robinhood").map((c) => c.address);
    listed = await getListedCollections(robinhood);
  } catch (e) {
    console.error("Could not read the registry:", e);
  }

  return (
    <section className="mx-auto max-w-6xl px-5 pt-12 pb-16">
      <p className="placard flex items-center gap-2">
        <span className="diamond" aria-hidden /> New coin
      </p>
      <h1 className="font-display mt-3 text-4xl font-medium md:text-5xl">
        Launch a <em className="text-accent">coin</em>
      </h1>
      <p className="mt-3 max-w-2xl text-muted">
        Four steps, one transaction. Pair your coin with an NFT collection and decide where those NFTs go.
      </p>
      <div className="mt-10">
        <LaunchForm listed={listed} />
      </div>
    </section>
  );
}
