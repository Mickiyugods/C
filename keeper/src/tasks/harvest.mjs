import { formatEther } from "viem";
import { config } from "../config.mjs";
import { feeRouterAbi } from "../abis.mjs";
import { loadCoins, publicClient, write, log } from "../chain.mjs";

/** Pulls each coin's accrued creator fees out of Pons and splits them 80/20, when it is worth the gas. */
export async function harvest() {
  const coins = await loadCoins();
  for (const c of coins) {
    try {
      // The simulation returns how much the router would receive.
      const { result } = await publicClient.simulateContract({ address: c.router, abi: feeRouterAbi, functionName: "harvest" });
      if (result < config.minHarvestWei) continue;
      await write(`harvest ${c.coin} (${formatEther(result)} ETH)`, { address: c.router, abi: feeRouterAbi, functionName: "harvest" });
    } catch (e) {
      log(`harvest ${c.coin} skipped: ${(e.shortMessage ?? e.message).split("\n")[0]}`);
    }
  }
}
