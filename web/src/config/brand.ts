export const brand = {
  name: "Curato",
  tagline: "Launch coins that curate NFT floors.",
  description:
    "Pair a coin with an NFT collection. 80% of creator fees buy that collection's floor, and holders share the haul.",
  chain: { name: "Robinhood Chain", id: 4663 },
  launchpad: "Pons",
  social: { x: "https://x.com/" },
  split: { vault: 80, treasury: 20 },
  /** The official $CURATO coin, launched through this same site. Posted here so it can't be faked. */
  officialCoin: "0xb3d8f50432dc469b0189889a8074e0cac3b806b0",
} as const;

// Launch economics shown in the preview. All of these are verified on chain / on a fork
// (see docs/pons-notes.md): supply, curve fee, launch fee, graduation threshold, the 10% tax cap and the
// 70/30 split of the curve fee between the creator router and Pons.
export const launchParams = {
  supply: 1_000_000_000,
  creatorTaxPct: 1,
  maxCreatorTaxPct: 10,
  curveFeePct: 1,
  curveFeeToRouterPct: 70,
  ponsLaunchFeeEth: 0.0005,
  graduationEth: 4.2,
} as const;

export function feesPerEthTraded(taxPct: number = launchParams.creatorTaxPct) {
  const curve = launchParams.curveFeePct / 100;
  const toRouter = curve * (launchParams.curveFeeToRouterPct / 100) + taxPct / 100;
  return {
    vault: toRouter * (brand.split.vault / 100),
    treasury: toRouter * (brand.split.treasury / 100),
    pons: curve * (1 - launchParams.curveFeeToRouterPct / 100),
  };
}

export const nav = [
  { href: "/explore", label: "Explore" },
  { href: "/collections", label: "Collections" },
  { href: "/gallery", label: "Gallery" },
  { href: "/giveaways", label: "Giveaways" },
  { href: "/docs", label: "Docs" },
] as const;
