import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseAbi, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Lists the Robinhood Chain collections from src/data/onchain.json in the CollectionRegistry.
// Only the registry owner can do this. By default it only prints what it would do.
//
//   REGISTRY=0x... RPC_URL=... node scripts/register-collections.mjs             (dry run)
//   REGISTRY=0x... RPC_URL=... PRIVATE_KEY=0x... node scripts/register-collections.mjs --execute
//
// Optional: LIMIT=20 to list only the first 20 (the file is ordered with the best known collections first).

const registry = process.env.REGISTRY;
const rpc = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const execute = process.argv.includes("--execute");
const limit = Number(process.env.LIMIT ?? Infinity);
if (!registry) throw new Error("Set REGISTRY to the CollectionRegistry address.");

const abi = parseAbi([
  "function addCollection(address collection)",
  "function isListed(address collection) view returns (bool)",
  "function owner() view returns (address)",
]);

const chain = defineChain({ id: Number(process.env.CHAIN_ID ?? 4663), name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const publicClient = createPublicClient({ chain, transport: http(rpc) });

const rows = JSON.parse(readFileSync(new URL("../src/data/onchain.json", import.meta.url), "utf8"))
  .filter((r) => (r.chain ?? "robinhood") === "robinhood")
  .slice(0, limit);

const owner = await publicClient.readContract({ address: registry, abi, functionName: "owner" });
console.log("registry owner:", owner, execute ? "(executing)" : "(dry run)");

let account, wallet;
if (execute) {
  if (!process.env.PRIVATE_KEY) throw new Error("Set PRIVATE_KEY to the registry owner key for --execute.");
  account = privateKeyToAccount(process.env.PRIVATE_KEY);
  if (account.address.toLowerCase() !== owner.toLowerCase()) throw new Error(`That key is ${account.address}, not the owner.`);
  wallet = createWalletClient({ account, chain, transport: http(rpc) });
}

let added = 0, skipped = 0, failed = 0;
for (const r of rows) {
  const listed = await publicClient.readContract({ address: registry, abi, functionName: "isListed", args: [r.address] });
  if (listed) { skipped++; continue; }
  try {
    await publicClient.simulateContract({ address: registry, abi, functionName: "addCollection", args: [r.address], account: owner });
    if (execute) {
      const hash = await wallet.writeContract({ address: registry, abi, functionName: "addCollection", args: [r.address] });
      await publicClient.waitForTransactionReceipt({ hash });
    }
    added++;
    console.log(execute ? "listed" : "would list", r.name, r.address);
  } catch (e) {
    failed++;
    console.log("cannot list", r.name, r.address, "-", (e.shortMessage ?? e.message).split("\n")[0]);
  }
}
console.log(`${execute ? "added" : "would add"} ${added}, already listed ${skipped}, not listable ${failed}`);
