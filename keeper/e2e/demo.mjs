// Launch one demo coin on the local anvil fork and trade it, so the website has real data to render.
// Prereqs: anvil on :8545 with contracts deployed (docs/local-dev.md). Run: node e2e/demo.mjs
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseEther, defineChain, getAbiItem, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC = "http://127.0.0.1:8545";
const dep = JSON.parse(readFileSync(new URL("../../contracts/deployments/4663-local.json", import.meta.url), "utf8"));
const abis = await import("../src/abis.mjs");

const KEYS = {
  owner: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  creator: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  alice: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  bob: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
};
const COLLECTION = "0x6dc3f3abf0945958be19b02f86be257c4a05fcf2"; // Cash Cats Brokers (real, from onchain.json)

const chain = defineChain({ id: 4663, name: "fork", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } }, contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } } });
const pub = createPublicClient({ chain, transport: http(RPC) });
const acct = Object.fromEntries(Object.entries(KEYS).map(([k, v]) => [k, privateKeyToAccount(v)]));
const wallet = Object.fromEntries(Object.entries(acct).map(([k, a]) => [k, createWalletClient({ account: a, chain, transport: http(RPC) })]));
const say = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const rpc = (method, params = []) => pub.request({ method, params });
const send = async (who, req) => { const { request } = await pub.simulateContract({ ...req, account: acct[who] }); const h = await wallet[who].writeContract(request); await pub.waitForTransactionReceipt({ hash: h }); return h; };
const wait = async (s) => { await rpc("evm_increaseTime", [s]); await rpc("evm_mine"); };

// 1. list the collection
const listed = await pub.readContract({ address: dep.registry, abi: abis.collectionRegistryAbi, functionName: "isListed", args: [COLLECTION] });
if (!listed) { await send("owner", { address: dep.registry, abi: abis.collectionRegistryAbi, functionName: "addCollection", args: [COLLECTION] }); say("listed collection", COLLECTION); }
else say("collection already listed");

// 2. launch a coin that curates it
const launchFee = await pub.readContract({ address: "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e", abi: parseAbi(["function launchFee() view returns (uint256)"]), functionName: "launchFee" });
const fromBlock = BigInt(process.env.DEPLOY_BLOCK ?? "82599583");
await send("creator", {
  address: dep.launcher, abi: abis.launcherAbi, functionName: "launch", value: launchFee,
  args: [{ name: "Cash Cats", symbol: "CCATS", logo: "https://gateway.pinata.cloud/ipfs/bafybeigca2wgv7q22i3cdw4nvgjeuzqt3ra66o6duk6tezk6l3heaimtau", description: "A coin that curates the Cash Cats Brokers collection. Fees route 80% to the vault, 20% to the treasury.", socials: { twitter: "cashcats", telegram: "cashcats", discord: "", website: "https://cashcats.example", farcaster: "" }, collection: COLLECTION, policy: 1, creatorTaxBps: 100, salt: "0x" + "ca".repeat(32) }],
});
const launched = await pub.getLogs({ address: dep.launcher, event: getAbiItem({ abi: abis.launcherAbi, name: "CoinLaunched" }), fromBlock });
const mine = launched.find((l) => l.args.collection.toLowerCase() === COLLECTION.toLowerCase()).args;
say("COIN", mine.coin, "curve", mine.curve, "vault", mine.vault);

// prove the dev buy: the creator should already hold tokens from the launch tx
const creatorBal = await pub.readContract({ address: mine.coin, abi: abis.erc20Abi, functionName: "balanceOf", args: [acct.creator.address] });
say("creator (dev) balance after launch:", (Number(creatorBal) / 1e18).toLocaleString(), "CCATS");

// 3. trade it over time so the chart has several candles
const buy = (who, eth) => send(who, { address: mine.curve, abi: parseAbi(["function buy(uint256,uint256,address) payable returns (uint256)"]), functionName: "buy", args: [parseEther(eth), 0n, acct[who].address], value: parseEther(eth) });
const plan = [["alice", "0.9"], ["bob", "0.35"], ["alice", "0.6"], ["bob", "0.8"], ["alice", "0.25"], ["bob", "0.5"]];
for (const [who, eth] of plan) { await buy(who, eth); say("buy", who, eth, "ETH"); await wait(90 + Math.floor(Math.random() * 180)); }

// one sell to show the other side (approve the curve to pull the tokens first)
const bal = await pub.readContract({ address: mine.coin, abi: abis.erc20Abi, functionName: "balanceOf", args: [acct.alice.address] });
const sellAmt = bal / 4n;
await send("alice", { address: mine.coin, abi: parseAbi(["function approve(address,uint256) returns (bool)"]), functionName: "approve", args: [mine.curve, sellAmt] });
await send("alice", { address: mine.curve, abi: parseAbi(["function sell(uint256,uint256,address) returns (uint256)"]), functionName: "sell", args: [sellAmt, 0n, acct.alice.address] });
say("sell alice", sellAmt.toString(), "tokens");

say("DONE. Coin page: /coin/" + mine.coin);
