import { PageHeader } from "@/components/PageHeader";
import { Discover } from "@/components/Discover";

export const metadata = { title: "Explore" };

// The coin list is read from the chain on every request.
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <>
      <PageHeader eyebrow="The register" title={<>Every coin on <em className="text-accent">Curato</em></>}>
        Every coin launched on Curato, the collection it curates, and what its fees have bought.
      </PageHeader>
      <Discover />
    </>
  );
}
