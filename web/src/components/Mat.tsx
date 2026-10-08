import type { ReactNode } from "react";

/** A framed image with an optional placard line, the one way pictures are shown on Curato. */
export function Mat({ children, placard, className = "" }: { children: ReactNode; placard?: ReactNode; className?: string }) {
  return (
    <figure className={className}>
      <div className="mat">{children}</div>
      {placard ? <figcaption className="placard mt-2 flex items-center justify-between gap-2 px-0.5">{placard}</figcaption> : null}
    </figure>
  );
}
