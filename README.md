# Curato

A launchpad on Robinhood Chain where every coin is paired with one NFT collection. Part of the coin's fees buys that
collection's floor, and the NFTs are either raffled to the coin's holders or burned. Coins are created on Pons.

```
contracts/   Solidity (Foundry): registry, launcher, fee router, vault, giveaway, drand verifier
web/         Next.js site: explore, launch wizard, coin pages, collections, giveaways, analytics, docs
keeper/      Node bot: harvests fees, posts price caps, buys NFTs, runs giveaways
docs/        Notes: Pons findings, contract design, local development, deployment checklist
```

## Status

- Contracts: written and tested (unit, fuzz, and fork tests against the live Pons factory and Seaport 1.6).
  **Not audited.** Not deployed anywhere except local forks.
- Website: complete for the flows above; reads everything from the chain.
- Keeper: tested end to end on a fork with the real drand network.

## Start here

- `docs/local-dev.md` to run everything on your machine for free.
- `docs/contracts.md` for how the pieces fit and what you have to trust.
- `docs/deployment-checklist.md` before putting real money anywhere near it.
