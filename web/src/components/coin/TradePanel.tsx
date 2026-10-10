"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { parseEther, formatEther, type Address } from "viem";
import { useWallet } from "@/lib/wallet";
import { buyCoin, sellCoin, tokenBalance, ethBalance, explainError, type TradeStatus } from "@/lib/launch";
import { subPrice } from "@/lib/format";

type Side = "buy" | "sell";
const SLIPPAGES = [0.01, 0.03, 0.05, 0.1];
const PCTS = [25, 50, 75, 100];
const GAS_BUFFER = parseEther("0.0005");

const statusLabel: Record<TradeStatus, string> = {
  simulating: "Checking…",
  approve: "Approve in your wallet…",
  confirm: "Confirm in your wallet…",
  mining: "Waiting for the chain…",
};

export function TradePanel({
  coin,
  curve,
  symbol,
  ethUsd,
  reserveQuoteEth = 0,
  reserveToken = 0,
  feeBps = 0,
  creatorTaxBps = 0,
  graduated = false,
  initialSide = "buy",
}: {
  coin: string;
  curve: string;
  symbol: string;
  ethUsd: number;
  reserveQuoteEth?: number;
  reserveToken?: number;
  feeBps?: number;
  creatorTaxBps?: number;
  graduated?: boolean;
  initialSide?: Side;
}) {
  const wallet = useWallet();
  const router = useRouter();
  const [side, setSide] = useState<Side>(initialSide);
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(0.03);
  const [tokenBalState, setTokenBal] = useState<bigint | null>(null);
  const [ethBalState, setEthBal] = useState<bigint | null>(null);
  const [status, setStatus] = useState<TradeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!wallet.address) return;
    let live = true;
    tokenBalance(coin as Address, wallet.address as Address).then((b) => live && setTokenBal(b)).catch(() => live && setTokenBal(null));
    ethBalance(wallet.address as Address).then((b) => live && setEthBal(b)).catch(() => live && setEthBal(null));
    return () => {
      live = false;
    };
  }, [wallet.address, coin, done]);

  // treat balances as unknown whenever no wallet is connected
  const tokenBal = wallet.address ? tokenBalState : null;
  const ethBal = wallet.address ? ethBalState : null;

  if (graduated) {
    return (
      <div className="rounded-2xl border border-line bg-white p-5">
        <p className="placard">Trading</p>
        <h3 className="font-display mt-2 text-xl font-medium">Graduated to Uniswap&nbsp;v4</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          This coin filled its bonding curve and now trades on a Uniswap&nbsp;v4 pool. Its fees still harvest to the vault (80%) and the treasury (20%).
        </p>
        <a
          href={`https://robinhoodchain.blockscout.com/token/${coin}`}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-foreground px-6 py-3 text-sm font-medium text-white transition hover:opacity-90"
        >
          View the pool ↗
        </a>
      </div>
    );
  }

  const busy = status !== null;
  const num = Number(amount);
  const amountValid = amount !== "" && num > 0 && (side !== "sell" || tokenBal === null || parseEther(amount || "0") <= tokenBal);

  const base = side === "buy" ? ethBal : tokenBal;
  function quick(pct: number) {
    if (base === null) return;
    const raw = pct === 100 && side === "buy" ? (base > GAS_BUFFER ? base - GAS_BUFFER : 0n) : (base * BigInt(pct)) / 100n;
    setAmount(formatEther(raw));
  }

  // Exact quote off the constant-product curve (k = quote·token), net of the curve fee + creator tax,
  // plus the resulting price impact. The transaction itself still protects with an on-chain minOut.
  const feeFrac = (feeBps + creatorTaxBps) / 10_000;
  const quote = (() => {
    const Rq = reserveQuoteEth;
    const Rt = reserveToken;
    if (num <= 0 || Rq <= 0 || Rt <= 0) return null;
    const k = Rq * Rt;
    const spot = Rq / Rt;
    if (side === "buy") {
      const netIn = num * (1 - feeFrac);
      const out = Rt - k / (Rq + netIn); // tokens out
      if (out <= 0) return null;
      const exec = num / out; // ETH per token paid
      return { receive: out, impact: spot > 0 ? (exec - spot) / spot : 0 };
    }
    const grossOut = Rq - k / (Rt + num); // ETH out before fee
    const out = grossOut * (1 - feeFrac);
    if (out <= 0) return null;
    const exec = out / num; // ETH per token received
    return { receive: out, impact: spot > 0 ? (spot - exec) / spot : 0 };
  })();

  const receiveLabel = !quote
    ? "—"
    : side === "buy"
      ? `${quote.receive.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${symbol}`
      : `${subPrice(quote.receive)} ETH${ethUsd > 0 ? ` · $${subPrice(quote.receive * ethUsd)}` : ""}`;

  // the connected wallet's current position in this coin
  const spot = reserveToken > 0 ? reserveQuoteEth / reserveToken : 0;
  const posTokens = tokenBal !== null ? Number(formatEther(tokenBal)) : 0;
  const posUsd = posTokens * spot * ethUsd;

  async function submit() {
    if (!wallet.address || !amountValid) return;
    setError(null);
    setDone(null);
    try {
      const hash =
        side === "buy"
          ? await buyCoin(curve as Address, coin as Address, parseEther(amount), wallet.address as Address, slippage, setStatus)
          : await sellCoin(curve as Address, coin as Address, parseEther(amount), wallet.address as Address, slippage, setStatus);
      setDone(hash);
      setAmount("");
      router.refresh();
    } catch (e) {
      setError(explainError(e));
    } finally {
      setStatus(null);
    }
  }

  let label = side === "buy" ? `Buy ${symbol}` : `Sell ${symbol}`;
  let action: (() => void) | undefined = submit;
  let disabled = busy || !amountValid;
  if (!wallet.address) {
    label = wallet.connecting ? "Connecting…" : "Connect wallet";
    action = wallet.connect;
    disabled = wallet.connecting;
  } else if (wallet.wrongChain) {
    label = "Switch to Robinhood Chain";
    action = wallet.switchChain;
    disabled = false;
  } else if (busy) {
    label = statusLabel[status!];
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <div className="flex rounded-full border border-line p-0.5" role="tablist" aria-label="Buy or sell">
        {(["buy", "sell"] as Side[]).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={side === s}
            onClick={() => {
              setSide(s);
              setAmount("");
              setError(null);
              setDone(null);
            }}
            className={`flex-1 rounded-full py-2 text-sm font-medium capitalize transition ${
              side === s ? (s === "buy" ? "bg-[#1d9e75] text-white" : "bg-accent text-white") : "text-muted hover:text-foreground"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {wallet.address && posTokens > 0 ? (
        <div className="mt-3 flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-xs">
          <span className="text-muted">Your position</span>
          <span className="font-medium tabular-nums">
            {posTokens.toLocaleString("en-US", { maximumFractionDigits: 0 })} {symbol}
            {ethUsd > 0 ? <span className="text-muted"> · ${subPrice(posUsd)}</span> : null}
          </span>
        </div>
      ) : null}

      <label className="mt-4 block">
        <span className="placard">{side === "buy" ? "You pay (ETH)" : `You sell (${symbol})`}</span>
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.0"
          className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 font-mono text-lg outline-none focus:border-foreground"
        />
      </label>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {PCTS.map((p) => (
            <button
              key={p}
              onClick={() => quick(p)}
              disabled={base === null}
              className="rounded-md border border-line px-2 py-1 text-xs tabular-nums transition enabled:hover:bg-surface disabled:opacity-40"
            >
              {p === 100 ? "Max" : `${p}%`}
            </button>
          ))}
        </div>
        {wallet.address ? (
          <span className="text-xs text-muted tabular-nums">
            {side === "buy"
              ? ethBal === null
                ? "…"
                : `${Number(formatEther(ethBal)).toLocaleString("en-US", { maximumFractionDigits: 3 })} ETH`
              : tokenBal === null
                ? "…"
                : `${Number(formatEther(tokenBal)).toLocaleString("en-US", { maximumFractionDigits: 0 })} ${symbol}`}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-muted">You receive</span>
        <span className="font-medium tabular-nums">≈ {receiveLabel}</span>
      </div>
      {quote && Math.abs(quote.impact) >= 0.0001 ? (
        <div className="mt-1.5 flex items-center justify-between text-xs">
          <span className="text-muted">Price impact</span>
          <span className={`tabular-nums ${quote.impact > 0.05 ? "text-accent" : "text-muted"}`}>
            {quote.impact > 0 ? "-" : "+"}
            {(Math.abs(quote.impact) * 100).toFixed(2)}%
          </span>
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between">
        <span className="placard">Max slippage</span>
        <div className="flex gap-1">
          {SLIPPAGES.map((s) => (
            <button
              key={s}
              onClick={() => setSlippage(s)}
              className={`rounded-md border px-2 py-1 text-xs tabular-nums transition ${slippage === s ? "border-foreground bg-foreground text-white" : "border-line text-muted hover:bg-surface"}`}
            >
              {s * 100}%
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="mt-3 rounded-md border border-accent/40 bg-accent/5 p-2.5 text-xs text-accent">{error}</p> : null}
      {done ? (
        <p className="mt-3 flex items-center justify-between gap-2 rounded-md border border-[#1d9e75]/40 bg-[#1d9e75]/5 p-2.5 text-xs text-[#0f6e56]">
          <span>Done — the page is refreshing.</span>
          <a href={`https://robinhoodchain.blockscout.com/tx/${done}`} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
            View tx ↗
          </a>
        </p>
      ) : null}

      <button
        onClick={action}
        disabled={disabled}
        className={`mt-4 w-full rounded-full px-6 py-3 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-40 ${
          side === "buy" ? "bg-[#1d9e75] hover:opacity-90" : "bg-accent hover:opacity-90"
        }`}
      >
        {label}
      </button>
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Trades go through the Pons bonding curve. Price moves with each trade; slippage protects you from a worse fill.
      </p>
    </div>
  );
}
