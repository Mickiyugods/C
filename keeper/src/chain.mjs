import { createPublicClient, createWalletClient, defineChain, getAbiItem, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "./config.mjs";
import { launcherAbi } from "./abis.mjs";

export const chain = defineChain({
  id: config.chainId,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});

export const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl, { batch: true }) });
export const account = config.privateKey ? privateKeyToAccount(config.privateKey) : undefined;
export const walletClient = account ? createWalletClient({ account, chain, transport: http(config.rpcUrl) }) : undefined;

export const log = (...a) => console.log(new Date().toISOString(), ...a);

const CHUNK = 200_000n;

/** getLogs over a long range in chunks. */
export async function logsChunked(fetch, from = config.deployBlock, to) {
  const head = to ?? (await publicClient.getBlockNumber());
  const out = [];
  for (let f = from; f <= head; f += CHUNK) {
    const t = f + CHUNK - 1n > head ? head : f + CHUNK - 1n;
    out.push(...(await fetch(f, t)));
  }
  return out;
}

/** Simulates a contract write; sends it unless this is a dry run. Returns the simulation result and tx hash. */
export async function write(label, request) {
  if (!config.dryRun && (!walletClient || !account)) throw new Error("KEEPER_PRIVATE_KEY is not set");
  const sim = await publicClient.simulateContract({ ...request, account });
  if (config.dryRun) {
    log(`[dry run] would ${label}`);
    return { result: sim.result, hash: null };
  }
  const hash = await walletClient.writeContract(sim.request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} reverted on chain (${hash})`);
  log(`${label} -> ${hash}`);
  return { result: sim.result, hash };
}

/** Every coin the Launcher created, with the addresses the tasks need. */
export async function loadCoins() {
  const logs = await logsChunked((fromBlock, toBlock) =>
    publicClient.getLogs({ address: config.launcher, event: getAbiItem({ abi: launcherAbi, name: "CoinLaunched" }), fromBlock, toBlock }),
  );
  return logs.map((l) => ({
    coin: l.args.coin,
    creator: l.args.creator,
    collection: l.args.collection,
    curve: l.args.curve,
    router: l.args.router,
    vault: l.args.vault,
    policy: Number(l.args.policy) === 2 ? "burn" : "airdrop",
    block: l.blockNumber,
  }));
}
