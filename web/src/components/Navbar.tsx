import Link from "next/link";
import { Logo } from "./Logo";
import { ConnectButton } from "./ConnectButton";
import { MobileNavLinks, NavLinks } from "./NavLinks";

export function Navbar() {
  return (
    <header className="relative z-40">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>

      <div className="border-b border-line bg-white/85 backdrop-blur-md backdrop-saturate-150">
        <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between gap-4 px-5">
          <div className="flex items-center gap-3">
            <details className="group relative lg:hidden">
              <summary
                aria-label="Menu"
                className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-md border border-line text-foreground marker:hidden hover:bg-surface [&::-webkit-details-marker]:hidden"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4 group-open:hidden" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                  <path d="M3 7h14M3 13h14" strokeLinecap="round" />
                </svg>
                <svg viewBox="0 0 20 20" className="hidden h-4 w-4 group-open:block" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                  <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
                </svg>
              </summary>
              <nav
                aria-label="Main"
                className="ink absolute left-0 top-[52px] w-64 overflow-hidden rounded-xl border border-ink-line p-2 text-sm shadow-[0_24px_48px_-24px_rgb(21_18_15/0.7)]"
              >
                <p className="placard px-3 pt-2 pb-3">Menu</p>
                <MobileNavLinks />
                <Link
                  href="/launch"
                  className="mt-2 flex items-center justify-between rounded-md bg-on-ink px-3 py-2.5 font-medium text-ink"
                >
                  Launch a coin <span aria-hidden>→</span>
                </Link>
              </nav>
            </details>
            <Link href="/" aria-label="Curato home" className="shrink-0">
              <Logo />
            </Link>
          </div>

          <NavLinks />

          <div className="flex shrink-0 items-center gap-2 text-sm sm:gap-3">
            <Link href="/profile" className="hidden text-muted transition hover:text-foreground lg:block">
              Profile
            </Link>
            <span aria-hidden className="hidden h-5 w-px bg-line lg:block" />
            <ConnectButton />
            <Link
              href="/launch"
              className="group inline-flex items-center gap-2 rounded-md bg-ink px-3 py-2 font-medium whitespace-nowrap text-on-ink transition hover:bg-ink-2 sm:px-4"
            >
              <span className="diamond hidden transition group-hover:rotate-[135deg] sm:inline-block" aria-hidden />
              Launch
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
