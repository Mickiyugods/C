"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseEther } from "viem";
import { Avatar } from "./Avatar";
import { collections as allCollections } from "@/data/mock";
import { useWallet } from "@/lib/wallet";
import { launchCoin, explainError, type LaunchResult } from "@/lib/launch";
import { contracts } from "@/lib/contracts";
import { brand, launchParams, feesPerEthTraded } from "@/config/brand";

// Vaults buy on Robinhood Chain, so only collections there can be swept for now.
const robinhoodCollections = allCollections.filter((c) => c.chain === "robinhood");

const MAX_IMAGE = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];
const LAUNCHER = contracts.launcher;

type Policy = "airdrop" | "burn";

const steps = [
  { n: 1, title: "Token", sub: "Name, ticker, links" },
  { n: 2, title: "Collection", sub: "What it sweeps" },
  { n: 3, title: "NFT policy", sub: "Where NFTs go" },
  { n: 4, title: "Review", sub: "Confirm and launch" },
] as const;

const field =
  "w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm outline-none transition placeholder:text-muted focus:border-foreground";

const eth = (n: number) => n.toFixed(4);

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between">
      <span className="text-sm font-medium">{children}</span>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </div>
  );
}

function Err({ children }: { children?: React.ReactNode }) {
  return children ? <p className="mt-1.5 text-xs text-accent">{children}</p> : null;
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-line bg-surface/60 p-4 text-sm leading-relaxed text-muted">{children}</div>;
}

