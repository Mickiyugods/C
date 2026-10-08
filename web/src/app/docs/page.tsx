import { brand, launchParams, feesPerEthTraded } from "@/config/brand";
import { PageHeader } from "@/components/PageHeader";
import { contracts, PONS_FACTORY, SEAPORT } from "@/lib/contracts";

export const metadata = { title: "Docs" };

const explorer = "https://robinhoodchain.blockscout.com/address/";

const sections = [
  ["overview", "Overview"],
  ["how", "How it works"],
  ["fees", "Fees"],
  ["vaults", "Vaults"],
  ["policy", "NFT policy"],
  ["giveaways", "Giveaways"],
  ["trust", "What you have to trust"],
  ["contracts", "Contracts"],
  ["risks", "Risks"],
] as const;

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mt-14 scroll-mt-36 font-display text-2xl font-medium tracking-tight">
      {children}
    </h2>
  );
}

const P = ({ children }: { children: React.ReactNode }) => <p className="mt-3 text-[15px] leading-relaxed text-muted">{children}</p>;

export default function Page() {
  const fees = feesPerEthTraded();
  const rows: [string, string | undefined][] = [
    ["Collection registry", contracts.registry],
    ["Launcher", contracts.launcher],
    ["Raffle distributor", contracts.distributor],
    ["Pons launch factory", PONS_FACTORY],
    ["Seaport 1.6", SEAPORT],
  ];

  return (
    <>
      <PageHeader eyebrow="Reference" title={<>How <em className="text-accent">Curato</em> works</>}>
        Launching, fees, vaults, giveaways and the contracts behind them, in plain words.
      </PageHeader>
    <section className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-10 px-5 py-14 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav className="hidden lg:block">
        <ul className="sticky top-32 space-y-2.5 border-l border-line pl-4 text-sm text-muted">
          {sections.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="hover:text-foreground">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <article className="min-w-0 max-w-3xl">
        <H id="overview">Overview</H>
        <P>
          {brand.name} is a launchpad on {brand.chain.name} where every coin is paired with one NFT collection. Part of the fees the coin earns
          are spent buying that collection&apos;s floor, and the NFTs either go to the coin&apos;s holders in a giveaway or are burned.
          Coins are created on {brand.launchpad}; {brand.name} adds the pairing, the vaults and the giveaways.
        </P>

        <H id="how">How it works</H>
        <ol className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted">
          <li><strong className="font-medium text-foreground">1. Launch.</strong> A creator picks a name, a symbol, an image, one collection and an NFT policy, then sends one transaction. The Launcher creates the coin on Pons and a fee router bound to it.</li>
          <li><strong className="font-medium text-foreground">2. Trade.</strong> People trade the coin on its Pons bonding curve. Each trade earns creator fees.</li>
          <li><strong className="font-medium text-foreground">3. Harvest.</strong> Anyone can call harvest on the coin&apos;s router. It pulls the fees out of Pons and splits them {brand.split.vault}% to the collection vault and {brand.split.treasury}% to the treasury.</li>
          <li><strong className="font-medium text-foreground">4. Sweep.</strong> The keeper makes the vault buy the cheapest listed NFT of its collection, within a price cap, using that coin&apos;s own balance.</li>
          <li><strong className="font-medium text-foreground">5. Deliver.</strong> The NFT is burned or raffled to holders, depending on the policy the creator chose.</li>
        </ol>

        <H id="fees">Fees</H>
        <P>
          Every launch uses Pons configuration 0: a {launchParams.curveFeePct}% curve fee on each trade, of which {launchParams.curveFeeToRouterPct}% goes to the
          creator side and the rest to Pons, plus the creator tax the creator chose (0 to {launchParams.maxCreatorTaxPct}%). The router splits everything it
          receives {brand.split.vault}/{brand.split.treasury}. The split is a constant in the router&apos;s code and cannot be changed.
        </P>
        <P>
          Example with the default {launchParams.creatorTaxPct}% tax: for every 1 ETH traded, about {fees.vault.toFixed(4)} ETH goes to the vault,{" "}
          {fees.treasury.toFixed(4)} ETH to the {brand.name} treasury and {fees.pons.toFixed(4)} ETH to Pons. Launching costs Pons&apos;s launch fee
          (currently {launchParams.ponsLaunchFeeEth.toFixed(4)} ETH) plus gas. At {launchParams.graduationEth.toFixed(1)} ETH of curve liquidity a coin graduates to a locked
          Uniswap v4 pool and fees keep flowing to the same router.
        </P>

        <H id="vaults">Vaults</H>
        <P>
          There is one vault per collection, shared by all coins paired with it, but each coin has its own balance inside it. Coins never
          pool funds: an NFT is charged to the coin whose fees paid for it and follows that coin&apos;s policy. A vault has no function that
          sends ETH anywhere except to Seaport for a purchase, so nobody, including the team, can withdraw it.
        </P>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-muted marker:text-line">
          <li>Only the keeper can trigger a purchase, so a seller cannot sell to a vault at the price cap on their own.</li>
          <li>Only plain Seaport listings are bought: fixed price, paid in ETH, one NFT of the vault&apos;s collection.</li>
          <li>The price must be at or below a cap posted by the keeper. The cap can rise by at most 10% per hour, never above a hard ceiling, and expires after 2 days.</li>
          <li>A daily spending limit applies to each vault.</li>
          <li>After every purchase the contract checks that exactly the price left the vault and that it now owns the NFT.</li>
        </ul>

        <H id="policy">NFT policy</H>
        <P>
          The creator chooses once, at launch, and it can never be changed. <strong className="font-medium text-foreground">Burn</strong> sends every NFT the
          coin buys to a dead address, shrinking the collection&apos;s supply. <strong className="font-medium text-foreground">Airdrop</strong> gives each NFT to one
          holder of the coin, chosen at random with odds proportional to balance. On {brand.chain.name} the winner does nothing: the NFT arrives in
          the wallet that holds the coin.
        </P>

        <H id="giveaways">Giveaways</H>
        <P>
          The random number comes from the drand quicknet network. The contract pins a drand round that has not been published yet, and later
          verifies that round&apos;s BLS signature itself using the chain&apos;s BLS12-381 precompiles, so nobody can choose or predict the result.
          Who held how much is posted by the keeper as a Merkle root; a 15 minute window lets anyone recompute and check it before the draw, and
          the registry owner can reject a bad snapshot. The winner&apos;s proof is checked on-chain before the NFT moves.
        </P>

        <H id="trust">What you have to trust</H>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-muted marker:text-line">
          <li><strong className="font-medium text-foreground">The contracts.</strong> They are unaudited until stated otherwise.</li>
          <li><strong className="font-medium text-foreground">Pons and Seaport.</strong> {brand.name} builds on them and cannot change them.</li>
          <li><strong className="font-medium text-foreground">The keeper</strong> for three things: posting a price cap, choosing which listing to buy within that cap, and posting the holder snapshot for a giveaway. It cannot move funds.</li>
          <li><strong className="font-medium text-foreground">The registry owner</strong> decides which collections new coins can pair with and can replace the keeper. It cannot touch funds or coins that already exist.</li>
        </ul>

        <H id="contracts">Contracts</H>
        <dl className="mt-4 divide-y divide-line rounded-xl border border-line text-sm">
          {rows.map(([label, address]) => (
            <div key={label} className="flex justify-between gap-6 px-5 py-3">
              <dt className="shrink-0 text-muted">{label}</dt>
              <dd className="min-w-0 text-right">
                {address ? (
                  <a className="font-mono text-xs break-all underline-offset-2 hover:underline" href={explorer + address} target="_blank" rel="noreferrer">
                    {address}
                  </a>
                ) : (
                  <span className="text-xs text-muted">Not deployed yet</span>
                )}
              </dd>
            </div>
          ))}
        </dl>

        <H id="risks">Risks</H>
        <P>
          Coins can lose all their value. NFT prices can fall and a vault can end up holding NFTs worth less than it paid. If a collection has no
          listings under the price cap, ETH stays in the vault, and there is no way to take it out. Smart contracts can contain bugs that cannot be
          fixed after deployment. Nothing here is financial advice.
        </P>
      </article>
    </section>
    </>
  );
}
