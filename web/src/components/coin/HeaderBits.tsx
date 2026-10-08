"use client";

import { useState } from "react";

type Socials = { twitter: string; telegram: string; discord: string; website: string; farcaster: string };

function link(v: string, base: string) {
  if (!v) return null;
  return /^https?:\/\//.test(v) ? v : base + v.replace(/^@/, "");
}

// Social-link icons in the coin header (shown only for the links a creator set at launch).
export function SocialLinks({ socials }: { socials: Socials }) {
  const items = [
    { key: "x", href: link(socials.twitter, "https://x.com/"), label: "X", fill: true, path: "M3 3l7.5 9.5L3.5 21H6l5.3-6.1L16 21h5l-7.9-10 6.9-8h-2.5l-4.8 5.6L8.2 3H3zm3.4 1.6h1.7l9.5 14.8h-1.7L6.4 4.6z" },
    { key: "tg", href: link(socials.telegram, "https://t.me/"), label: "Telegram", fill: true, path: "M21.5 4.3L2.9 11.5c-1 .4-1 1.8.1 2.1l4.6 1.4 1.8 5.5c.2.7 1.1.9 1.6.3l2.5-2.7 4.6 3.4c.6.4 1.5.1 1.7-.6L22.9 5.6c.2-.9-.6-1.6-1.4-1.3z" },
    { key: "web", href: link(socials.website, "https://"), label: "Website", fill: false, path: "M12 3a9 9 0 100 18 9 9 0 000-18zm0 0c2.5 2.3 3.8 5.6 3.8 9s-1.3 6.7-3.8 9m0-18C9.5 5.3 8.2 8.6 8.2 12s1.3 6.7 3.8 9M3.5 9h17M3.5 15h17" },
    { key: "dc", href: link(socials.discord, "https://discord.gg/"), label: "Discord", fill: false, path: "M8 6.5A14 14 0 0117 6.5m-9 11A14 14 0 0017 17.5M6.5 7C4.8 10 4.3 13.4 4.8 16.8c1.3 1 2.8 1.6 4.3 2l.9-1.6m8.5-10.2c1.7 3 2.2 6.4 1.7 9.8-1.3 1-2.8 1.6-4.3 2l-.9-1.6M9.5 13a1 1 0 100-2 1 1 0 000 2zm5 0a1 1 0 100-2 1 1 0 000 2z" },
    { key: "fc", href: link(socials.farcaster, "https://warpcast.com/"), label: "Farcaster", fill: false, path: "M5 4h14v2h-2v14h-2v-7a3 3 0 00-6 0v7H7V6H5V4z" },
  ].filter((i) => i.href);

  if (items.length === 0) return null;
  return (
    <span className="flex items-center gap-1.5">
      {items.map((i) => (
        <a
          key={i.key}
          href={i.href!}
          target="_blank"
          rel="noreferrer"
          aria-label={i.label}
          className="grid h-7 w-7 place-items-center rounded-full border border-line text-muted transition hover:border-foreground/40 hover:text-foreground"
        >
          {i.fill ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" aria-hidden>
              <path d={i.path} />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={i.path} />
            </svg>
          )}
        </a>
      ))}
    </span>
  );
}

// Copy-to-clipboard icon button, like the one beside the address on Pons.
export function CopyButton({ text, label = "Copy address" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard blocked — no-op
    }
  }

  return (
    <button type="button" onClick={copy} aria-label={label} className="transition hover:text-foreground">
      {copied ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 12l5 5L20 6" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="8" y="8" width="12" height="12" rx="2.5" />
          <path d="M16 8V6a2.5 2.5 0 0 0-2.5-2.5h-7A2.5 2.5 0 0 0 4 6v7A2.5 2.5 0 0 0 6.5 15.5H8" />
        </svg>
      )}
    </button>
  );
}
