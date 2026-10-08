import { readFileSync, existsSync } from "node:fs";

// Loads KEY=VALUE pairs from keeper/.env if it exists, without overriding real environment variables.
const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

const need = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}. Copy keeper/.env.example to keeper/.env and fill it in.`);
  return v;
};

const args = new Set(process.argv.slice(2));

export const config = {
  rpcUrl: need("RPC_URL"),
  chainId: Number(process.env.CHAIN_ID ?? 4663),
  privateKey: process.env.KEEPER_PRIVATE_KEY || undefined,
  launcher: need("LAUNCHER"),
  registry: need("REGISTRY"),
  distributor: need("DISTRIBUTOR"),
  deployBlock: BigInt(process.env.DEPLOY_BLOCK ?? 0),

  openSeaKey: process.env.OPENSEA_API_KEY || undefined,
  openSeaChain: process.env.OPENSEA_CHAIN ?? "robinhood",

  /** Price cap = cheapest listing plus this margin, so a small move in the floor does not stall buying. */
  capMarginBps: BigInt(process.env.CAP_MARGIN_BPS ?? 1500),
  /** Do not spend gas harvesting less than this. */
  minHarvestWei: BigInt(process.env.MIN_HARVEST_WEI ?? 500_000_000_000_000), // 0.0005 ETH
  /** Re-post an unchanged cap before it can expire (the vault ignores caps older than 2 days). */
  capRefreshSeconds: Number(process.env.CAP_REFRESH_SECONDS ?? 12 * 3600),
  maxBuysPerTick: Number(process.env.MAX_BUYS_PER_TICK ?? 3),

  intervalMs: Number(process.env.INTERVAL_MS ?? 60_000),
  once: args.has("--once"),
  dryRun: args.has("--dry-run") || process.env.DRY_RUN === "1",
};

// Pons V2 and Seaport 1.6 on Robinhood Chain. These hold coin balances but must never win a giveaway.
export const PONS = {
  factory: "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e",
  escrow: "0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e",
  hook: "0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044",
  buybackVault: "0x42df2a798f82289E177311362e8f5ccC45c1219c",
  locker: "0x267444D099b10fB5Ed7c3Cc7B7c767AdcA574952",
};
