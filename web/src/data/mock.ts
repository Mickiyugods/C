import onchain from "./onchain.json";

export type Chain = "robinhood" | "ethereum" | "solana";

export const chainLabels: Record<Chain, string> = { robinhood: "Robinhood Chain", ethereum: "Ethereum", solana: "Solana" };

export const chainLogos: Record<Chain, string> = {
  robinhood: "/chains/robinhood.png",
  ethereum: "/chains/ethereum.png",
  solana: "/chains/solana.png",
};

export const explorers: Record<Chain, string> = {
  robinhood: "https://robinhoodchain.blockscout.com/token/",
  ethereum: "https://etherscan.io/token/",
  // CoinGecko does not publish Solana collection addresses, so Solana rows link to their CoinGecko page.
  solana: "https://www.coingecko.com/en/nft/",
};

/** How a collection address is shown in lists. */
export function shortId(c: { chain: Chain; address: string; symbol?: string }) {
  if (c.chain === "solana") return c.symbol ?? "CoinGecko";
  return `${c.address.slice(0, 6)}…${c.address.slice(-4)}`;
}

export type Collection = {
  id: string;
  chain: Chain;
  address: string;
  supply: number | null;
  symbol?: string;
  name: string;
  slug: string;
  hue: number;
  image?: string;
  banner?: string;
};

export const collections: Collection[] = onchain.map((c, i) => ({
  id: `c${i}`,
  chain: (c.chain as Chain) ?? "robinhood",
  address: c.address,
  supply: c.supply,
  symbol: c.symbol ?? undefined,
  name: c.name,
  slug: c.slug,
  image: (c as { logo?: string }).logo ?? c.image ?? undefined,
  banner: (c as { banner?: string }).banner,
  hue: (i * 47) % 360,
}));
