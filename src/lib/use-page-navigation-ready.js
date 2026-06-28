"use client";

import { useEffect } from "react";
import { signalPageDataReady } from "@/lib/page-navigation-ready";

/** Hide in-page loading chrome until route data is ready — skeleton covers the transition. */
export function usePageNavigationReady(ready) {
  useEffect(() => {
    if (ready) signalPageDataReady();
  }, [ready]);
}
