import { TopTokens } from "./TopTokens";
import { TopCollections } from "./TopCollections";
import { LiveRefresh } from "./coin/LiveRefresh";
import { getCoins, getCollectionStats, getEthUsd } from "@/lib/chain";
import type { Coin, CollectionStats } from "@/lib/types";

// "full" (Explore) shows the searchable coin register plus the collections wall; "collections" (Home)
// shows only the collections showcase, so the landing page doesn't duplicate the register.
export async function Discover({ variant = "full" }: { variant?: "full" | "collections" }) {
  const showCoins = variant === "full";
  let coins: Coin[] = [];
  let stats: Record<string, CollectionStats> = {};
  let ethUsd = 0;
  try {
    if (showCoins) {
      [coins, stats, ethUsd] = await Promise.all([getCoins(), getCollectionStats(), getEthUsd()]);
    } else {
      stats = await getCollectionStats();
    }
  } catch (e) {
    console.error("Could not read the chain:", e);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-24 px-5 py-20">
      {/* Keeps market cap / fees routed current without a manual reload. */}
      <LiveRefresh intervalMs={5000} />
      {showCoins ? <TopTokens coins={coins} ethUsd={ethUsd} /> : null}
      <TopCollections stats={stats} />
    </div>
  );
}
