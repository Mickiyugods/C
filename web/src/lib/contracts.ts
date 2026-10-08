// Contract addresses come from the environment so the same build can point at a fork, a testnet or mainnet.
// See web/.env.example. Nothing here is a secret.

const addr = (v: string | undefined) => (v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as `0x${string}`) : undefined);

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 4663);

export const contracts = {
  launcher: addr(process.env.NEXT_PUBLIC_LAUNCHER),
  registry: addr(process.env.NEXT_PUBLIC_REGISTRY),
  distributor: addr(process.env.NEXT_PUBLIC_DISTRIBUTOR),
};

/** First block to scan for events. Set it to the block the Launcher was deployed in. */
export const DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? 0);

export const isConfigured = Boolean(contracts.launcher && contracts.registry && contracts.distributor);

// Pons V2 and Seaport on Robinhood Chain. Verified in docs/pons-notes.md.
export const PONS_FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e" as const;
export const SEAPORT = "0x0000000000000068F116a894984e2DB1123eB395" as const;

export const LAUNCH_FEE_WEI = 500_000_000_000_000n; // 0.0005 ETH, re-read on chain at launch time
