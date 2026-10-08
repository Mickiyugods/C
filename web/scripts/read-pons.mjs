import { readFileSync } from "node:fs";
import { createPublicClient, http, formatEther, parseAbi } from "viem";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/).filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const client = createPublicClient({ transport: http(env.ROBINHOOD_RPC_URL) });

const FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";
const abi = parseAbi([
  "function launchFee() view returns (uint256)",
  "function getLaunchConfig(uint256 id) view returns ((uint256 supply, uint256 curveFeeBps, uint256 phantomQuote, uint256 graduationThreshold, uint24 poolFee, int24 tickSpacing, bool enabled))",
  "function feeEscrow() view returns (address)",
  "function owner() view returns (address)",
]);

const read = async (fn, args = []) => {
  try {
    return await client.readContract({ address: FACTORY, abi, functionName: fn, args });
  } catch (e) {
    return `ERR ${e.shortMessage ?? e.message}`.slice(0, 120);
  }
};

console.log("launchFee (ETH):", typeof (await read("launchFee")) === "bigint" ? formatEther(await read("launchFee")) : await read("launchFee"));
console.log("feeEscrow:", await read("feeEscrow"));
console.log("owner:", await read("owner"));
for (let id = 0; id <= 4; id++) {
  const c = await read("getLaunchConfig", [BigInt(id)]);
  if (typeof c === "string") { console.log("config", id, c); continue; }
  console.log("config", id, {
    supply: c.supply.toString(),
    curveFeeBps: c.curveFeeBps.toString(),
    phantomQuote: c.phantomQuote.toString(),
    graduationThreshold: formatEther(c.graduationThreshold) + " (if ETH)",
    poolFee: c.poolFee,
    tickSpacing: c.tickSpacing,
    enabled: c.enabled,
  });
}
