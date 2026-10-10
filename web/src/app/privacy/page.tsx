import { brand } from "@/config/brand";
import { PageHeader } from "@/components/PageHeader";

export const metadata = { title: "Privacy" };

const items: [string, string][] = [
  ["What we collect", `${brand.name} has no accounts. The site does not ask for your name or email. When you connect a wallet we read its public address in your browser to show your coins and wins.`],
  ["What is public", "Everything you do on chain is public and permanent: your wallet address, the coins you launch, your trades and the NFTs you receive. We cannot hide or delete it."],
  ["Servers", "Our servers read public blockchain data to build the pages you see. Standard server logs (such as IP address and pages requested) may be kept for a short time for security and debugging."],
  ["Images", "If image upload is enabled, a file you upload is sent to our server and stored on IPFS through a storage provider. IPFS content is public and cannot be removed once published."],
  ["Cookies and tracking", "The site does not use advertising cookies or third-party analytics trackers. If that changes, this page will say so before it happens."],
  ["Third parties", "Your wallet provider, the RPC provider your wallet uses, Pons, Seaport and the image hosts of collections have their own privacy practices that apply when you use them."],
  ["Your choices", "You can use the site without connecting a wallet. Disconnecting your wallet in its own app stops the site from seeing your address."],
  ["Contact", "Add a contact address here before launching publicly."],
];

export default function Page() {
  return (
    <>
      <PageHeader eyebrow="Reference" title={<>Privacy</>} width="max-w-3xl"></PageHeader>
      <section className="mx-auto max-w-3xl px-5 py-14">
        <p className="rounded-2xl bg-surface p-4 text-sm text-muted">
          Draft for review. This policy describes how the site is built today and has not been reviewed by a lawyer. Check it against the privacy laws that apply to your users before launching publicly.
        </p>
        <dl className="mt-8 space-y-6">
          {items.map(([title, text]) => (
            <div key={title}>
              <dt className="font-medium">{title}</dt>
              <dd className="mt-1.5 text-[15px] leading-relaxed text-muted">{text}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
