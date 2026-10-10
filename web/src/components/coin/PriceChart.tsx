"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createChart, ColorType, CrosshairMode, type IChartApi, type ISeriesApi, type SeriesMarker, type UTCTimestamp } from "lightweight-charts";
import { fmtUsdCompact, subPrice } from "@/lib/format";
import { useWallet } from "@/lib/wallet";
import type { Trade, DevTransfer } from "@/lib/chain";

const RANGES = [
  { key: "1m", label: "1m", bucket: 60 },
  { key: "5m", label: "5m", bucket: 300 },
  { key: "1h", label: "1H", bucket: 3600 },
  { key: "all", label: "All", bucket: 0 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const UP = "#1d9e75"; // Curato green (matches Buy)
const DOWN = "#c8643e"; // Curato terracotta accent
const UP_VOL = "rgba(29,158,117,0.38)";
const DOWN_VOL = "rgba(200,100,62,0.38)";
const INK = "#15120f";
const YOU = "#2f6df6";
const SUPPLY = 1_000_000_000;

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };

/** "45s" / "15m" / "3h" / "2d" — the window the change is measured over. */
function spanLabel(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}

/** Turn raw trades (ascending) into OHLCV candles for a timeframe. */
function bucketize(points: { t: number; price: number; vol: number }[], bucket: number): Candle[] {
  if (points.length === 0) return [];
  if (bucket === 0) {
    let prevT = 0;
    let prevClose = points[0].price;
    return points.map((p) => {
      const time = p.t <= prevT ? prevT + 1 : p.t;
      prevT = time;
      const o = prevClose;
      prevClose = p.price;
      return { time, open: o, high: Math.max(o, p.price), low: Math.min(o, p.price), close: p.price, volume: p.vol };
    });
  }
  const groups = new Map<number, { t: number; price: number; vol: number }[]>();
  for (const p of points) {
    const k = Math.floor(p.t / bucket) * bucket;
    const g = groups.get(k);
    if (g) g.push(p);
    else groups.set(k, [p]);
  }
  const keys = [...groups.keys()].sort((a, b) => a - b);
  const out: Candle[] = [];
  let prevClose = points[0].price;
  for (let k = keys[0]; k <= keys[keys.length - 1]; k += bucket) {
    const g = groups.get(k);
    if (g && g.length) {
      const ps = g.map((x) => x.price);
      const o = prevClose;
      const c = ps[ps.length - 1];
      out.push({ time: k, open: o, high: Math.max(o, ...ps), low: Math.min(o, ...ps), close: c, volume: g.reduce((s, x) => s + x.vol, 0) });
      prevClose = c;
    } else {
      out.push({ time: k, open: prevClose, high: prevClose, low: prevClose, close: prevClose, volume: 0 });
    }
  }
  return out;
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span className={`relative block h-5 w-9 shrink-0 rounded-full transition ${on ? "bg-accent" : "bg-line"}`} aria-hidden>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-4" : "left-0.5"}`} />
    </span>
  );
}

