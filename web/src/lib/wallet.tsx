"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export const ROBINHOOD_CHAIN_ID = 4663;
const CHAIN_HEX = "0x" + ROBINHOOD_CHAIN_ID.toString(16);

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, cb: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: Eip1193;
  }
}

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

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const eth = window.ethereum;
    if (!eth) return;

    eth.request({ method: "eth_accounts" }).then((a) => setAddress((a as string[])[0] ?? null)).catch(() => {});
    eth.request({ method: "eth_chainId" }).then((c) => setChainId(parseInt(c as string, 16))).catch(() => {});

    const onAccounts = (a: unknown) => setAddress((a as string[])[0] ?? null);
    const onChain = (c: unknown) => setChainId(parseInt(c as string, 16));
    eth.on?.("accountsChanged", onAccounts);
    eth.on?.("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    const eth = window.ethereum;
    if (!eth) {
      setError("No wallet found. Install MetaMask, Rabby or another browser wallet.");
      return;
    }
    setConnecting(true);
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      setAddress(accounts[0] ?? null);
      setChainId(parseInt((await eth.request({ method: "eth_chainId" })) as string, 16));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection rejected.");
    } finally {
      setConnecting(false);
    }
  }, []);

  // Wallets have no standard RPC to disconnect, so this just forgets the connection in the app (until the
  // page reloads and reads the still-authorized account again).
  const disconnect = useCallback(() => {
    setAddress(null);
    setError(null);
  }, []);

  const switchChain = useCallback(async () => {
    setError(null);
    const eth = window.ethereum;
    if (!eth) return;
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
    } catch (e) {
      if ((e as { code?: number }).code === 4902) {
        try {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: CHAIN_HEX,
                chainName: "Robinhood Chain",
                nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
                blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
              },
            ],
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not add Robinhood Chain.");
        }
      } else {
        setError(e instanceof Error ? e.message : "Could not switch network.");
      }
    }
  }, []);

  const value = useMemo<WalletState>(
    () => ({
      address,
      chainId,
      error,
      connecting,
      wrongChain: !!address && chainId !== null && chainId !== ROBINHOOD_CHAIN_ID,
      connect,
      switchChain,
      disconnect,
    }),
    [address, chainId, error, connecting, connect, switchChain, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
