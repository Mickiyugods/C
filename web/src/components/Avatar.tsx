"use client";

import { useState } from "react";

function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    return s / 4294967296;
  };
}

type Props = {
  seed: number;
  hue: number;
  image?: string;
  alt?: string;
  className?: string;
  grid?: number;
};

export function Avatar({ seed, hue, image, alt = "", className = "", grid = 7 }: Props) {
  const [broken, setBroken] = useState(false);

  if (image && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt={alt}
        ref={(el) => {
          // The load can fail before hydration, in which case onError never fires.
          if (el && el.complete && el.naturalWidth === 0) queueMicrotask(() => setBroken(true));
        }}
        onError={() => setBroken(true)}
        className={`object-cover ${className}`}
      />
    );
  }

  const rand = rng(seed + 1);
  const half = Math.ceil(grid / 2);
  const fg = `hsl(${hue} 65% 45%)`;
  const fg2 = `hsl(${(hue + 150) % 360} 70% 55%)`;
  const bg = `hsl(${hue} 55% 94%)`;

  const cells: { x: number; y: number; c: string }[] = [];
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < half; x++) {
      const r = rand();
      if (r < 0.52) continue;
      const c = r > 0.86 ? fg2 : fg;
      cells.push({ x, y, c });
      if (grid - 1 - x !== x) cells.push({ x: grid - 1 - x, y, c });
    }
  }

  return (
    <svg
      viewBox={`0 0 ${grid} ${grid}`}
      preserveAspectRatio="xMidYMid slice"
      shapeRendering="crispEdges"
      role="img"
      aria-label={alt}
      className={className}
    >
      <rect width={grid} height={grid} fill={bg} />
      {cells.map((cell, i) => (
        <rect key={i} x={cell.x} y={cell.y} width="1" height="1" fill={cell.c} />
      ))}
    </svg>
  );
}
