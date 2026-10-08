"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Headless live updater: re-reads the server component (curve, trades, holders) on an interval so the
// chart and tables stay current. No visible badge — it just keeps the page fresh. Pauses while the tab
// is hidden and refreshes immediately when the user returns.
export function LiveRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  const busy = useRef(false);

  useEffect(() => {
    const refresh = () => {
      if (document.hidden || busy.current) return;
      busy.current = true;
      router.refresh();
      // give the RSC round-trip a moment before allowing the next one
      setTimeout(() => (busy.current = false), 1500);
    };
    const timer = setInterval(refresh, intervalMs);
    const onVisible = () => !document.hidden && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, router]);

  return null;
}
