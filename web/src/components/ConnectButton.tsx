"use client";

import { useWallet, shortAddress } from "@/lib/wallet";

export function ConnectButton() {
  const { address, connect, connecting, wrongChain, switchChain, error } = useWallet();

  const base = "rounded-md border px-3 py-2 text-sm sm:px-4 font-medium whitespace-nowrap transition";

  if (address && wrongChain) {
    return (
      <button onClick={switchChain} className={`${base} border-accent text-accent hover:bg-surface`}>
        Switch network
      </button>
    );
  }

  if (address) {
    return (
      <span className={`${base} border-line font-mono text-xs`} title={address}>
        {shortAddress(address)}
      </span>
    );
  }

  return (
    <button
      onClick={connect}
      disabled={connecting}
      title={error ?? undefined}
      className={`${base} border-line hover:bg-surface disabled:opacity-50`}
    >
      {connecting ? (
        "Connecting…"
      ) : (
        <>
          <span className="sm:hidden">Connect</span>
          <span className="hidden sm:inline">Connect wallet</span>
        </>
      )}
    </button>
  );
}
