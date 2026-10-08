export function Pager({
  page,
  pages,
  onChange,
}: {
  page: number;
  pages: number;
  onChange: (p: number) => void;
}) {
  const btn =
    "grid h-8 w-8 place-items-center rounded-md text-muted transition hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className="flex items-center gap-1 font-mono text-sm text-muted">
      <button className={btn} disabled={page <= 1} onClick={() => onChange(1)} aria-label="First page">«</button>
      <button className={btn} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">‹</button>
      <span className="px-2">
        {page} / {pages}
      </span>
      <button className={btn} disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page">›</button>
      <button className={btn} disabled={page >= pages} onClick={() => onChange(pages)} aria-label="Last page">»</button>
    </div>
  );
}
