import { getAbiItem } from "viem";
import { config, PONS } from "../config.mjs";
import { raffleDistributorAbi, erc20Abi } from "../abis.mjs";
import { loadCoins, logsChunked, publicClient, write, log } from "../chain.mjs";
import { buildSnapshot, winnerOf } from "../snapshot.mjs";
import { fetchSignature, roundAt } from "../drand.mjs";

const STATE = { None: 0, Pending: 1, Posted: 2, Requested: 3, Drawn: 4, Settled: 5 };
const CHALLENGE_WINDOW = 15 * 60;

/** Who held how much of `coin` at `block`, as a deterministic snapshot anyone can recompute. */
export async function snapshotAt(coinInfo, block) {
  const transfers = await logsChunked(
    (fromBlock, toBlock) =>
      publicClient.getLogs({ address: coinInfo.coin, event: getAbiItem({ abi: erc20Abi, name: "Transfer" }), fromBlock, toBlock }),
    coinInfo.block,
    block,
  );
  const exclude = [
    coinInfo.coin,
    coinInfo.curve,
    coinInfo.router,
    coinInfo.vault,
    config.distributor,
    config.launcher,
    ...Object.values(PONS),
  ];
  return buildSnapshot(
    transfers.map((l) => ({ from: l.args.from, to: l.args.to, value: l.args.value })),
    exclude,
  );
}

/** Moves every giveaway one step forward when it can. Each step is safe to repeat: the contract rejects stale calls. */
export async function raffles() {
  const count = Number(await publicClient.readContract({ address: config.distributor, abi: raffleDistributorAbi, functionName: "raffleCount" }));
  if (count === 0) return;
  const coins = await loadCoins();
  const block = await publicClient.getBlock();
  const now = Number(block.timestamp);

  for (let id = 1; id <= count; id++) {
    const r = await publicClient.readContract({ address: config.distributor, abi: raffleDistributorAbi, functionName: "raffle", args: [BigInt(id)] });
    const state = Number(r.state);
    if (state === STATE.Settled || state === STATE.None) continue;

    try {
      if (state === STATE.Pending) {
        const info = coins.find((c) => c.coin.toLowerCase() === r.coin.toLowerCase());
        if (!info) { log(`raffle ${id}: coin ${r.coin} is not a Curato coin`); continue; }
        const snap = await snapshotAt(info, r.arrivedBlock);
        log(`raffle ${id}: snapshot of ${snap.holders.length} holders, total weight ${snap.totalWeight}, root ${snap.root}`);
        await write(`post snapshot for raffle ${id}`, {
          address: config.distributor, abi: raffleDistributorAbi, functionName: "postSnapshot", args: [BigInt(id), snap.root, snap.totalWeight],
        });
      } else if (state === STATE.Posted) {
        if (now >= Number(r.postedAt) + CHALLENGE_WINDOW) {
          await write(`request draw for raffle ${id}`, { address: config.distributor, abi: raffleDistributorAbi, functionName: "requestDraw", args: [BigInt(id)] });
        }
      } else if (state === STATE.Requested) {
        const sig = await fetchSignature(Number(r.drawRound));
        if (!sig) { log(`raffle ${id}: drand round ${r.drawRound} is not published yet`); continue; }
        await write(`submit draw for raffle ${id}`, { address: config.distributor, abi: raffleDistributorAbi, functionName: "submitDraw", args: [BigInt(id), sig] });
      } else if (state === STATE.Drawn) {
        const info = coins.find((c) => c.coin.toLowerCase() === r.coin.toLowerCase());
        const snap = await snapshotAt(info, r.arrivedBlock);
        if (snap.root !== r.root) { log(`raffle ${id}: the posted root differs from the rebuilt snapshot, not settling`); continue; }
        const ticket = await publicClient.readContract({ address: config.distributor, abi: raffleDistributorAbi, functionName: "ticketOf", args: [BigInt(id)] });
        const w = winnerOf(snap, ticket);
        await write(`settle raffle ${id} for ${w.holder}`, {
          address: config.distributor, abi: raffleDistributorAbi, functionName: "settle",
          args: [BigInt(id), BigInt(w.index), w.holder, w.start, w.end, w.proof],
        });
      }
    } catch (e) {
      log(`raffle ${id} (state ${state}) failed: ${(e.shortMessage ?? e.message).split("\n")[0]}`);
    }
  }
}

export { roundAt };
