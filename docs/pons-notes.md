# Pons V2 on Robinhood Chain (4663): findings

Sources: docs.ponsfamily.com/v2, usenosh.app footer, and direct reads via RPC
(`web/scripts/read-pons.mjs`). Read on 2026-10-04.

## Addresses (all confirmed to have code on chain 4663)

| Contract | Address |
|---|---|
| Launch Factory | `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e` |
| Fee Escrow | `0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e` |
| Meme Hook (Uniswap v4) | `0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044` |
| Buyback Vault | `0x42df2a798f82289E177311362e8f5ccC45c1219c` |
| Launch Locker | `0x267444D099b10fB5Ed7c3Cc7B7c767AdcA574952` |
| Seaport 1.6 | `0x0000000000000068F116a894984e2DB1123eB395` |

Factory owner: `0x263ed295dAFaE1d9AAdD6E56c4B6F9f38eE019Dd`.

## Verified on chain

- `launchFee()` = 0.0005 ETH
- `getLaunchConfig(0)`: supply 1e27 wei (1,000,000,000 tokens), `curveFeeBps` 100 (1%),
  `graduationThreshold` 4.2 ETH, `phantomQuote` 1.68 ETH, tickSpacing 200, enabled. Ids 1 to 4 revert.
- `maxCreatorTaxBps()` = 1000 (10%)
- Sampled curves: `feeBps()` = 100, `creatorTaxBps()` matches what each creator set.

## Verified on a local fork (2026-10-04)

Bought 1 ETH on a live curve (feeBps 100, creatorTaxBps 100) with `curve.buy(1e18, 0, buyer)` and then
called `curve.sweepFees(0)` as the creator. Fee Escrow credited:

- Pons (factory owner `0x263e...19Dd`): **0.003 ETH** = 30% of the 1% curve fee
- Creator fee recipient: **0.017 ETH** = 70% of the curve fee (0.007) + the whole 1% creator tax (0.010)

This matches the launch preview exactly. Mechanics confirmed:

1. `buy`/`sell` do NOT credit the escrow. Fees accrue on the curve (before graduation) or on the hook (after).
2. `curve.sweepFees(minBuybackTokensOut)` can only be called by the creator (fee recipient) or the Pons
   operator. It credits the escrow per recipient (event topic `0x4e45da44...`, 3 topics).
3. `escrow.claim()` pays the caller's whole native balance as real ETH and zeroes it
   (escrow balance 0.03598 ETH went to 0, wallet received the same amount minus gas).
4. So the FeeRouter must call `sweepFees` and `claim()` itself, and needs `receive()` to accept ETH.

Historical escrow data shows other splits (about 90/10 and 88/12) for other launches, so the 70/30 split
applies to configs like launchConfig 0 with buyback off; re-check if a different config is ever used.

## Not verified yet

- Post-graduation fees (VERIFIED on a fork, test/SweepPool.t.sol): graduation is a separate permissionless call,
  `factory.createGraduatedPool(token)`, which moves the liquidity to a Uniswap v4 pool (ETH/coin, fee 0,
  tickSpacing 200, Pons hook as hooks) and emits a hook event whose topic1 is the poolId (= keccak of the pool
  key). Swaps charge the hook fee in both ETH and the coin. `hook.sweepPoolFees(poolId, minOut, 0)` reverts
  `InternalSwapRequiresOperator` for the creator (our router) while coin fees are pending, and `MinimumOutputRequired`
  for the operator if minOut is 0. Only `hook.feeSweepOperator()` can sweep; it credits the escrow for the router,
  and `FeeRouter.harvest()` then claims and splits 80/20 as usual. So we depend on the Pons operator to sweep.
- Behaviour of `buybackEnabled` (we plan to keep it off).

## Integration shape

```
launchToken(TokenParams params, uint256 launchConfigId, address pairToken) payable
  returns (address token, address curve)

struct TokenParams {
  string name; string symbol; string logo; string description;
  Socials socials;            // twitter, telegram, discord, website, farcaster
  address creatorFeeRecipient; // zero = caller
  uint16 creatorTaxBps;
  bool buybackEnabled;
  bytes32 expectedEconomics;   // pin terms with previewLaunchEconomics(launchConfigId, pairToken)
  bytes32 salt;                // CREATE2
}
```

- `creatorFeeRecipient` may be a contract, so our FeeRouter is set as the recipient at launch.
- Fees accrue as a balance in Fee Escrow. Withdraw with `claim()` / `claimToken(address)`; either the
  creator or Pons can release. This is what `harvest()` will call on the router.
- Anti-snipe tax starts at 99% and decays to 0 over 5 seconds; the launcher and the fee recipient are exempt.
- Launch and the first buy can happen in one transaction through the launch-and-buy router.

## Design consequence for Curato

Launcher (our contract) calls `launchToken` with `creatorFeeRecipient = newFeeRouter`, so the router
is bound to one coin and one vault at creation. Open question: the router needs to know how Pons
credits fees in Escrow (per token, per recipient) before `harvest()` can be written.
