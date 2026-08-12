"use client";

import { useEffect, useState } from "react";

/** Tick every second while `sinceMs` is set — for live elapsed labels. */
export function useLiveElapsedMs(sinceMs) {
  const [elapsed, setElapsed] = useState(() =>
    sinceMs ? Math.max(0, Date.now() - sinceMs) : 0,
  );

  useEffect(() => {
    if (!sinceMs) {
      setElapsed(0);
      return undefined;
    }
    const tick = () => setElapsed(Math.max(0, Date.now() - sinceMs));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [sinceMs]);

  return elapsed;
}
