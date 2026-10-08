export function fmtEth(n: number): string {
  if (n === 0) return "0";
  if (n < 0.0001) return "<0.0001";
  if (n < 1) return n.toFixed(4);
  if (n < 1000) return n.toFixed(2);
  return Math.round(n).toLocaleString("en-US");
}

export function timeAgo(unixSeconds: number, now = Date.now() / 1000): string {
  const s = Math.max(0, Math.floor(now - unixSeconds));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Tiny prices in the launchpad's subscript convention: 0.00000428 → "0.0₅428". */
export function subPrice(p: number): string {
  if (!isFinite(p) || p <= 0) return "0";
  if (p >= 0.001) return p.toPrecision(4).replace(/\.?0+$/, "");
  const s = p.toFixed(20);
  const m = s.match(/^0\.(0+)(\d+)/);
  if (!m) return p.toExponential(2);
  const zeros = m[1].length;
  const digits = m[2].slice(0, 3);
  const sub = String(zeros).replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)]);
  return `0.0${sub}${digits}`;
}

/** A per-token price in USD, e.g. "$0.0₅428". */
export const fmtUsd = (p: number) => `$${subPrice(p)}`;

/** A large USD total in compact form, e.g. "$4.3K", "$1.20M". */
export function fmtUsdCompact(n: number): string {
  if (!isFinite(n) || n <= 0) return "$0";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return fmtUsd(n);
}
