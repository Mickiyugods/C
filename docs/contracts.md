# Curato contracts

Foundry project in `contracts/`. Run all tests (the fork tests need the Robinhood RPC):

```bash
export PATH="$PATH:$HOME/.foundry/bin"
cd contracts
export ROBINHOOD_RPC_URL=$(grep ROBINHOOD_RPC_URL ../web/.env.local | cut -d= -f2)
forge test
```

## How the pieces fit

```
creator ──launch()──▶ Launcher ──launchToken(recipient = FeeRouter)──▶ Pons factory
                         │ creates (via factories)                          │
                         ├─▶ FeeRouter (per coin)        coin trades ──fees─┘
                         └─▶ Vault (per collection, shared)         │
                                                                    ▼
anyone ──harvest()──▶ FeeRouter ──sweepFees──▶ curve ──credit──▶ Pons Fee Escrow
                         │ claim() pays ETH to the router
                         ├─ 80% ─▶ Vault.deposit(coin)   (per-coin balance)
                         └─ 20% ─▶ treasury

keeper ──postCap()──▶ Vault           keeper ──buy(order, coin)──▶ Seaport ──NFT──▶ Vault
anyone ──burn()/release()──▶ NFT goes to the dead address or to the RaffleDistributor

Airdrop raffle (one per NFT):
  vault.release ─▶ Pending ─keeper postSnapshot(root)─▶ Posted ─15 min─▶ requestDraw (pins a drand round)
  ─▶ Requested ─submitDraw(drand signature, verified on-chain)─▶ Drawn ─settle(leaf, proof)─▶ NFT to the winner
```

## Contracts

| Contract | Role | Owner? |
|---|---|---|
| `CollectionRegistry` | Allowlist of collections, keeper address, one vault per collection | Yes (curation only, two-step transfer). Cannot touch funds or existing coins |
| `Launcher` | Single entry point; wires router, vault and Pons coin in one transaction | No. All config immutable |
| `FeeRouter` | Per coin. Pons fee recipient. Splits 80/20 | No |
| `Vault` | Per collection. Holds ETH per coin, buys NFTs via Seaport only | No. No ETH withdraw function |
| `RaffleDistributor` | Receives Airdrop NFTs from vaults and delivers each to one holder, odds proportional to balance | No. Registry owner can reject a snapshot inside the 15 minute window |
| `Drand` (library) | Verifies drand quicknet BLS signatures with the EIP-2537 precompiles | n/a |
| `VaultFactory`, `RouterFactory` | Hold creation code so the Launcher fits under 24,576 bytes | No state |

## Vault safety rules

- Only the keeper can trigger a purchase, because it picks which listing to buy (the cheapest). If anyone could, a seller
  could list an NFT exactly at the cap and sell it to the vault at that price again and again.
- Only plain Seaport orders (`FULL_OPEN`, fixed price, ETH only, one ERC-721 of this collection) are accepted.
- Price must be at most the keeper cap, the coin's own balance, and the daily limit.
- Keeper cap: raise at most +10% once per hour, never above `hardMaxCap`, ignored after 2 days.
- Exact accounting: the vault's ETH change must equal the price and it must own the NFT afterwards.
- Coins never pool funds: each NFT is charged to one coin and follows that coin's policy forever.

## Raffle trust model

- Randomness: the winning ticket comes from a drand quicknet signature that the contract verifies itself
  (hash-to-curve plus a BLS pairing check). Nobody can choose it, and a round cannot be signed before it exists.
  The round is pinned at least 30 seconds ahead, after the snapshot is final.
- Snapshot: the contract cannot look up past balances, so the keeper posts who held what. That is the one
  trusted input of the raffle. Checks: weight must not exceed the coin's total supply, a 15 minute challenge
  window, owner rejection, and anyone can recompute the snapshot at `arrivedBlock` off-chain and compare roots.
- A winner that cannot hold the NFT (zero, dead, coin, collection, distributor) sends the raffle back to Pending.

## Known limits and open items

- Seaport orders with an OpenSea zone (`FULL_RESTRICTED`) are rejected; only open listings are bought.
- Graduation: after a coin graduates to Uniswap v4, `harvest()` still pays out the fees that accrued on the curve, and
  fees earned afterwards are paid once the Pons fee-sweep operator sweeps the pool (it credits the escrow, and
  `harvest()` collects it). Both are tested on a fork. `FeeRouter.sweepPool` cannot be used by the router while
  coin-denominated fees are pending (the hook reserves that to the operator).
- If the keeper never posts a snapshot, that NFT waits in the distributor until a keeper does.
- Unaudited. Do not deploy with real funds before an independent audit.
- Launch gas is about 7.4M (Pons plus our router); check against Robinhood Chain gas pricing before mainnet.
