# Curato

**Launch coins that curate NFT floors.**

Curato is a memecoin launchpad on **Robinhood Chain** where every coin is paired with one NFT collection. A share of each coin's trading fees is spent buying that collection's floor, and every NFT is either raffled to the coin's holders or burned. Coins are created on **Pons**; Curato adds the pairing, the vaults, and the giveaways.

No wallet takes a cut — the fee split is a constant in the contract's bytecode, with no owner and no upgrade path.

## How it works

1. **Launch** — a creator picks a name, symbol, image, one collection, an NFT policy and a creator tax, then sends one transaction (optionally buying some of their own coin in it). The Launcher creates the coin on Pons and a fee router bound to it.
2. **Trade** — people trade the coin on its Pons bonding curve. Each trade earns creator fees.
3. **Harvest** — anyone can call harvest on the coin's router. It pulls the fees out of Pons and splits them 80% to the collection vault and 20% to the treasury.
4. **Sweep** — the keeper makes the vault buy the cheapest listed NFT of its collection, within a price cap, through real Seaport.
5. **Deliver** — depending on the policy, the NFT is burned, or raffled to one holder — picked by a verifiable drand beacon and sent straight to their wallet, nothing to claim.

## Fees

- **1% curve fee** per trade (70% to the coin's router, 30% to Pons), plus a **creator tax** the creator chooses (0–10%).
- The router splits everything it receives **80% to the collection vault / 20% to the treasury** — a constant in the bytecode that cannot be changed.
- Launching costs Pons's launch fee (~0.0005 ETH) plus gas.
- At **4.2 ETH** of curve liquidity a coin graduates to a locked Uniswap v4 pool, and fees keep routing to the same router.

## Giveaways

For **Airdrop**-policy coins, each NFT the vault buys is raffled to one holder:

- Odds follow balance (bigger bag, better odds), from a snapshot of who held how much when the NFT arrived.
- Randomness comes from the **drand** quicknet beacon and is verified **on-chain** (BLS12-381) — nobody can predict or choose the winner.
- The winner receives the NFT in their wallet automatically — nothing to claim.
- Posting the snapshot is the keeper's only role; pinning the round, submitting the signature and delivering the NFT are permissionless.

For **Burn**-policy coins, every bought NFT is sent to a dead address, shrinking the collection's supply.

## Vaults

- One vault per collection, shared by all coins paired with it, but each coin has its own balance inside it.
- A vault can only send ETH to Seaport for a floor purchase — there is no withdraw function, so nobody (not even the team) can take the funds.
- Purchases are capped: a price cap posted by the keeper (may rise at most 10%/hour, expires after 2 days), a daily spending limit, and an on-chain check after every buy that exactly the price left and the NFT arrived.

## Repository

```
contracts/  Solidity (Foundry): registry, launcher, fee router, vault, giveaway distributor, drand verifier
web/        Next.js 16 site: explore, launch wizard, coin pages, collections, gallery, giveaways, analytics, docs, profile
keeper/     Node bot: harvests fees, posts price caps, buys NFTs via Seaport, runs giveaways
docs/       Notes: Pons findings, contract design, local development, deployment checklist
```

## Tech stack

- **Web** — Next.js 16 (App Router, server components, force-dynamic), Tailwind CSS v4, [viem](https://viem.sh), [lightweight-charts](https://www.tradingview.com/lightweight-charts/). Reads everything from the chain; no database.
- **Contracts** — Solidity + [Foundry](https://getfoundry.sh) (unit, fuzz, and fork tests against the live Pons factory and Seaport 1.6).
- **Keeper** — Node 20 + viem, with the real drand beacon for giveaway randomness.

## Run it locally

Everything runs against a local fork of Robinhood Chain — free, no real funds. You need Foundry (`forge`, `anvil`, `cast`) and Node 20+. Full walkthrough in **[docs/local-dev.md](docs/local-dev.md)**; in short:

```bash
# 1. fork the chain (use a private RPC; chain id must stay 4663)
anvil --fork-url "$ROBINHOOD_RPC_URL" --port 8545 --chain-id 4663

# 2. deploy the contracts (default anvil accounts)
cd contracts
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# 3. run the site (copy web/.env.example to web/.env.local and fill it in first)
cd ../web && npm install && npm run dev
```

## Status

- **Contracts** — written and tested (unit, fuzz, and fork). **Unaudited.** Not deployed anywhere except local forks.
- **Website** — complete for the flows above; reads everything from the chain.
- **Keeper** — tested end to end on a fork with the real drand network.

## Learn more

- [docs/local-dev.md](docs/local-dev.md) — run everything on your machine for free.
- [docs/contracts.md](docs/contracts.md) — how the pieces fit and what you have to trust.
- [docs/deployment-checklist.md](docs/deployment-checklist.md) — before putting real money anywhere near it.

## Disclaimer

Nothing here is financial advice. Coins and NFTs can lose all of their value, and smart contracts can contain bugs that cannot be fixed after deployment. Curato is not affiliated with Robinhood Markets, Pons, Seaport or OpenSea.
