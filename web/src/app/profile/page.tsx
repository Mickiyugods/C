import { ProfileView } from "@/components/ProfileView";
import { getCoins, getRaffles } from "@/lib/chain";
import { PageHeader } from "@/components/PageHeader";
import type { Coin, RaffleRow } from "@/lib/types";

export const metadata = { title: "Profile" };

export const dynamic = "force-dynamic";

export default async function Page() {
  let coins: Coin[] = [];
  let raffles: RaffleRow[] = [];
  try {
    [coins, raffles] = await Promise.all([getCoins(), getRaffles()]);
  } catch (e) {
    console.error("Could not read the profile data:", e);
  }

  return (
    <>
      <PageHeader eyebrow="Your wallet" title={<>Profile</>} width="max-w-4xl"></PageHeader>
      <section className="mx-auto max-w-4xl px-5 py-14">
        <div>
          <ProfileView coins={coins} raffles={raffles} />
        </div>
      </section>
    </>
  );
}
