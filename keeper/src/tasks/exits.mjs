import { getAbiItem } from "viem";
import { config } from "../config.mjs";
import { vaultAbi } from "../abis.mjs";
import { loadCoins, logsChunked, publicClient, write, log } from "../chain.mjs";

/** Sends every NFT a vault bought to its destination: burned, or handed to the giveaway contract. */
export async function exits() {
  const coins = await loadCoins();
  const vaults = [...new Set(coins.map((c) => c.vault))];
  if (vaults.length === 0) return;

  const bought = await logsChunked((fromBlock, toBlock) =>
    publicClient.getLogs({ address: vaults, event: getAbiItem({ abi: vaultAbi, name: "Bought" }), fromBlock, toBlock }),
  );

  for (const b of bought) {
    const vault = b.address;
    const tokenId = b.args.tokenId;
    const coin = await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "coinOfNft", args: [tokenId] });
    if (coin === "0x0000000000000000000000000000000000000000") continue; // already burned or released

    const info = coins.find((c) => c.coin.toLowerCase() === coin.toLowerCase());
    const fn = info?.policy === "burn" ? "burn" : "release";
    try {
      await write(`${fn} NFT #${tokenId} of ${vault}`, { address: vault, abi: vaultAbi, functionName: fn, args: [tokenId] });
    } catch (e) {
      log(`${fn} #${tokenId} failed: ${(e.shortMessage ?? e.message).split("\n")[0]}`);
    }
  }
}
