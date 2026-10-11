// End-to-end run of the keeper against a local fork of Robinhood Chain, with the REAL drand network.
//
// Prerequisites: anvil forking Robinhood Chain on :8545 with the contracts deployed by
// contracts/script/Deploy.s.sol using the default anvil accounts (see docs/local-dev.md), and the keeper
// account (anvil #2) set as KEEPER. Then:  node e2e/fork-raffle.mjs
//
// It waits for a real drand round to be published (about 15 minutes), so run it in the background.

import { readFileSync } from "node:fs";
import {
  createPublicClient, createWalletClient, http, parseEther, defineChain, getAbiItem, parseAbi, getAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC = "http://127.0.0.1:8545";
const dep = JSON.parse(readFileSync(new URL("../../contracts/deployments/4663-local.json", import.meta.url), "utf8"));
const KEYS = {
  owner: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  creator: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  keeper: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  alice: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  bob: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  seller: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
};

// The keeper reads its settings from the environment at import time.
Object.assign(process.env, {
  RPC_URL: RPC, CHAIN_ID: "4663", KEEPER_PRIVATE_KEY: KEYS.keeper,
  LAUNCHER: dep.launcher, REGISTRY: dep.registry, DISTRIBUTOR: dep.distributor,
  DEPLOY_BLOCK: process.env.DEPLOY_BLOCK ?? "79289701", INTERVAL_MS: "1000",
});

const { harvest } = await import("../src/tasks/harvest.mjs");
const { market } = await import("../src/tasks/market.mjs");
const { exits } = await import("../src/tasks/exits.mjs");
const { raffles } = await import("../src/tasks/raffles.mjs");
const { normalizeOrder } = await import("../src/market/opensea.mjs");
const { fetchSignature } = await import("../src/drand.mjs");
const abis = await import("../src/abis.mjs");

const chain = defineChain({ id: 4663, name: "fork", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } }, contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } } });
const pub = createPublicClient({ chain, transport: http(RPC) });
const acct = Object.fromEntries(Object.entries(KEYS).map(([k, v]) => [k, privateKeyToAccount(v)]));
const wallet = Object.fromEntries(Object.entries(acct).map(([k, a]) => [k, createWalletClient({ account: a, chain, transport: http(RPC) })]));
const say = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const rpc = (method, params = []) => pub.request({ method, params });
const send = async (who, req) => { const { request } = await pub.simulateContract({ ...req, account: acct[who] }); const h = await wallet[who].writeContract(request); await pub.waitForTransactionReceipt({ hash: h }); return h; };
const assert = (c, m) => { if (!c) { console.error("ASSERTION FAILED:", m); process.exit(1); } say("ok:", m); };

// ---- 1. a collection and a coin
const mockNft = JSON.parse(readFileSync(new URL("../../contracts/out/Vault.t.sol/MockNft.json", import.meta.url), "utf8"));
const deployHash = await wallet.owner.deployContract({ abi: mockNft.abi, bytecode: mockNft.bytecode.object });
const nft = (await pub.waitForTransactionReceipt({ hash: deployHash })).contractAddress;
say("mock NFT collection", nft);
await send("owner", { address: dep.registry, abi: abis.collectionRegistryAbi, functionName: "addCollection", args: [nft] });

const launchFee = await pub.readContract({ address: "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e", abi: parseAbi(["function launchFee() view returns (uint256)"]), functionName: "launchFee" });
await send("creator", {
  address: dep.launcher, abi: abis.launcherAbi, functionName: "launch", value: launchFee,
  args: [{ name: "E2E", symbol: "E2E", logo: "https://example.com/e2e.png", description: "keeper e2e", socials: { twitter: "", telegram: "", discord: "", website: "", farcaster: "" }, collection: nft, policy: 1, creatorTaxBps: 100, salt: "0x" + "ee".repeat(32), devBuy: 0n }],
});
const launched = await pub.getLogs({ address: dep.launcher, event: getAbiItem({ abi: abis.launcherAbi, name: "CoinLaunched" }), fromBlock: BigInt(process.env.DEPLOY_BLOCK ?? "79289701") });
const mine = launched.find((l) => l.args.collection.toLowerCase() === nft.toLowerCase()).args;
say("coin", mine.coin, "curve", mine.curve);

