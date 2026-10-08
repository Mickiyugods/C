import Link from "next/link";
import { Logo, LogoMark } from "./Logo";
import { brand } from "@/config/brand";
import { contracts, PONS_FACTORY, SEAPORT } from "@/lib/contracts";

const columns: { title: string; links: [string, string][] }[] = [
  {
    title: "Collect",
    links: [
      ["Explore coins", "/explore"],
      ["Collections", "/collections"],
      ["Gallery", "/gallery"],
      ["Launch a coin", "/launch"],
    ],
  },
  {
    title: "Giveaways",
    links: [
      ["How they work", "/holders"],
      ["Analytics", "/analytics"],
      ["Payments", "/analytics#payments"],
    ],
  },
  {
    title: "Reference",
    links: [
      ["Docs", "/docs"],
      ["Suggest a collection", "/collections#suggest"],
      ["Terms", "/terms"],
      ["Privacy", "/privacy"],
    ],
  },
];

const protocol: [string, string | undefined][] = [
  ["Registry", contracts.registry],
  ["Launcher", contracts.launcher],
  ["Raffle", contracts.distributor],
  ["Pons factory", PONS_FACTORY],
  ["Seaport 1.6", SEAPORT],
];
const explorer = "https://robinhoodchain.blockscout.com/address/";

export function Footer() {
  return (
    <footer className="mt-24 px-3 pb-3 sm:px-4 sm:pb-4">
      <div className="ink overflow-hidden rounded-2xl">
        {/* Closing line and the one action that matters. */}
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 pt-16 pb-14 md:flex-row md:items-end md:justify-between lg:px-10">
          <p className="font-display max-w-xl text-[clamp(2.2rem,4.4vw,3.6rem)] leading-[1] font-medium">
            Every coin <em className="text-accent">curates</em> a collection.
          </p>
          <Link
            href="/launch"
            className="inline-flex shrink-0 items-center gap-3 self-start rounded-md bg-on-ink px-6 py-3 font-medium text-ink transition hover:bg-white md:self-auto"
          >
            Launch a coin <span aria-hidden>→</span>
          </Link>
        </div>

        <div className="mx-auto grid max-w-6xl gap-10 border-t border-ink-line px-6 py-14 sm:grid-cols-2 lg:grid-cols-[1.8fr_1fr_1fr_1fr] lg:gap-12 lg:px-10">
          <div className="sm:col-span-2 lg:col-span-1">
            <Logo />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-on-ink-muted">
              A launchpad where every coin curates an NFT collection. Trading fees fund a vault, the vault buys floor
              NFTs, and {brand.split.vault}% / {brand.split.treasury}% is fixed in the contract.
            </p>
          </div>

          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h4 className="placard mb-5">{col.title}</h4>
              <ul className="space-y-3 text-sm">
                {col.links.map(([label, href]) => (
                  <li key={label}>
                    <Link href={href} className="text-on-ink-muted transition hover:text-on-ink">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* Contracts: a single wall-label row so the addresses read like a plaque, not a list. */}
        <div className="mx-auto max-w-6xl border-t border-ink-line px-6 py-6 lg:px-10">
          <h4 className="placard mb-4">On-chain</h4>
          <ul className="flex flex-wrap gap-x-8 gap-y-3">
            {protocol.map(([label, address]) => (
              <li key={label} className="flex items-baseline gap-2.5">
                <span className="text-xs text-on-ink-muted">{label}</span>
                {address ? (
                  <a
                    href={explorer + address}
                    target="_blank"
                    rel="noreferrer"
                    title={address}
                    className="font-mono text-xs text-on-ink transition hover:text-accent"
                  >
                    {address.slice(0, 6)}…{address.slice(-4)} ↗
                  </a>
                ) : (
                  <span className="font-mono text-xs text-on-ink-muted">Not deployed</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-ink-line">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-6 text-xs text-on-ink-muted sm:flex-row sm:items-center sm:justify-between lg:px-10">
            <p className="flex items-center gap-2.5">
              <LogoMark size={16} />
              <span>© {new Date().getFullYear()} {brand.name} · {brand.chain.name} ({brand.chain.id})</span>
            </p>
            <p className="max-w-lg sm:text-right">Not financial advice. Contracts are unaudited until stated otherwise. Not affiliated with Robinhood Markets or Pons.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
