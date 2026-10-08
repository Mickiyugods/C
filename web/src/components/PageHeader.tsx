import type { ReactNode } from "react";

/** The ink band every page opens with: a placard, a serif title and one line on what the page is for. */
export function PageHeader({
  eyebrow,
  title,
  children,
  aside,
  width = "max-w-6xl",
}: {
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
  width?: string;
}) {
  return (
    <div className="px-3 pt-3 sm:px-4 sm:pt-4">
      <header className="ink overflow-hidden rounded-2xl">
        <div className={`mx-auto flex flex-col gap-8 px-6 py-14 md:flex-row md:items-end md:justify-between lg:px-10 lg:py-20 ${width}`}>
          <div className="min-w-0">
            <p className="placard rise flex items-center gap-2">
              <span className="diamond" aria-hidden /> {eyebrow}
            </p>
            <h1 className="font-display rise mt-6 text-[clamp(2.6rem,5.4vw,4.4rem)] leading-[0.95] font-medium" style={{ "--i": 1 } as React.CSSProperties}>
              {title}
            </h1>
            {children ? (
              <div className="rise mt-6 max-w-2xl leading-relaxed text-on-ink-muted" style={{ "--i": 2 } as React.CSSProperties}>
                {children}
              </div>
            ) : null}
          </div>
          {aside ? <div className="rise shrink-0" style={{ "--i": 3 } as React.CSSProperties}>{aside}</div> : null}
        </div>
      </header>
    </div>
  );
}