// ---- 2. two holders trade
await rpc("evm_increaseTime", [60]); await rpc("evm_mine");
const buy = (who, eth) => send(who, { address: mine.curve, abi: parseAbi(["function buy(uint256,uint256,address) payable returns (uint256)"]), functionName: "buy", args: [parseEther(eth), 0n, acct[who].address], value: parseEther(eth) });
await buy("alice", "1"); await buy("bob", "0.5");
const bal = (a) => pub.readContract({ address: mine.coin, abi: abis.erc20Abi, functionName: "balanceOf", args: [a] });
const [balA, balB] = [await bal(acct.alice.address), await bal(acct.bob.address)];
say("balances alice", balA, "bob", balB);

// ---- 3. keeper: harvest
await harvest();
const vaultBal = await pub.readContract({ address: mine.vault, abi: abis.vaultAbi, functionName: "balanceOf", args: [mine.coin] });
assert(vaultBal > parseEther("0.02"), `harvest funded the vault (${vaultBal} wei)`);

// ---- 4. a seller lists an NFT; keeper posts the cap and buys it through real Seaport
const SEAPORT = "0x0000000000000068F116a894984e2DB1123eB395";
await send("owner", { address: nft, abi: mockNft.abi, functionName: "mint", args: [acct.seller.address, 1n] });
await send("seller", { address: nft, abi: mockNft.abi, functionName: "setApprovalForAll", args: [SEAPORT, true] });
const ZERO = "0x0000000000000000000000000000000000000000";
const feeTo = "0x000000000000000000000000000000000000f00d";
const offer = [{ itemType: 2, token: nft, identifierOrCriteria: 1n, startAmount: 1n, endAmount: 1n }];
const consideration = [
  { itemType: 0, token: ZERO, identifierOrCriteria: 0n, startAmount: parseEther("0.005"), endAmount: parseEther("0.005"), recipient: acct.seller.address },
  { itemType: 0, token: ZERO, identifierOrCriteria: 0n, startAmount: parseEther("0.0005"), endAmount: parseEther("0.0005"), recipient: feeTo },
];
const now = Number((await pub.getBlock()).timestamp);
const params = { offerer: acct.seller.address, zone: ZERO, offer, consideration, orderType: 0, startTime: 0n, endTime: BigInt(now + 7 * 86400), zoneHash: "0x" + "00".repeat(32), salt: 99n, conduitKey: "0x" + "00".repeat(32), counter: 0n };
const types = {
  OrderComponents: [
    { name: "offerer", type: "address" }, { name: "zone", type: "address" }, { name: "offer", type: "OfferItem[]" },
    { name: "consideration", type: "ConsiderationItem[]" }, { name: "orderType", type: "uint8" }, { name: "startTime", type: "uint256" },
    { name: "endTime", type: "uint256" }, { name: "zoneHash", type: "bytes32" }, { name: "salt", type: "uint256" },
    { name: "conduitKey", type: "bytes32" }, { name: "counter", type: "uint256" },
  ],
  OfferItem: [{ name: "itemType", type: "uint8" }, { name: "token", type: "address" }, { name: "identifierOrCriteria", type: "uint256" }, { name: "startAmount", type: "uint256" }, { name: "endAmount", type: "uint256" }],
  ConsiderationItem: [{ name: "itemType", type: "uint8" }, { name: "token", type: "address" }, { name: "identifierOrCriteria", type: "uint256" }, { name: "startAmount", type: "uint256" }, { name: "endAmount", type: "uint256" }, { name: "recipient", type: "address" }],
};
const signature = await acct.seller.signTypedData({ domain: { name: "Seaport", version: "1.6", chainId: 4663, verifyingContract: SEAPORT }, types, primaryType: "OrderComponents", message: params });

