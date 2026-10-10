import { RaffleList } from "@/components/RaffleList";
import { getRaffles } from "@/lib/chain";
import { PageHeader } from "@/components/PageHeader";
import type { RaffleRow } from "@/lib/types";

export const metadata = { title: "Giveaways" };

export const dynamic = "force-dynamic";

const run = [
  ["NFT bought", "The coin's vault buys an NFT and anyone can send it to the raffle."],
  ["Snapshot", "The keeper posts who held how much of the coin when the NFT arrived. A 15-minute window lets anyone check it."],
  ["Draw pinned", "Anyone pins a future drand round, so the number is unknown when pinned."],
  ["Drawn", "Anyone submits that round's signature. The contract verifies it and fixes the winning ticket."],
  ["Delivered", "Anyone triggers delivery and the NFT goes straight to the winner's wallet."],
] as const;

export default async function Page() {
  let raffles: RaffleRow[] = [];
  try {
    raffles = await getRaffles();
  } catch (e) {
    console.error("Could not read raffles:", e);
  }
  const live = raffles.filter((r) => r.state !== "settled");
  const delivered = raffles.filter((r) => r.state === "settled");

  return (
    <>
      <PageHeader eyebrow="For holders" title={<>What holders <em className="text-accent">win</em></>}>
        When an Airdrop coin&apos;s vault buys an NFT, it is raffled to the coin&apos;s holders. Odds follow balance, the
        random number comes from drand and is verified on-chain, and the winner receives the NFT in their wallet
        without lifting a finger. Nothing to claim.
      </PageHeader>

      <section className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-12 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0 space-y-14">
            <div>
              <h2 className="font-display text-3xl font-medium">In progress</h2>
              <p className="mt-2 text-sm text-muted">Giveaways working through the steps right now.</p>
              <div className="mt-5">
                <RaffleList raffles={live} empty="No giveaways in progress. They appear here as soon as a vault buys an NFT for an Airdrop coin." />
              </div>
            </div>

            <div>
              <h2 className="font-display text-3xl font-medium">Delivered</h2>
              <p className="mt-2 text-sm text-muted">NFTs already sent to a winner&apos;s wallet.</p>
              <div className="mt-5">
                <RaffleList raffles={delivered} empty="No NFT has been delivered yet." />
              </div>
            </div>
          </div>

          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="mat !p-6">
              <p className="placard">How a giveaway runs</p>
              <ol className="mt-4 space-y-4">
                {run.map(([title, body], i) => (
                  <li key={title} className="flex gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-line bg-surface font-mono text-xs text-muted">{i + 1}</span>
                    <span>
                      <span className="block text-sm font-medium">{title}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted">{body}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-muted">
                Only trading fees buy these NFTs. ETH sent straight to a vault is not treated as fees, so a prize cannot
                be manufactured.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
