# Deployment checklist

Do these in order. Nothing here should be skipped for a launch with real money.

## Before any mainnet deployment

- [ ] **Independent audit** of `CollectionRegistry`, `Launcher`, `FeeRouter`, `Vault`, `RaffleDistributor`, `Drand`
      and the factories. Fix findings and re-run all tests. Contracts cannot be changed after deployment.
- [ ] Read `docs/contracts.md` and `docs/pons-notes.md` again and confirm the Pons addresses and parameters on chain
      (`node web/scripts/read-pons.mjs`).
- [x] Treasury address chosen: `0x83e92CdB45e8334B4B7f21251E820c9788042fDF` (personal wallet, provided 2026-10-07).
      It is immutable once deployed. A multisig would be safer, since this one wallet receives 20% of all fees; move to
      a multisig before mainnet if possible.
- [ ] Decide `VAULT_HARD_MAX_CAP_WEI` (highest price of one NFT a vault may ever pay) and `VAULT_DAILY_LIMIT_WEI`
      (most a vault may spend per day). Both are immutable. Defaults are 1 ETH per NFT and 2 ETH per day (chosen as a cautious start; both are immutable, so a wrong value needs a new Launcher).
- [ ] Create a dedicated **keeper wallet**. It needs a little ETH for gas only. Keep its key on the server that
      runs the keeper, not on a laptop. It is the only account that can post caps and make vaults buy, so it is the
      most sensitive key in the system after the registry owner; the vault limits (cap, daily limit, hard ceiling)
      are what bound the damage if it leaks.
- [ ] Decide who owns the **registry**. It can list and delist collections and replace the keeper. Prefer a multisig
      (`transferOwnership`, then the new owner calls `acceptOwnership`).
- [ ] Rotate any API key that was ever pasted into a chat or committed anywhere (RPC, OpenSea, Pinata).

## Deploy

```bash
cd contracts
export TREASURY=... KEEPER=... REGISTRY_OWNER=... DEPLOY_TAG=mainnet
forge script script/Deploy.s.sol --rpc-url $RPC            # dry run on a fork first
forge script script/Deploy.s.sol --rpc-url $RPC --broadcast --private-key $DEPLOYER_KEY
```

- [ ] If `REGISTRY_OWNER` differs from the deployer, the new owner calls `acceptOwnership()`.
- [ ] Verify every contract's source on the block explorer.
- [ ] List collections (`web/scripts/register-collections.mjs --execute`). Review the list first: it comes from a
      third-party list and every entry becomes something a coin can sweep.
- [ ] Smoke test on mainnet with a tiny launch you control: launch, trade, harvest, check the 80/20 split.

## Website

- [ ] Set `NEXT_PUBLIC_LAUNCHER`, `NEXT_PUBLIC_REGISTRY`, `NEXT_PUBLIC_DISTRIBUTOR`, `NEXT_PUBLIC_DEPLOY_BLOCK`,
      `ROBINHOOD_RPC_URL` (server only) and, for uploads, `PINATA_JWT` in the host's environment. Never expose the RPC
      key with a `NEXT_PUBLIC_` prefix.
- [ ] Replace the draft **Terms** and **Privacy** pages with text reviewed by a lawyer, and add a contact address.
- [ ] Check the "Not affiliated with Robinhood Markets or Pons" notice stays in the footer.
- [ ] Use a dedicated or paid IPFS gateway for images; public gateways rate limit.

## Keeper

- [ ] Fill `keeper/.env`, run `npm run dry`, then `npm start` under a process manager that restarts it.
- [ ] Add `OPENSEA_API_KEY` and confirm the OpenSea endpoint works for Robinhood Chain (untested against the live API).
- [ ] Monitor the keeper wallet's gas balance and the log for `failed` lines.

## Known gaps to decide on

- Vaults only buy open Seaport listings. OpenSea listings that use its zone (`FULL_RESTRICTED`) are skipped, which may
  leave many real listings unreachable.
- Fees earned after a coin graduates to Uniswap v4 must be swept by the Pons fee-sweep operator (the router cannot do it
  itself; verified on a fork). Once swept they sit in the escrow and `harvest()` splits them 80/20. If Pons stops
  sweeping, those fees wait. Check with Pons how often the operator sweeps before launch. Fees accrued before
  graduation are harvested normally.
- The giveaway snapshot is posted by the keeper; the challenge window and owner rejection are the only checks.
- Ethereum collections are listed on the site for viewing only; coins can only sweep Robinhood Chain collections.
