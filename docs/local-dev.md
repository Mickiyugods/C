# Running everything locally

Everything below runs on your computer against a fork of Robinhood Chain, so it costs nothing and touches no real
funds. You need Foundry (`forge`, `anvil`, `cast`) and Node 20+.

```bash
export PATH="$PATH:$HOME/.foundry/bin"
```

## 1. Fork the chain

Use a private RPC (the public one is blocked on some networks). Chain id must stay 4663.

```bash
anvil --fork-url "$ROBINHOOD_RPC_URL" --port 8545 --chain-id 4663
```

## 2. Deploy the contracts

The default anvil accounts are used: #0 deploys and owns the registry, #1 is the treasury, #2 is the keeper.

```bash
cd contracts
export TREASURY=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
export KEEPER=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
export REGISTRY_OWNER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
export DEPLOY_TAG=local
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

The addresses are printed and saved in `contracts/deployments/4663-local.json`.

## 3. List the collections

```bash
cd ../web
REGISTRY=<registry address> RPC_URL=http://127.0.0.1:8545 \
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
node scripts/register-collections.mjs --execute
```

Leave out `--execute` for a dry run. `LIMIT=20` lists only the first 20 collections.

## 4. Start the website

Put these in `web/.env.local` (see `web/.env.example`):

```
CURATO_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_LAUNCHER=...
NEXT_PUBLIC_REGISTRY=...
NEXT_PUBLIC_DISTRIBUTOR=...
NEXT_PUBLIC_DEPLOY_BLOCK=<block of the first deployment transaction>
```

```bash
npm run dev
```

In a browser wallet, add a network with RPC `http://127.0.0.1:8545` and chain id 4663, and import one of anvil's test
keys. Never import a key that holds real funds into a development setup.

## 5. Run the keeper

See `keeper/README.md`. For the full raffle test on a fork: `node keeper/e2e/fork-raffle.mjs`. It launches a coin,
trades it, lets the keeper harvest, buy through real Seaport, release and run a giveaway with a real drand beacon.

## Tests

```bash
cd contracts && ROBINHOOD_RPC_URL=... forge test     # 100+ tests, fork tests need the RPC
cd keeper && npm test
cd web && npx tsc --noEmit && npx eslint src && npm run build
```

## When contracts change

```bash
cd contracts && forge build
cd ../web && node scripts/sync-abis.mjs
cd ../keeper && node scripts/sync-abis.mjs
```
