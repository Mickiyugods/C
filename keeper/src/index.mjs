import { config } from "./config.mjs";
import { account, log, publicClient } from "./chain.mjs";
import { harvest } from "./tasks/harvest.mjs";
import { market } from "./tasks/market.mjs";
import { exits } from "./tasks/exits.mjs";
import { raffles } from "./tasks/raffles.mjs";

const tasks = [
  ["harvest", harvest],
  ["market", market],
  ["exits", exits],
  ["raffles", raffles],
];

async function tick() {
  for (const [name, run] of tasks) {
    try {
      await run();
    } catch (e) {
      log(`${name} failed: ${(e.shortMessage ?? e.message).split("\n")[0]}`);
    }
  }
}

log(`keeper starting on chain ${await publicClient.getChainId()} as ${account?.address ?? "(read only, no key)"}${config.dryRun ? " [dry run]" : ""}`);
if (!account && !config.dryRun) {
  log("No KEEPER_PRIVATE_KEY: running read only. Transactions will be skipped.");
  config.dryRun = true;
}

do {
  await tick();
  if (config.once) break;
  await new Promise((r) => setTimeout(r, config.intervalMs));
} while (true);
