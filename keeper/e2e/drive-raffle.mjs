// Advance every existing giveaway on the local fork all the way to Settled, using the keeper tasks and the
// REAL drand network. The pinned draw round lands a little in the future, so this waits for drand to publish
// it (a few minutes). Run in the background:  DEPLOY_BLOCK=<n> node e2e/drive-raffle.mjs
import { readFileSync } from "node:fs";
import { createPublicClient, http, defineChain } from "viem";

const RPC = "http://127.0.0.1:8545";
const dep = JSON.parse(readFileSync(new URL("../../contracts/deployments/4663-local.json", import.meta.url), "utf8"));
const KEEPER = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

Object.assign(process.env, {
  RPC_URL: RPC, CHAIN_ID: "4663", KEEPER_PRIVATE_KEY: KEEPER,
  LAUNCHER: dep.launcher, REGISTRY: dep.registry, DISTRIBUTOR: dep.distributor,
  DEPLOY_BLOCK: process.env.DEPLOY_BLOCK ?? "84863947", INTERVAL_MS: "1000",
});

const { raffles } = await import("../src/tasks/raffles.mjs");
const { fetchSignature, timeOf } = await import("../src/drand.mjs");
const abis = await import("../src/abis.mjs");

const chain = defineChain({ id: 4663, name: "fork", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } }, contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } } });
const pub = createPublicClient({ chain, transport: http(RPC) });
const rpc = (m, p = []) => pub.request({ method: m, params: p });
const say = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const D = dep.distributor;

const raffleOf = (id) => pub.readContract({ address: D, abi: abis.raffleDistributorAbi, functionName: "raffle", args: [BigInt(id)] });
const count = async () => Number(await pub.readContract({ address: D, abi: abis.raffleDistributorAbi, functionName: "raffleCount" }));

const n = await count();
say("driving", n, "raffle(s) to Settled");

for (let guard = 0; guard < 400; guard++) {
  const rs = [];
  for (let id = 1; id <= n; id++) rs.push(await raffleOf(id));
  const states = rs.map((r) => Number(r.state));
  say("states:", states.join(","), "(1 Pending 2 Posted 3 Requested 4 Drawn 5 Settled)");
  if (states.every((s) => s === 5 || s === 0)) { say("ALL SETTLED"); break; }

  // Skip the on-chain 15-minute challenge window for any Posted raffle.
  if (states.includes(2)) { await rpc("evm_increaseTime", [901]); await rpc("evm_mine"); }

  // For Requested raffles, align chain time to the pinned round once drand has published it.
  for (let id = 1; id <= n; id++) {
    if (Number(rs[id - 1].state) !== 3) continue;
    const round = Number(rs[id - 1].drawRound);
    const sig = await fetchSignature(round);
    if (!sig) { say(`raffle ${id}: waiting for drand round ${round}`); continue; }
    const chainNow = Number((await pub.getBlock()).timestamp);
    if (chainNow < timeOf(round)) { await rpc("evm_setNextBlockTimestamp", [timeOf(round) + 1]); await rpc("evm_mine"); }
  }

  await raffles(); // moves each raffle one safe step forward
  await new Promise((r) => setTimeout(r, 8000));
}

const final = [];
for (let id = 1; id <= n; id++) {
  const r = await raffleOf(id);
  final.push(`#${id} state=${Number(r.state)} winner=${r.winner}`);
}
say("done:", final.join(" | "));
process.exit(0);
