export type Policy = "airdrop" | "burn";

export type Coin = {
  address: string;
  name: string;
  symbol: string;
  logo: string;
  description: string;
  creator: string;
  collection: string;
  curve: string;
  router: string;
  vault: string;
  policy: Policy;
  creatorTaxBps: number;
  launchedAt: number; // unix seconds
  graduated: boolean;
  /** Market cap in ETH while on the bonding curve, null once graduated. */
  marketCapEth: number | null;
  /** Total ETH harvested from Pons for this coin (split 80/20 by the router). */
  feesRoutedEth: number;
  /** Social links recorded at launch (empty string when not provided). */
  socials: { twitter: string; telegram: string; discord: string; website: string; farcaster: string };
};

export type CollectionStats = {
  coins: number;
  vault: string | null;
  ethInVault: number;
  nftsHeld: number;
  nftsBought: number;
  nftsBurned: number;
  nftsDelivered: number;
};

export type RaffleState = "pending" | "posted" | "requested" | "drawn" | "settled";

export type RaffleRow = {
  id: number;
  collection: string;
  coin: string;
  tokenId: string;
  state: RaffleState;
  winner: string | null;
  postedAt: number;
  drawRound: number;
};

export type Analytics = {
  coins: number;
  graduated: number;
  feesRoutedEth: number;
  ethInVaultsEth: number;
  nftsBought: number;
  nftsBurned: number;
  nftsDelivered: number;
  collectionsWithCoins: number;
};
