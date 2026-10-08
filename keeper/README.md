# Curato keeper

A small Node bot that keeps Curato moving. It has no power to move funds. The contracts let it post a price cap,
choose which listing a vault buys (within that cap) and post a giveaway snapshot. Everything else it does (harvest,
burn, release, draw, settle) is a call that anyone may make.

## What it does each tick

| Task | What | Needs |
|---|---|---|
| `harvest` | Calls `router.harvest()` for every coin once at least `MIN_HARVEST_WEI` is waiting | RPC |
| `market` | Posts a fresh vault price cap (cheapest listing + margin, within the vault's own limits) and buys the cheapest listings the vault can afford | OpenSea API key |
| `exits` | Sends each bought NFT to `burn` or `release` according to its coin's policy | RPC |
| `raffles` | Runs every giveaway: posts the holder snapshot, requests the draw, submits the verified drand signature, settles | RPC, drand |

Without `OPENSEA_API_KEY` the `market` task is skipped and the rest keeps working.

## Setup

```bash
cd keeper
npm install
cp .env.example .env     # then fill it in
npm run dry              # one tick, simulates everything, sends nothing
npm run once             # one real tick
npm start                # loop forever (INTERVAL_MS between ticks)
```

`KEEPER_PRIVATE_KEY` must be the wallet you passed as `KEEPER` when deploying (it is stored in the
CollectionRegistry). Give it a little ETH for gas and nothing else. If it leaks, the registry owner calls
`setKeeper` with a new address (or `address(0)` to halt buying everywhere).

## How the giveaway snapshot works

The contract cannot look up past balances, so for each NFT the keeper rebuilds who held how much of the coin at the
block the NFT arrived (`raffle.arrivedBlock`, the L2 block number):

1. read every `Transfer` of the coin up to that block,
2. add up balances and drop addresses that must never win (the bonding curve, Pons contracts, the router, the vault,
   the Launcher, the distributor, the zero and dead addresses),
3. sort holders by address and tile their balances into weight ranges `[start, end)`,
4. build a Merkle tree of the ranges and post the root.

The result is deterministic, so anyone can run the same code and compare roots during the 15 minute window. After
the drand draw the keeper rebuilds the snapshot again, checks the root equals the posted one, and settles with the
winner's proof.

## Tests

```bash
npm test                 # unit tests: Merkle trees, snapshots, drand decoding, listing filters, cap rules
node scripts/make-fixture.mjs && (cd ../contracts && forge test --match-contract KeeperCompat)
                         # proves the contract accepts snapshots built by this code
node e2e/fork-raffle.mjs # full run on a local fork with the real drand network (about 15 minutes, see docs/local-dev.md)
```

## Limits

- Only open Seaport listings are bought (`FULL_OPEN`, fixed price, ETH). Listings with an OpenSea zone are skipped.
- The OpenSea endpoint and chain name (`OPENSEA_CHAIN`, default `robinhood`) were written from the public API
  documentation and have not been run against the live API with a real key.
- A restart loses nothing: all state is read from the chain.
