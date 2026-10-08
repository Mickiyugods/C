"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { nav } from "@/config/brand";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop navigation; the current section is underlined. */
export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden items-center gap-7 text-sm lg:flex">
      {nav.map((item) => {
        const on = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={on ? "page" : undefined}
            className={`relative py-1 transition ${on ? "text-foreground" : "text-muted hover:text-foreground"}`}
          >
            {item.label}
            {on ? <span aria-hidden className="absolute inset-x-0 -bottom-[21px] h-px bg-accent" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Mobile menu items, same order as the desktop bar. */
export function MobileNavLinks() {
  const pathname = usePathname();
  return (
    <>
      {[...nav, { href: "/profile", label: "Profile" }].map((item) => {
        const on = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={on ? "page" : undefined}
            className={`font-display flex items-center justify-between rounded-md px-3 py-2 text-xl ${on ? "bg-ink-2 text-on-ink" : "text-on-ink-muted hover:bg-ink-2 hover:text-on-ink"}`}
          >
            {item.label}
            {on ? <span className="diamond" aria-hidden /> : null}
          </Link>
        );
      })}
    </>
  );
}
