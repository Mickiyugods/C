import { TopTokens } from "./TopTokens";
import { TopCollections } from "./TopCollections";
import { getCoins, getCollectionStats, getEthUsd } from "@/lib/chain";
import type { Coin, CollectionStats } from "@/lib/types";

export async function Discover() {
  let coins: Coin[] = [];
  let stats: Record<string, CollectionStats> = {};
  let ethUsd = 0;
  try {
    [coins, stats, ethUsd] = await Promise.all([getCoins(), getCollectionStats(), getEthUsd()]);
  } catch (e) {
    console.error("Could not read the chain:", e);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-24 px-5 py-20">
      <TopTokens coins={coins} ethUsd={ethUsd} />
      <TopCollections stats={stats} />
    </div>
  );
}