export function LaunchForm({ listed }: { listed: string[] | null }) {
  const wallet = useWallet();
  // When the registry could be read, only its listed collections are offered; otherwise show them all.
  const collections = useMemo(
    () => (listed ? robinhoodCollections.filter((c) => listed.includes(c.address.toLowerCase())) : robinhoodCollections),
    [listed],
  );

  const [step, setStep] = useState(1);
  const [tried, setTried] = useState<Record<number, boolean>>({});

  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [imageError, setImageError] = useState<string | null>(null);
  const [website, setWebsite] = useState("");
  const [x, setX] = useState("");
  const [telegram, setTelegram] = useState("");
  const [devBuy, setDevBuy] = useState("");
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [policy, setPolicy] = useState<Policy>("airdrop");
  const [tax, setTax] = useState<number>(launchParams.creatorTaxPct);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadsEnabled, setUploadsEnabled] = useState<boolean | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "simulating" | "confirm" | "mining">("idle");
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [result, setResult] = useState<LaunchResult | null>(null);

  useEffect(() => {
    fetch("/api/upload")
      .then((r) => r.json())
      .then((j: { enabled: boolean }) => setUploadsEnabled(j.enabled))
      .catch(() => setUploadsEnabled(false));
  }, []);

  const filePreview = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  useEffect(() => {
    return () => {
      if (filePreview) URL.revokeObjectURL(filePreview);
    };
  }, [filePreview]);
  const previewSrc = filePreview ?? (/^https?:\/\//.test(imageUrl) ? imageUrl : null);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Enter a name.";
    else if (name.trim().length > 32) e.name = "Max 32 characters.";
    if (!/^[A-Z0-9]{2,10}$/.test(ticker)) e.ticker = "2 to 10 letters or numbers.";
    if (!image && !imageUrl) e.image = "Add a token image.";
    else if (!image && !/^https:\/\/\S+$/.test(imageUrl)) e.image = "Use a full image URL starting with https://";
    if (description.length > 512) e.description = "Max 512 characters.";
    if (website && !/^https?:\/\/\S+\.\S+/.test(website)) e.website = "Use a full URL starting with https://";
    if (!collectionId) e.collection = "Pick the collection this coin will sweep.";
    return e;
  }, [name, ticker, image, imageUrl, description, website, collectionId]);

  const stepKeys: Record<number, string[]> = {
    1: ["name", "ticker", "image", "description", "website"],
    2: ["collection"],
    3: [],
    4: [],
  };
  const stepValid = (n: number) => stepKeys[n].every((k) => !errors[k]);
  const reachable = (n: number) => steps.slice(0, n - 1).every((s) => stepValid(s.n));
  const show = (k: string, n: number) => (tried[n] ? errors[k] : undefined);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? collections.filter((c) => c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q)) : collections;
  }, [query, collections]);

  const selected = collections.find((c) => c.id === collectionId);
  const fees = feesPerEthTraded(tax);
  const feeTotal = fees.vault + fees.treasury + fees.pons;
  const pct = (n: number) => `${(n / feeTotal) * 100}%`;
  const collectionName = selected?.name ?? "the collection";

  function pickImage(file: File | undefined) {
    setImageError(null);
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) return setImageError("Use a PNG, JPG, WebP, GIF or SVG.");
    if (file.size > MAX_IMAGE) return setImageError("Image must be under 5 MB.");
    setImage(file);
    setImageUrl("");
  }

  function next() {
    setTried((t) => ({ ...t, [step]: true }));
    if (stepValid(step)) setStep(step + 1);
  }

  const busy = status !== "idle";
  const statusLabel: Record<typeof status, string> = {
    idle: "",
    uploading: "Uploading image…",
    simulating: "Checking…",
    confirm: "Confirm in your wallet…",
    mining: "Waiting for the chain…",
  };

  async function doLaunch() {
    if (!wallet.address || !selected || !LAUNCHER) return;
    setLaunchError(null);
    try {
      let logo = imageUrl;
      if (image) {
        if (!uploadsEnabled) throw new Error("Image upload is not enabled here. Remove the file and paste an image URL instead.");
        setStatus("uploading");
        const form = new FormData();
        form.append("file", image);
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const json = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !json.url) throw new Error(json.error ?? "Image upload failed.");
        logo = json.url;
      }
      const res = await launchCoin(
        {
          account: wallet.address as `0x${string}`,
          name: name.trim(),
          symbol: ticker,
          logo,
          description,
          website,
          twitter: x,
          telegram,
          collection: selected.address as `0x${string}`,
          policy,
          creatorTaxBps: Math.round(tax * 100),
          devBuy: devBuy && Number(devBuy) > 0 ? parseEther(devBuy) : 0n,
        },
        (s) => setStatus(s),
      );
      setResult(res);
    } catch (e) {
      setLaunchError(explainError(e));
    } finally {
      setStatus("idle");
    }
  }

  let action: { label: string; disabled: boolean; onClick?: () => void; note?: string };
  if (!wallet.address) {
    action = { label: wallet.connecting ? "Connecting…" : "Connect wallet", disabled: wallet.connecting, onClick: wallet.connect };
  } else if (wallet.wrongChain) {
    action = { label: "Switch to Robinhood Chain", disabled: false, onClick: wallet.switchChain };
  } else if (!LAUNCHER) {
    action = {
      label: `Launch ${ticker || "coin"}`,
      disabled: true,
      note: "The Launcher contract is not live yet, so coins cannot be created. Everything above has been checked and is ready.",
    };
  } else {
    action = { label: busy ? statusLabel[status] : `Launch ${ticker || "coin"}`, disabled: busy, onClick: doLaunch };
  }

  const backButton =
    step === 1 ? (
      <Link href="/" className="rounded-md border border-line px-5 py-2.5 text-sm font-medium hover:bg-surface">
        Cancel
      </Link>
    ) : (
      <button type="button" onClick={() => setStep(step - 1)} className="rounded-md border border-line px-5 py-2.5 text-sm font-medium hover:bg-surface">
        Back
      </button>
    );

  const sliderPct = (tax / launchParams.maxCreatorTaxPct) * 100;

  if (result) {
    return (
      <div className="rounded-2xl border border-line bg-white p-8 text-center sm:p-12">
        <p className="font-mono text-xs text-accent">LAUNCHED</p>
        <h2 className="mt-2 font-display text-3xl font-medium">${ticker} is live</h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted">
          Your coin trades on Pons now. Its creator fees flow to a router that sends 80% to the collection vault and 20% to the treasury.
        </p>
        <dl className="mx-auto mt-6 max-w-md space-y-2 rounded-2xl bg-surface/60 p-4 text-left text-sm">
          {[
            ["Coin", result.coin],
            ["Fee router", result.router],
            ["Vault", result.vault],
            ["Transaction", result.hash],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-muted">{k}</dt>
              <dd className="font-mono text-xs break-all text-right">{v.slice(0, 10)}…{v.slice(-6)}</dd>
            </div>
          ))}
        </dl>
        <Link href={`/coin/${result.coin}`} className="mt-7 inline-block rounded-md bg-foreground px-6 py-3 text-sm font-medium text-white hover:opacity-85">
          Open the coin page
        </Link>
      </div>
    );
  }

  return (
    <div>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
        {steps.map((s, i) => {
          const active = step === s.n;
          const done = s.n < step && stepValid(s.n);
          const locked = !reachable(s.n);
          return (
            <li key={s.n} className="flex items-center gap-2">
              <button
                type="button"
                disabled={locked}
                onClick={() => setStep(s.n)}
                aria-current={active ? "step" : undefined}
                className={`group flex items-center gap-2.5 rounded-full py-1.5 pr-4 pl-1.5 text-left transition ${
                  active ? "bg-ink text-on-ink" : "text-muted hover:text-foreground"
                } ${locked ? "cursor-not-allowed opacity-40" : ""}`}
              >
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[11px] transition ${
                    active ? "bg-accent text-white" : done ? "bg-foreground text-white" : "border border-line bg-white text-muted"
                  }`}
                >
                  {done ? "✓" : String(s.n).padStart(2, "0")}
                </span>
                <span className="text-sm font-medium whitespace-nowrap">{s.title}</span>
              </button>
              {i < steps.length - 1 ? <span aria-hidden className="hidden h-px w-6 bg-line sm:block" /> : null}
            </li>
          );
        })}
      </ol>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="order-2 rounded-2xl border border-line bg-white p-6 sm:p-8 lg:order-1">
          {step === 1 && (
            <div className="space-y-6">
              <header>
                <h2 className="font-display text-2xl font-medium">Token</h2>
                <p className="mt-1 text-sm text-muted">What the coin is called and where to find it.</p>
              </header>

              <div>
                <Label>Launch on</Label>
                <div className="inline-flex rounded-md border border-line bg-surface/60 p-1 text-sm">
                  <span className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-1.5 font-medium text-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/chains/pons.png" alt="" width={16} height={16} className="h-4 w-4 object-contain" />
                    {brand.launchpad}
                  </span>
                </div>
                <p className="mt-3 text-xs text-muted">
                  {brand.chain.name} · {brand.split.vault}% of creator fees go to a vault that can only buy this collection&apos;s floor, and{" "}
                  {brand.split.treasury}% to the treasury.
                </p>
              </div>

              <div className="grid gap-5 sm:grid-cols-[1fr_160px]">
                <div>
                  <Label hint={`${name.length}/32`}>Token name</Label>
                  <input className={field} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="e.g. Floor Sweeper" />
                  <Err>{show("name", 1)}</Err>
                </div>
                <div>
                  <Label>Symbol</Label>
                  <input
                    className={`${field} font-mono uppercase`}
                    value={ticker}
                    maxLength={10}
                    onChange={(e) => setTicker(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                    placeholder="SWEEP"
                  />
                  <Err>{show("ticker", 1)}</Err>
                </div>
              </div>

              <div>
                <Label hint={!image ? `${imageUrl.length}/512` : undefined}>
                  Token image <span className="font-normal text-muted">· required</span>
                </Label>
                {image && filePreview ? (
                  <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface/50 p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={filePreview} alt="Token image preview" className="h-14 w-14 rounded-xl object-cover" />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium">Image ready</p>
                      <p className="truncate font-mono text-xs text-muted">
                        {image.name} · {(image.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                    <button type="button" onClick={() => fileInput.current?.click()} className="rounded-md border border-line px-3 py-1.5 text-xs font-medium hover:bg-surface">
                      Replace
                    </button>
                    <button type="button" onClick={() => setImage(null)} className="px-2 py-1.5 text-xs text-muted hover:text-foreground">
                      Remove
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => fileInput.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        pickImage(e.dataTransfer.files[0]);
                      }}
                      className="flex w-full items-center gap-4 rounded-2xl border border-dashed border-line bg-surface/50 p-4 text-left transition hover:border-foreground"
                    >
                      {previewSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={previewSrc} alt="Token image preview" className="h-14 w-14 rounded-xl object-cover" />
                      ) : (
                        <span className="grid h-14 w-14 place-items-center rounded-xl bg-white text-2xl text-muted">+</span>
                      )}
                      <span className="text-sm">
                        <span className="font-medium">Drop an image, or click to choose</span>
                        <span className="block text-xs text-muted">PNG, JPG, WebP, GIF or SVG, up to 5 MB</span>
                      </span>
                    </button>
                    <input
                      className={`${field} mt-2 font-mono text-xs`}
                      value={imageUrl}
                      maxLength={512}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="…or paste an image URL (https://…)"
                    />
                  </>
                )}
                <input ref={fileInput} type="file" accept={IMAGE_TYPES.join(",")} className="hidden" onChange={(e) => pickImage(e.target.files?.[0])} />
                {uploadsEnabled === false ? (
                  <p className="mt-1.5 text-xs text-muted">Direct upload is not enabled on this deployment. Paste an image URL to launch.</p>
                ) : null}
                <Err>{imageError ?? show("image", 1)}</Err>
              </div>

              <div>
                <Label hint={`${description.length}/512`}>Description</Label>
                <textarea className={`${field} min-h-24 resize-y`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this coin about?" />
                <Err>{show("description", 1)}</Err>
              </div>

              <div>
                <Label>Links</Label>
                <div className="space-y-2.5">
                  <input className={field} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Website URL" />
                  <input className={field} value={x} onChange={(e) => setX(e.target.value)} placeholder="X profile URL" />
                  <input className={field} value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="Telegram link" />
                </div>
                <Err>{show("website", 1)}</Err>
              </div>

              <div>
                <Label hint="optional">Dev buy</Label>
                <div className="flex items-center gap-2">
                  <input
                    inputMode="decimal"
                    className={field}
                    value={devBuy}
                    onChange={(e) => setDevBuy(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="0.0"
                  />
                  <span className="shrink-0 text-sm text-muted">ETH</span>
                </div>
                <p className="mt-1.5 text-xs text-muted">Buy your own coin in the same launch transaction — the tokens go straight to your wallet.</p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <header>
                <h2 className="font-display text-2xl font-medium">Collection</h2>
                <p className="mt-1 text-sm text-muted">What your fees will buy: one NFT collection, bought at floor. Permanent.</p>
              </header>

              <Notice>
                <strong className="font-medium text-foreground">This is permanent.</strong> The fee router deployed with your coin is bound to
                this collection&apos;s vault and has no function to repoint it. You cannot change it after launch.
              </Notice>
              <Notice>
                On {brand.chain.name}, nothing is left for the winner to do. Your fees buy the NFT, it is raffled to your holders, and it arrives
                in the winner&apos;s wallet, the same address they hold the coin with. Holding the coin is all anyone has to do.
              </Notice>

              <label className="flex items-center gap-3 rounded-md border border-line bg-white px-4 py-2.5 text-sm">
                <span aria-hidden className="text-muted">⌕</span>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search collections" className="w-full bg-transparent outline-none placeholder:text-muted" />
              </label>

              <div className="grid max-h-[30rem] gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2">
                {filtered.map((c) => {
                  const on = collectionId === c.id;
                  return (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => setCollectionId(c.id)}
                      aria-pressed={on}
                      className={`rounded-xl border p-3 text-left transition ${on ? "border-foreground bg-surface" : "border-line hover:bg-surface/60"}`}
                    >
                      <span className="flex items-center gap-3">
                        <Avatar seed={Number(c.id.slice(1)) + 100} hue={c.hue} image={c.image} alt="" grid={8} className="h-10 w-10 shrink-0 rounded-lg" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{c.name}</span>
                          <span className="block truncate font-mono text-xs text-muted">{c.symbol ?? `${c.address.slice(0, 6)}…${c.address.slice(-4)}`}</span>
                        </span>
                        <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] ${on ? "border-foreground bg-foreground text-white" : "border-line"}`}>
                          {on ? "✓" : ""}
                        </span>
                      </span>
                      <span className="mt-2.5 flex items-center gap-2 text-xs text-muted">
                        <span className="rounded-md bg-surface px-2 py-0.5">Robinhood</span>
                        {c.supply ? <span>{c.supply.toLocaleString("en-US")} items</span> : null}
                      </span>
                    </button>
                  );
                })}
                {!filtered.length ? <p className="py-6 text-center text-sm text-muted sm:col-span-2">No collections match.</p> : null}
              </div>
              <Err>{show("collection", 2)}</Err>

              {selected ? (
                <Notice>
                  <strong className="block font-medium text-foreground">Nothing for the winner to do</strong>
                  The vault contract buys {selected.name} itself through Seaport. Nothing but an NFT purchase can move its ETH, because there is no
                  withdraw function. The prize reaches the winner on its own; they never have to claim or post an address.
                </Notice>
              ) : null}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <header>
                <h2 className="font-display text-2xl font-medium">NFT policy</h2>
                <p className="mt-1 text-sm text-muted">Where the NFTs go once your vault owns them, and what you charge.</p>
              </header>

              <div className="space-y-2.5">
                {(
                  [
                    { key: "burn", title: "Burn them", text: "Every NFT is sent to a dead address. The collection's circulating supply shrinks for good." },
                    { key: "airdrop", title: "Airdrop to holders", text: "Each NFT goes to one holder, odds proportional to their balance. Bigger bags, better odds." },
                  ] as { key: Policy; title: string; text: string }[]
                ).map((p) => (
                  <button
                    type="button"
                    key={p.key}
                    onClick={() => setPolicy(p.key)}
                    aria-pressed={policy === p.key}
                    className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition ${policy === p.key ? "border-foreground bg-surface" : "border-line hover:bg-surface/60"}`}
                  >
                    <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${policy === p.key ? "border-foreground" : "border-line"}`}>
                      {policy === p.key ? <span className="h-2.5 w-2.5 rounded-full bg-foreground" /> : null}
                    </span>
                    <span>
                      <span className="block font-medium">{p.title}</span>
                      <span className="mt-1 block text-sm text-muted">{p.text}</span>
                    </span>
                  </button>
                ))}
              </div>

              <Notice>
                <strong className="font-medium text-foreground">This is permanent.</strong> It is set at launch and locked on-chain: you cannot change it
                afterwards, so holders can rely on it.
              </Notice>
              <p className="text-sm leading-relaxed text-muted">
                A vault is shared by every coin paired with that collection, so each NFT is charged to the coin whose fees paid for it, and that
                coin&apos;s policy is the one applied. Coins that burn and coins that airdrop never pool their fees to buy the same NFT.
              </p>

              <div className="rounded-2xl border border-line p-5">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium">Creator tax</span>
                  <span className="font-mono text-2xl">{tax.toFixed(2)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={launchParams.maxCreatorTaxPct}
                  step={0.05}
                  value={tax}
                  onChange={(e) => setTax(Number(e.target.value))}
                  aria-label="Creator tax"
                  className="mt-3 w-full accent-[#1f1b16]"
                  style={{ background: `linear-gradient(to right, var(--foreground) ${sliderPct}%, var(--line) ${sliderPct}%)`, height: 4, borderRadius: 999, appearance: "none" }}
                />
                <div className="mt-2 flex justify-between font-mono text-[11px] text-muted">
                  <span>0%</span>
                  <span>max {launchParams.maxCreatorTaxPct.toFixed(2)}%</span>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted">
                  An extra cut of every trade, on top of {brand.launchpad}&apos;s base creator share. It lands in your router and splits the same way:{" "}
                  {brand.split.vault}% to the vault, {brand.split.treasury}% to the treasury. {brand.launchpad} caps it at{" "}
                  {launchParams.maxCreatorTaxPct.toFixed(2)}% and snapshots it at launch.
                </p>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <header>
                <h2 className="font-display text-2xl font-medium">Review</h2>
                <p className="mt-1 text-sm text-muted">Check it over. One transaction does all of it.</p>
              </header>

              <dl className="divide-y divide-line rounded-2xl border border-line text-sm">
                {[
                  ["Name", name || "-"],
                  ["Ticker", ticker || "-"],
                  ["Sweeps for", selected?.name ?? "-"],
                  ["NFT policy", policy === "airdrop" ? "Airdrop to holders" : "Burn them"],
                  ["Creator tax", `${tax.toFixed(2)}%`],
                  ["Links", [website, x, telegram].filter(Boolean).join(" · ") || "None"],
                  ["Dev buy", devBuy && Number(devBuy) > 0 ? `${devBuy} ETH` : "None"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-6 px-4 py-3">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-right font-medium break-all">{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="rounded-2xl border border-line bg-surface/50 p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">{brand.launchpad} launch fee</span>
                  <span className="font-mono">{launchParams.ponsLaunchFeeEth.toFixed(4)} ETH</span>
                </div>
                <div className="mt-2 flex justify-between border-t border-line pt-2 font-medium">
                  <span>Total</span>
                  <span className="font-mono">{launchParams.ponsLaunchFeeEth.toFixed(4)} ETH</span>
                </div>
                <p className="mt-2 text-xs text-muted">One transaction, plus gas.</p>
              </div>

              <ul className="list-disc space-y-2.5 pl-5 text-sm leading-relaxed text-muted marker:text-line">
                <li>
                  Every wei your coin earns splits <strong className="font-medium text-foreground">{brand.split.vault}% to the {collectionName} vault, {brand.split.treasury}% to the treasury</strong>, a
                  constant in the router&apos;s bytecode, with no owner and no upgrade path.
                </li>
                <li>
                  The collection is <strong className="font-medium text-foreground">fixed forever</strong>. Supply is fixed at {launchParams.supply.toLocaleString("en-US")}. Your tax is
                  snapshotted at launch.
                </li>
                <li>
                  At {launchParams.graduationEth.toFixed(4)} ETH of curve liquidity the coin graduates to a locked Uniswap v4 pool, and fees keep routing the same way.
                </li>
              </ul>

              <p className="rounded-2xl border border-line p-4 text-xs text-muted">
                At {tax.toFixed(2)}% tax, every 1 ETH traded sends about <span className="font-mono text-foreground">{eth(fees.vault)} ETH</span> to the vault and{" "}
                <span className="font-mono text-foreground">{eth(fees.treasury)} ETH</span> to the treasury. Estimate. Contracts are unaudited until stated otherwise.
              </p>

              {wallet.error ? <p className="text-xs text-accent">{wallet.error}</p> : null}
              {launchError ? <p className="rounded-2xl border border-accent/40 bg-accent/5 p-3 text-sm text-accent">{launchError}</p> : null}
              <button
                type="button"
                disabled={action.disabled}
                onClick={action.onClick}
                className="w-full rounded-md bg-foreground px-6 py-3.5 text-sm font-medium text-white transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {action.label}
              </button>
              {action.note ? <p className="text-xs text-muted">{action.note}</p> : null}
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-5">
            {backButton}
            {step < 4 ? (
              <button type="button" onClick={next} className="rounded-md bg-foreground px-6 py-2.5 text-sm font-medium text-white hover:opacity-85">
                Continue →
              </button>
            ) : null}
          </div>
        </section>

        <aside className="ink order-1 h-fit overflow-hidden rounded-2xl lg:sticky lg:top-28 lg:order-2">
          <p className="placard border-b border-ink-line px-5 py-3">Your coin, before launch</p>
          <div className="flex items-center gap-3 p-5">
            {previewSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewSrc} alt="" className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <span className="grid h-12 w-12 place-items-center rounded-full bg-ink-2 font-medium text-on-ink-muted">{(ticker || "T")[0]}</span>
            )}
            <div className="min-w-0">
              <p className="font-display truncate text-2xl leading-tight font-medium">{ticker || "TICKER"}</p>
              <p className="truncate text-sm text-on-ink-muted">{name || "Unnamed coin"}</p>
            </div>
          </div>
          <dl className="space-y-2.5 border-t border-ink-line p-5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-on-ink-muted">Sweeps</dt>
              <dd className="flex min-w-0 items-center gap-2 text-right">
                {selected ? (
                  <>
                    <Avatar seed={Number(selected.id.slice(1)) + 100} hue={selected.hue} image={selected.image} alt="" grid={6} className="h-4 w-4 shrink-0 rounded-full" />
                    <span className="truncate">{selected.name}</span>
                  </>
                ) : (
                  <span className="text-on-ink-muted">not chosen</span>
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-on-ink-muted">NFT policy</dt>
              <dd className="rounded-md border border-ink-line px-2.5 py-0.5 text-xs">{policy === "airdrop" ? "Airdrop" : "Burn"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-on-ink-muted">Creator tax</dt>
              <dd>{tax.toFixed(2)}%</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-on-ink-muted">Supply</dt>
              <dd>{launchParams.supply.toLocaleString("en-US")}</dd>
            </div>
          </dl>
          <div className="border-t border-ink-line bg-ink-2 p-5 text-sm">
            <div className="mb-3 flex justify-between font-mono text-[11px] tracking-wide text-on-ink-muted uppercase">
              <span>Per 1 ETH traded</span>
              <span>estimate</span>
            </div>
            <div className="mb-3 flex h-1.5 overflow-hidden rounded-full bg-ink-line">
              <span className="bg-accent" style={{ width: pct(fees.vault) }} />
              <span className="bg-on-ink-muted" style={{ width: pct(fees.treasury) }} />
              <span className="bg-[#5a524a]" style={{ width: pct(fees.pons) }} />
            </div>
            <dl className="space-y-2">
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-on-ink-muted"><span className="h-2 w-2 rounded-full bg-accent" />{selected ? `${selected.name} vault` : "Collection vault"}</dt>
                <dd className="font-mono">{eth(fees.vault)} ETH</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-on-ink-muted"><span className="h-2 w-2 rounded-full bg-on-ink-muted" />{brand.name} treasury</dt>
                <dd className="font-mono">{eth(fees.treasury)} ETH</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-on-ink-muted"><span className="h-2 w-2 rounded-full bg-[#5a524a]" />{brand.launchpad}</dt>
                <dd className="font-mono">{eth(fees.pons)} ETH</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-on-ink-muted">
              {launchParams.curveFeePct.toFixed(2)}% curve fee ({launchParams.curveFeeToRouterPct}% of it to your router, the rest to {brand.launchpad}), plus your{" "}
              {tax.toFixed(2)}% tax. Your router splits {brand.split.vault} / {brand.split.treasury}. Excludes gas, {brand.launchpad}&apos;s launch-block anti-snipe tax, and any
              post-graduation pool fee.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