export function PriceChart({ trades, ethUsd, creator, devTransfers }: { trades: Trade[]; ethUsd: number; creator: string; devTransfers: DevTransfer[] }) {
  const wallet = useWallet();
  // New/quiet coins look empty on 1m (sparse buckets carry a long flat line), so start on "All" until
  // there are enough trades for a minute view to fill in. Only the initial value — the user can switch.
  const [range, setRange] = useState<RangeKey>(() => (trades.filter((t) => t.price > 0).length <= 24 ? "all" : "1m"));
  const [mode, setMode] = useState<"candles" | "line">("candles");
  const [indOpen, setIndOpen] = useState(false);
  const [showDevTrades, setShowDevTrades] = useState(true);
  const [showDevTransfers, setShowDevTransfers] = useState(true);
  const [showYourTrades, setShowYourTrades] = useState(false);
  const [showMcap, setShowMcap] = useState(false);

  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Baseline"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const usdRef = useRef(ethUsd > 0);
  const mcapRef = useRef(false);

  const usd = ethUsd > 0;
  const mult = (usd ? ethUsd : 1) * (showMcap ? SUPPLY : 1);
  const you = wallet.address?.toLowerCase();
  const fmtBig = (p: number) => (usd ? (p >= 1 ? fmtUsdCompact(p) : `$${subPrice(p)}`) : `${subPrice(p)} ETH`);

  useEffect(() => {
    usdRef.current = usd;
  }, [usd]);
  useEffect(() => {
    mcapRef.current = showMcap;
  }, [showMcap]);

  // trades come newest-first; the chart wants oldest-first spot-price points with volume
  const points = useMemo(
    () =>
      [...trades]
        .filter((t) => t.price > 0)
        .map((t) => ({ t: t.ts, price: t.price, vol: t.ethValue }))
        .sort((a, b) => a.t - b.t),
    [trades],
  );

  const candles = useMemo(() => bucketize(points, RANGES.find((r) => r.key === range)!.bucket), [points, range]);

  // Change + its time span, straight from the live trades (not the selected timeframe) so it reads like
  // Pons — e.g. "+388.48% · 15m", measured from the first trade's price to the latest.
  const stat = useMemo(() => {
    if (points.length < 1) return null;
    const first = points[0].price;
    const last = points[points.length - 1].price;
    const change = first > 0 ? ((last - first) / first) * 100 : null;
    const span = Math.max(0, points[points.length - 1].t - points[0].t);
    return { change, span };
  }, [points]);

  const lastPrice = candles.length ? candles[candles.length - 1].close : 0;
  const indicatorCount = (showDevTrades ? 1 : 0) + (showDevTransfers ? 1 : 0) + (showYourTrades ? 1 : 0) + (showMcap ? 1 : 0);

  // create the chart + volume once
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fmtAxis = (v: number) => (usdRef.current ? (v >= 1 ? fmtUsdCompact(v) : `$${subPrice(v)}`) : subPrice(v));
    const chart = createChart(el, {
      width: el.clientWidth,
      height: 360,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#6b645c", fontFamily: "var(--font-geist-mono), monospace", fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: "#eceae4" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      localization: { priceFormatter: fmtAxis },
    });
    chartRef.current = chart;
    const vol = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol" });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volRef.current = vol;

    const onResize = () => box.current && chart.applyOptions({ width: box.current.clientWidth });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current = null;
      priceRef.current = null;
      volRef.current = null;
    };
  }, []);

  // (re)create the price series when the chart type changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const s =
      mode === "candles"
        ? chart.addCandlestickSeries({ upColor: UP, downColor: DOWN, wickUpColor: UP, wickDownColor: DOWN, borderVisible: false })
        : chart.addBaselineSeries({
            baseValue: { type: "price", price: 0 },
            topLineColor: UP,
            topFillColor1: "rgba(29,158,117,0.22)",
            topFillColor2: "rgba(29,158,117,0.02)",
            bottomLineColor: DOWN,
            bottomFillColor1: "rgba(200,100,62,0.04)",
            bottomFillColor2: "rgba(200,100,62,0.22)",
            lineWidth: 2,
          });
    priceRef.current = s;
    return () => {
      if (chartRef.current && priceRef.current) chartRef.current.removeSeries(priceRef.current);
      priceRef.current = null;
    };
  }, [mode]);

  // feed data + markers in place — live refreshes just call setData, so the chart never rebuilds
  useEffect(() => {
    const chart = chartRef.current;
    const s = priceRef.current;
    const vol = volRef.current;
    if (!chart || !s) return;
    const volScale = usd ? ethUsd : 1;
    if (mode === "candles") {
      (s as ISeriesApi<"Candlestick">).setData(candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open * mult, high: c.high * mult, low: c.low * mult, close: c.close * mult })));
    } else {
      // baseline-area (option H): green above the first price, terracotta below
      const baseline = (candles[0]?.open || candles[0]?.close || 0) * mult;
      (s as ISeriesApi<"Baseline">).applyOptions({ baseValue: { type: "price", price: baseline } });
      (s as ISeriesApi<"Baseline">).setData(candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close * mult })));
    }
    if (vol) vol.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.volume * volScale, color: c.close >= c.open ? UP_VOL : DOWN_VOL })));

    // snap a trade/transfer timestamp onto the candle that contains it
    const snap = (ts: number) => {
      let out = candles.length ? candles[0].time : ts;
      for (const c of candles) {
        if (c.time <= ts) out = c.time;
        else break;
      }
      return out as UTCTimestamp;
    };
    const marks: SeriesMarker<UTCTimestamp>[] = [];
    if (candles.length) {
      const cLo = candles[0].time;
      const creatorLc = creator?.toLowerCase() ?? "";
      if (showDevTrades && creatorLc) {
        for (const t of trades) {
          if (t.price > 0 && t.trader?.toLowerCase() === creatorLc && t.ts >= cLo) {
            marks.push({ time: snap(t.ts), position: "aboveBar", color: t.side === "buy" ? UP : DOWN, shape: "circle", text: "D" });
          }
        }
      }
      if (showDevTransfers) {
        for (const d of devTransfers) {
          if (d.ts >= cLo) marks.push({ time: snap(d.ts), position: "aboveBar", color: INK, shape: "circle", text: "T" });
        }
      }
      if (showYourTrades && you) {
        for (const t of trades) {
          if (t.price > 0 && t.trader?.toLowerCase() === you && t.ts >= cLo) {
            marks.push({ time: snap(t.ts), position: "belowBar", color: YOU, shape: "circle", text: "" });
          }
        }
      }
    }
    marks.sort((a, b) => (a.time as number) - (b.time as number));
    s.setMarkers(marks);

    chart.timeScale().fitContent();
  }, [candles, mode, mult, usd, ethUsd, showDevTrades, showDevTransfers, showYourTrades, creator, devTransfers, trades, you]);

  const items = [
    { label: "Dev trades", desc: "D on the creator's buys and sells", on: showDevTrades, set: () => setShowDevTrades((v) => !v) },
    { label: "Dev transfers", desc: "T when the creator moves tokens to another wallet", on: showDevTransfers, set: () => setShowDevTransfers((v) => !v) },
    { label: "Your trades", desc: wallet.address ? "Your buys and sells, marked" : "Connect a wallet to see this", on: showYourTrades, set: () => setShowYourTrades((v) => !v), disabled: !wallet.address },
    { label: "Market cap axis", desc: "The chart in market cap instead of price", on: showMcap, set: () => setShowMcap((v) => !v) },
  ];

  return (
    <div className="rounded-2xl border border-line bg-white p-4 sm:p-5">
      {/* Pons-style control row: price + change on the left, tools on the right */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-display text-3xl font-medium tabular-nums">{fmtBig(lastPrice * (usd ? ethUsd : 1))}</div>
          {stat?.change != null ? (
            <div className="mt-0.5 text-sm tabular-nums">
              <span className={`font-medium ${stat.change >= 0 ? "text-[#0f6e56]" : "text-accent"}`}>
                {stat.change >= 0 ? "+" : ""}
                {stat.change.toFixed(2)}%
              </span>
              {stat.span > 0 ? <span className="ml-1.5 text-muted">· {spanLabel(stat.span)}</span> : null}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setIndOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium transition hover:bg-surface"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 17l6-6 4 4 7-8" /></svg>
              Indicators
              {indicatorCount ? <span className="rounded-full bg-foreground px-1.5 text-[10px] text-white tabular-nums">{indicatorCount}</span> : null}
            </button>
            {indOpen ? (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIndOpen(false)} aria-hidden />
                <div className="absolute right-0 z-20 mt-2 w-72 rounded-2xl border border-line bg-white p-2 shadow-xl">
                  {items.map((it) => (
                    <button
                      key={it.label}
                      onClick={it.set}
                      disabled={it.disabled}
                      role="switch"
                      aria-checked={it.on}
                      className="flex w-full items-start justify-between gap-4 rounded-xl px-3 py-2.5 text-left transition enabled:hover:bg-surface disabled:cursor-not-allowed"
                    >
                      <span className={it.disabled ? "opacity-45" : ""}>
                        <span className="block text-sm font-medium">{it.label}</span>
                        <span className="mt-0.5 block text-xs text-muted">{it.desc}</span>
                      </span>
                      <span className={`pt-0.5 ${it.disabled ? "opacity-45" : ""}`}>
                        <Toggle on={it.on} />
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
          <div className="flex rounded-full border border-line p-0.5" role="tablist" aria-label="Chart type">
            {(["line", "candles"] as const).map((m) => (
              <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`rounded-full px-3 py-1 text-xs capitalize transition ${mode === m ? "bg-foreground text-white" : "text-muted hover:text-foreground"}`}>
                {m}
              </button>
            ))}
          </div>
          <div className="flex rounded-full border border-line p-0.5" role="tablist" aria-label="Timeframe">
            {RANGES.map((r) => (
              <button key={r.key} role="tab" aria-selected={range === r.key} onClick={() => setRange(r.key)} className={`rounded-full px-3 py-1 text-xs transition ${range === r.key ? "bg-foreground text-white" : "text-muted hover:text-foreground"}`}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative">
        <div ref={box} className="h-[360px] w-full" />
        {candles.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg border border-dashed border-line bg-surface/40 text-sm text-muted">
            No trades yet. The chart fills in as the coin trades.
          </div>
        ) : null}
      </div>
    </div>
  );
}
