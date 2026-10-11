"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { defineChain } from "viem";
import { setActiveProvider } from "./eip1193";

export const ROBINHOOD_CHAIN_ID = 4663;

// Robinhood Chain for Privy. The public RPC is often unreachable, so use NEXT_PUBLIC_ROBINHOOD_RPC_URL when
// set (a public/rate-limited key, domain-restricted — never the secret server RPC). Transactions flow through
// the connected wallet's own provider; this RPC is the read/send fallback Privy uses, mainly for embedded wallets.
const RPC = process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const robinhood = defineChain({
  id: ROBINHOOD_CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
});

type WalletState = {
  address: string | null;
  chainId: number | null;
  error: string | null;
  connecting: boolean;
  wrongChain: boolean;
  connect: () => Promise<void>;
  switchChain: () => Promise<void>;
  disconnect: () => void;
};

const WalletContext = createContext<WalletState | null>(null);

// Shown when NEXT_PUBLIC_PRIVY_APP_ID is missing so the app still renders instead of crashing.
const DISABLED: WalletState = {
  address: null,
  chainId: null,
  error: "Wallet connect is not configured.",
  connecting: false,
  wrongChain: false,
  connect: async () => {},
  switchChain: async () => {},
  disconnect: () => {},
};

/** Bridges Privy's hooks to the small WalletState the app already uses, and keeps the wallet on Robinhood Chain. */
function WalletBridge({ children }: { children: React.ReactNode }) {
  const { ready, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const address = wallet?.address ?? null;
  const chainId = wallet?.chainId ? Number(wallet.chainId.split(":")[1]) : null;

  // Publish the connected wallet's provider for the transaction helpers in launch.ts.
  useEffect(() => {
    let live = true;
    if (!wallet) {
      setActiveProvider(null);
      return;
    }
    wallet
      .getEthereumProvider()
      .then((p) => live && setActiveProvider(p as Parameters<typeof setActiveProvider>[0]))
      .catch(() => live && setActiveProvider(null));
    return () => {
      live = false;
    };
  }, [wallet]);

  // Always keep the wallet on Robinhood Chain (4663).
  useEffect(() => {
    if (wallet && chainId !== null && chainId !== ROBINHOOD_CHAIN_ID) {
      wallet.switchChain(ROBINHOOD_CHAIN_ID).catch(() => {});
    }
  }, [wallet, chainId]);

  const connect = useCallback(async () => {
    setError(null);
    setPending(true);
    try {
      await login();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection cancelled.");
    } finally {
      setPending(false);
    }
  }, [login]);

  const switchChain = useCallback(async () => {
    if (!wallet) return;
    setError(null);
    try {
      await wallet.switchChain(ROBINHOOD_CHAIN_ID);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not switch to Robinhood Chain.");
    }
  }, [wallet]);

  const disconnect = useCallback(() => {
    setError(null);
    logout().catch(() => {});
  }, [logout]);

  const value = useMemo<WalletState>(
    () => ({
      address,
      chainId,
      error,
      connecting: !ready || pending,
      wrongChain: !!address && chainId !== null && chainId !== ROBINHOOD_CHAIN_ID,
      connect,
      switchChain,
      disconnect,
    }),
    [address, chainId, error, ready, pending, connect, switchChain, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) {
    return <WalletContext.Provider value={DISABLED}>{children}</WalletContext.Provider>;
  }
  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: { theme: "light", accentColor: "#c8643e", walletChainType: "ethereum-only" },
        loginMethods: ["wallet"],
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        defaultChain: robinhood,
        supportedChains: [robinhood],
      }}
    >
      <WalletBridge>{children}</WalletBridge>
    </PrivyProvider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
