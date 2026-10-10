import { brand } from "@/config/brand";
import { PageHeader } from "@/components/PageHeader";

export const metadata = { title: "Terms" };

const items: [string, string][] = [
  ["What this is", `${brand.name} is software that helps people create coins on a third-party launchpad and pair them with NFT collections on ${brand.chain.name}. It is provided as is, without warranties of any kind.`],
  ["No advice", "Nothing on this site is financial, investment, legal or tax advice. Coins and NFTs can lose all of their value. You are solely responsible for your decisions."],
  ["Unaudited contracts", "The smart contracts are unaudited until this page says otherwise. Contracts cannot be changed after deployment, so a bug can cause permanent loss of funds, and nobody can reverse it."],
  ["Irreversible actions", "Transactions on a blockchain are final. The collection and NFT policy a creator picks, the fee split, and the vault rules are permanent. Vaults have no withdrawal function."],
  ["Third parties", "Coins are created and traded on Pons, and NFTs are bought through Seaport. We do not control them and are not affiliated with Pons, Seaport, OpenSea or Robinhood Markets. Collection names and images belong to their owners."],
  ["Your responsibilities", "You must be allowed to use this software where you live, keep your wallet and keys safe, and make sure what you upload (names, images, links) does not infringe anyone's rights or break the law."],
  ["Content", "Creators are responsible for the names, images and descriptions of the coins they launch. Coins are created on a public blockchain and cannot be removed by us. We may hide content from this website."],
  ["Giveaways", "Giveaways are decided by a verifiable random number, but the list of holders is posted by a keeper. Winners are not guaranteed, and a giveaway can be delayed if the keeper is unavailable."],
  ["Limitation of liability", "To the fullest extent the law allows, we are not liable for any loss arising from your use of the site, the contracts or any third-party service."],
  ["Changes", "We may change this site and these terms. Changes to the website do not alter contracts that are already deployed."],
];

export default function Page() {
  return (
    <>
      <PageHeader eyebrow="Reference" title={<>Terms</>} width="max-w-3xl"></PageHeader>
      <section className="mx-auto max-w-3xl px-5 py-14">
        <p className="rounded-2xl bg-surface p-4 text-sm text-muted">
          Draft for review. These terms were written for the project and have not been reviewed by a lawyer. Have them checked for the countries you serve before launching publicly.
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