// shape it like the OpenSea API so the keeper's own normalizer is exercised
const asApi = {
  order_hash: "0x00",
  protocol_data: {
    signature,
    parameters: {
      ...params, orderType: 0, startTime: "0", endTime: String(params.endTime), salt: "99", totalOriginalConsiderationItems: 2,
      offer: offer.map((o) => ({ ...o, identifierOrCriteria: String(o.identifierOrCriteria), startAmount: "1", endAmount: "1" })),
      consideration: consideration.map((c) => ({ ...c, identifierOrCriteria: "0", startAmount: String(c.startAmount), endAmount: String(c.endAmount) })),
    },
  },
};
const listing = normalizeOrder(asApi, nft);
assert(listing && listing.price === parseEther("0.0055"), "the keeper's normalizer accepts the signed listing");
const fakeSource = { listingsFor: async (collection) => (collection.toLowerCase() === nft.toLowerCase() ? [listing] : []) };
await market(fakeSource);
const owner1 = await pub.readContract({ address: nft, abi: mockNft.abi, functionName: "ownerOf", args: [1n] });
assert(owner1.toLowerCase() === mine.vault.toLowerCase(), "the vault bought the NFT through real Seaport");

// ---- 5. keeper: release to the raffle, post the snapshot
await exits();
const raffleCount = Number(await pub.readContract({ address: dep.distributor, abi: abis.raffleDistributorAbi, functionName: "raffleCount" }));
const raffleId = BigInt(raffleCount);
assert((await pub.readContract({ address: nft, abi: mockNft.abi, functionName: "ownerOf", args: [1n] })).toLowerCase() === dep.distributor.toLowerCase(), "the NFT reached the raffle contract");
if (process.env.DEMO_ONLY) { say('DEMO state ready: coin launched, traded, harvested, NFT bought and sent to the giveaway.'); process.exit(0); }
await raffles(); // Pending -> Posted
const state = async () => Number((await pub.readContract({ address: dep.distributor, abi: abis.raffleDistributorAbi, functionName: "raffle", args: [raffleId] })).state);
assert((await state()) === 2, "snapshot posted (state Posted)");

// ---- 6. skip the 15 minute challenge window, request the draw
await rpc("evm_increaseTime", [901]); await rpc("evm_mine");
await raffles(); // Posted -> Requested
assert((await state()) === 3, "draw requested (state Requested)");
const drawRound = Number((await pub.readContract({ address: dep.distributor, abi: abis.raffleDistributorAbi, functionName: "raffle", args: [raffleId] })).drawRound);
say("pinned drand round", drawRound, "- waiting for the network to publish it");

// ---- 7. wait for the real beacon
for (;;) {
  const sig = await fetchSignature(drawRound);
  if (sig) break;
  await new Promise((r) => setTimeout(r, 15_000));
}
say("drand published the round");

// the chain must also have reached the round time
const { timeOf } = await import("../src/drand.mjs");
const chainNow = Number((await pub.getBlock()).timestamp);
if (chainNow < timeOf(drawRound)) { await rpc("evm_setNextBlockTimestamp", [timeOf(drawRound) + 1]); await rpc("evm_mine"); }

await raffles(); // Requested -> Drawn (real BLS verification on chain)
assert((await state()) === 4, "draw verified on chain with a real drand signature (state Drawn)");
await raffles(); // Drawn -> Settled
assert((await state()) === 5, "raffle settled (state Settled)");

const winner = getAddress(await pub.readContract({ address: nft, abi: mockNft.abi, functionName: "ownerOf", args: [1n] }));
assert([acct.alice.address, acct.bob.address].includes(winner), `the NFT went to a real holder of the coin (${winner})`);
say("E2E PASSED. Winner:", winner === acct.alice.address ? "alice" : "bob");
