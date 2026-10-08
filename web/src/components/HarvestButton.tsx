"use client";

import { useState } from "react";
import { useWallet } from "@/lib/wallet";
import { harvest, explainError } from "@/lib/launch";

export function HarvestButton({ router, onInk = false }: { router: string; onInk?: boolean }) {
  const wallet = useWallet();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    setState("busy");
    try {
      await harvest(router as `0x${string}`, wallet.address as `0x${string}`);
      setState("done");
    } catch (e) {
      setError(explainError(e));
      setState("idle");
    }
  }

  const label = !wallet.address ? "Connect wallet" : wallet.wrongChain ? "Switch network" : state === "busy" ? "Harvesting…" : "Harvest";
  const onClick = !wallet.address ? wallet.connect : wallet.wrongChain ? wallet.switchChain : run;

  return (
    <div>
      <button
        onClick={onClick}
        disabled={state === "busy"}
        className={`rounded-full px-6 py-2.5 text-sm font-medium transition hover:opacity-90 disabled:opacity-50 ${
          onInk ? "bg-accent text-white" : "bg-foreground text-white"
        }`}
      >
        {label}
      </button>
      {state === "done" ? <p className={`mt-2 text-xs ${onInk ? "text-on-ink-muted" : "text-muted"}`}>Harvested. Refresh to see the new numbers.</p> : null}
      {error ? <p className={`mt-2 text-xs ${onInk ? "text-[#e8a08a]" : "text-accent"}`}>{error}</p> : null}
    </div>
  );
}
