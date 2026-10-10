"use client";

import { useState } from "react";
import { RaffleBox } from "./RaffleBox";
import type { RaffleRow } from "@/lib/types";

const PAGE = 6; // raffle boxes are tall; reveal the rest on demand

export function RaffleList({ raffles, empty, symbols = {} }: { raffles: RaffleRow[]; empty: string; symbols?: Record<string, string> }) {
  const [shown, setShown] = useState(PAGE);

  if (!raffles.length) {
    return <p className="rounded-2xl border border-dashed border-line bg-surface/50 px-6 py-12 text-center text-sm text-muted">{empty}</p>;
  }
  return (
    <div className="space-y-4">
      {raffles.slice(0, shown).map((r) => (
        <RaffleBox key={r.id} r={r} symbol={symbols[r.coin.toLowerCase()]} />
      ))}
      {raffles.length > shown ? (
        <div className="flex justify-center pt-1">
          <button
            onClick={() => setShown((n) => n + PAGE)}
            className="rounded-full border border-line px-5 py-2 text-xs font-medium text-muted transition hover:bg-surface hover:text-foreground"
          >
            Load more ({raffles.length - shown})
          </button>
        </div>
      ) : null}
    </div>
  );
}
