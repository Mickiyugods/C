// Browser-side transaction helpers. They talk to the user's wallet (window.ethereum) and never see a key.

import { createPublicClient, createWalletClient, custom, defineChain, parseEventLogs, type Address } from "viem";
import { launcherAbi, feeRouterAbi, ponsCurveAbi, erc20Abi } from "./abis";
import { CHAIN_ID, contracts, PONS_FACTORY } from "./contracts";
import { getActiveProvider } from "./eip1193";

const MAX_UINT = 2n ** 256n - 1n;

const chain = defineChain({
  id: CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
});

function clients() {
  const provider = getActiveProvider();
  if (!provider) throw new Error("No wallet connected.");
  const transport = custom(provider as Parameters<typeof custom>[0]);
  return {
    publicClient: createPublicClient({ chain, transport }),
    walletClient: createWalletClient({ chain, transport }),
  };
}

export async function ethBalance(addr: Address): Promise<bigint> {
  const { publicClient } = clients();
  return publicClient.getBalance({ address: addr });
}

const ponsFactoryAbi = [
  { type: "function", name: "launchFee", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

const friendly: Record<string, string> = {
  NotListed: "That collection is not in the registry.",
  WrongPolicy: "Choose what happens to the NFTs (Burn or Airdrop).",
  TaxTooHigh: "Creator tax is above the protocol cap.",
  LaunchFeeTooLow: "The launch fee changed. Try again.",
  RefundFailed: "Your wallet could not receive the refund of the extra ETH.",
};

export function explainError(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string; cause?: { data?: { errorName?: string }; reason?: string } };
  const name = err.cause?.data?.errorName;
  if (name && friendly[name]) return friendly[name];
  if (/User rejected|denied/i.test(err.shortMessage ?? err.message ?? "")) return "You rejected the request in your wallet.";
  return err.shortMessage ?? err.message ?? "Something went wrong.";
}

export type LaunchArgs = {
  account: Address;
  name: string;
  symbol: string;
  logo: string;
  description: string;
  website: string;
  twitter: string;
  telegram: string;
  collection: Address;
  policy: "airdrop" | "burn";
  creatorTaxBps: number;
};

export type LaunchResult = { hash: `0x${string}`; coin: Address; router: Address; vault: Address; curve: Address };

export async function launchCoin(a: LaunchArgs, onStatus?: (s: "simulating" | "confirm" | "mining") => void): Promise<LaunchResult> {
  const launcher = contracts.launcher;
  if (!launcher) throw new Error("The Launcher contract is not configured.");
  const { publicClient, walletClient } = clients();

  const fee = await publicClient.readContract({ address: PONS_FACTORY, abi: ponsFactoryAbi, functionName: "launchFee" });
  const value = fee + fee / 10n; // the Launcher refunds whatever is above the fee

  const salt = ("0x" + Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
  const input = {
    name: a.name,
    symbol: a.symbol,
    logo: a.logo,
    description: a.description,
    socials: { twitter: a.twitter, telegram: a.telegram, discord: "", website: a.website, farcaster: "" },
    collection: a.collection,
    policy: a.policy === "airdrop" ? 1 : 2,
    creatorTaxBps: a.creatorTaxBps,
    salt,
  } as const;

  onStatus?.("simulating");
  const { request } = await publicClient.simulateContract({
    address: launcher,
    abi: launcherAbi,
    functionName: "launch",
    args: [input],
    value,
    account: a.account,
  });

  onStatus?.("confirm");
  const hash = await walletClient.writeContract(request);

  onStatus?.("mining");
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("The transaction failed on chain.");

  const events = parseEventLogs({ abi: launcherAbi, eventName: "CoinLaunched", logs: receipt.logs });
  const e = events[0]?.args;
  if (!e) throw new Error("Launched, but the CoinLaunched event was not found.");
  return { hash, coin: e.coin as Address, router: e.router as Address, vault: e.vault as Address, curve: e.curve as Address };
}

export type TradeStatus = "simulating" | "approve" | "confirm" | "mining";

/** The connected wallet's balance of `coin`, in wei. */
export async function tokenBalance(coin: Address, account: Address): Promise<bigint> {
  const { publicClient } = clients();
  return publicClient.readContract({ address: coin, abi: erc20Abi, functionName: "balanceOf", args: [account] });
}

/** Buy `coin` by spending `ethIn` ETH on its Pons curve. Slippage is a fraction, e.g. 0.1 for 10%. */
export async function buyCoin(
  curve: Address,
  coin: Address,
  ethIn: bigint,
  account: Address,
  slippage: number,
  onStatus?: (s: TradeStatus) => void,
): Promise<`0x${string}`> {
  const { publicClient, walletClient } = clients();
  onStatus?.("simulating");
  // First pass with no minimum tells us the expected tokens out, so we can set a real slippage floor.
  const { result: expected } = await publicClient.simulateContract({
    address: curve,
    abi: ponsCurveAbi,
    functionName: "buy",
    args: [ethIn, 0n, account],
    value: ethIn,
    account,
  });
  const minOut = (expected * BigInt(Math.round((1 - slippage) * 1e4))) / 10_000n;
  const { request } = await publicClient.simulateContract({
    address: curve,
    abi: ponsCurveAbi,
    functionName: "buy",
    args: [ethIn, minOut, account],
    value: ethIn,
    account,
  });
  onStatus?.("confirm");
  const hash = await walletClient.writeContract(request);
  onStatus?.("mining");
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("The transaction failed on chain.");
  void coin;
  return hash;
}

/** Sell `tokensIn` of `coin` back to its curve. Approves the curve to pull the tokens if needed. */
export async function sellCoin(
  curve: Address,
  coin: Address,
  tokensIn: bigint,
  account: Address,
  slippage: number,
  onStatus?: (s: TradeStatus) => void,
): Promise<`0x${string}`> {
  const { publicClient, walletClient } = clients();

  const allowance = await publicClient.readContract({ address: coin, abi: erc20Abi, functionName: "allowance", args: [account, curve] });
  if (allowance < tokensIn) {
    onStatus?.("approve");
    const { request: approveReq } = await publicClient.simulateContract({
      address: coin,
      abi: erc20Abi,
      functionName: "approve",
      args: [curve, MAX_UINT],
      account,
    });
    const approveHash = await walletClient.writeContract(approveReq);
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
  }

  onStatus?.("simulating");
  const { result: expected } = await publicClient.simulateContract({
    address: curve,
    abi: ponsCurveAbi,
    functionName: "sell",
    args: [tokensIn, 0n, account],
    account,
  });
  const minOut = (expected * BigInt(Math.round((1 - slippage) * 1e4))) / 10_000n;
  const { request } = await publicClient.simulateContract({
    address: curve,
    abi: ponsCurveAbi,
    functionName: "sell",
    args: [tokensIn, minOut, account],
    account,
  });
  onStatus?.("confirm");
  const hash = await walletClient.writeContract(request);
  onStatus?.("mining");
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("The transaction failed on chain.");
  return hash;
}

export async function harvest(router: Address, account: Address): Promise<`0x${string}`> {
  const { publicClient, walletClient } = clients();
  const { request } = await publicClient.simulateContract({ address: router, abi: feeRouterAbi, functionName: "harvest", account });
  const hash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
