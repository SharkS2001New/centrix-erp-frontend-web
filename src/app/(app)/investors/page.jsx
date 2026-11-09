"use client";

import { createTabHostedPage } from "@/components/layout/tab-hosted-page";

/** Tab workspace hosts this screen from the registry when enabled. */
export default createTabHostedPage(
  () => import("@/components/tab-screens/investors"),
  "InvestorsScreen",
);
