// Shown while the server reads the coin from chain (the page is force-dynamic). Mirrors the real
// layout so the jump to content is small.
const Bar = ({ className = "" }: { className?: string }) => <div className={`animate-pulse rounded bg-surface ${className}`} />;
const Card = ({ className = "", children }: { className?: string; children?: React.ReactNode }) => (
  <div className={`rounded-2xl border border-line bg-white p-5 ${className}`}>{children}</div>
);

export default function Loading() {
  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto max-w-6xl px-5 pt-6 pb-5">
          <Bar className="h-3 w-28" />
          <div className="mt-4 flex items-start justify-between gap-5">
            <div className="flex min-w-0 items-start gap-4">
              <Bar className="h-16 w-16 shrink-0 rounded-xl" />
              <div className="space-y-2">
                <Bar className="h-8 w-56" />
                <Bar className="h-3 w-72" />
              </div>
            </div>
            <div className="hidden space-y-2 sm:block">
              <Bar className="ml-auto h-3 w-20" />
              <Bar className="ml-auto h-8 w-28" />
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-8 px-5 py-10 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-8">
          <div className="ink flex items-center justify-between rounded-2xl border border-accent/50 p-6">
            <div className="w-2/3 space-y-2">
              <Bar className="h-3 w-16 bg-ink-2" />
              <Bar className="h-6 w-48 bg-ink-2" />
              <Bar className="h-3 w-full bg-ink-2" />
            </div>
            <Bar className="h-10 w-32 rounded-full bg-ink-2" />
          </div>
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <Bar className="h-8 w-32" />
              <Bar className="h-7 w-48 rounded-full" />
            </div>
            <Bar className="h-[340px] w-full rounded-lg" />
          </Card>
          <Card className="h-24" />
          <Card className="h-28" />
        </div>
        <aside className="space-y-8">
          <Card className="h-80" />
          <Card className="h-40" />
          <Card className="h-44" />
        </aside>
      </section>
    </>
  );
}
