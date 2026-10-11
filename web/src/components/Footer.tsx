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
      ["How they work", "/giveaways"],
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
    <footer className="mt-16 px-3 pb-3 sm:px-4 sm:pb-4">
      <div className="ink overflow-hidden rounded-2xl">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 pt-10 pb-8 sm:grid-cols-3 lg:grid-cols-[1.8fr_1fr_1fr_1fr] lg:gap-10 lg:px-10">
          <div className="sm:col-span-3 lg:col-span-1">
            <Logo />
            <p className="font-display mt-4 text-lg leading-snug text-on-ink">Launch coins that curate NFT floors.</p>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-on-ink-muted">
              Fees buy the floor — {brand.split.vault}/{brand.split.treasury} split, fixed in the contract. Built on {brand.launchpad}.
            </p>
          </div>

          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h4 className="placard mb-3">{col.title}</h4>
              <ul className="space-y-2 text-sm">
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

        {/* Contracts as tappable chips — the trust-minimised core, read straight from the chain. */}
        <div className="mx-auto max-w-6xl border-t border-ink-line px-6 py-5 lg:px-10">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h4 className="placard flex items-center gap-2">
              <span className="diamond" aria-hidden /> On-chain
            </h4>
            <p className="text-xs text-on-ink-muted">No owner · no upgrades · read it yourself on {brand.chain.name}.</p>
          </div>
          <ul className="grid grid-cols-2 gap-2 [&>li:last-child:nth-child(odd)]:col-span-2 sm:grid-cols-3 sm:[&>li:last-child:nth-child(odd)]:col-span-1 lg:grid-cols-5">
            {protocol.map(([label, address]) => (
              <li key={label}>
                {address ? (
                  <a
                    href={explorer + address}
                    target="_blank"
                    rel="noreferrer"
                    title={address}
                    className="group flex flex-col gap-1 rounded-xl border border-ink-line bg-ink-2/30 px-3 py-2 transition hover:border-accent/50 hover:bg-ink-2"
                  >
                    <span className="placard !text-on-ink-muted transition group-hover:!text-on-ink">{label}</span>
                    <span className="flex items-center gap-1 font-mono text-xs text-on-ink">
                      {address.slice(0, 6)}…{address.slice(-4)}
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-on-ink-muted transition group-hover:text-accent"><path d="M14 5h5v5M19 5l-8 8M19 13v4.5A1.5 1.5 0 0 1 17.5 19h-11A1.5 1.5 0 0 1 5 17.5v-11A1.5 1.5 0 0 1 6.5 5H11" /></svg>
                    </span>
                  </a>
                ) : (
                  <div className="flex flex-col gap-1 rounded-xl border border-dashed border-ink-line px-3 py-2">
                    <span className="placard !text-on-ink-muted">{label}</span>
                    <span className="font-mono text-xs text-on-ink-muted">Not deployed</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-ink-line">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-4 text-xs text-on-ink-muted sm:flex-row sm:items-center sm:justify-between lg:px-10">
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
