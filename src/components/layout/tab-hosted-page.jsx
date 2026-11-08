"use client";

import dynamic from "next/dynamic";
import { useTabWorkspace } from "@/contexts/tab-workspace-context";

/**
 * Tiny App Router page for screens hosted by the tab workspace registry.
 * Avoids statically importing the screen module into the route chunk — with tabs
 * on, this page returns null and never loads the screen (registry React.lazy does).
 *
 * @param {() => Promise<Record<string, unknown>>} loader
 * @param {string} [exportName="default"]
 */
export function createTabHostedPage(loader, exportName = "default") {
  const LazyScreen = dynamic(
    () =>
      loader().then((mod) => {
        const Comp = exportName === "default" ? mod.default : mod[exportName];
        if (!Comp) {
          throw new Error(`Tab hosted page missing export "${exportName}"`);
        }
        return Comp;
      }),
    { ssr: false },
  );

  return function TabHostedPage() {
    const { enabled } = useTabWorkspace();
    if (enabled) return null;
    return <LazyScreen />;
  };
}
