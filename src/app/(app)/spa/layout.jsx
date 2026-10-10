"use client";

import { usePathname } from "next/navigation";
import { BusinessChooser } from "@/components/spa/shell";
import { SpaProvider, useSpa } from "@/lib/spa/store";
import { usePageNavigationReady } from "@/lib/use-page-navigation-ready";

function SpaGate({ children }) {
  const pathname = usePathname();
  const spa = useSpa();
  // Dismiss the shell "Opening page…" cover on each SPA route. These screens are
  // not in the tab registry, so nothing else signals that the page has settled.
  usePageNavigationReady(pathname);
  if (pathname === "/spa/settings") return children;
  if (!spa.ready) {
    return <p className="theme-subtext text-sm">Loading SPA & Kinyozi…</p>;
  }
  if (!spa.businessType) {
    return <BusinessChooser onChoose={spa.setBusinessType} />;
  }
  return children;
}

export default function SpaLayout({ children }) {
  return (
    <SpaProvider>
      <SpaGate>{children}</SpaGate>
    </SpaProvider>
  );
}
