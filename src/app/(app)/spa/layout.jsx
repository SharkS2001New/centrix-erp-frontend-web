"use client";

import { usePathname } from "next/navigation";
import { BusinessChooser } from "@/components/spa/shell";
import { SpaProvider, useSpa } from "@/lib/spa/store";

function SpaGate({ children }) {
  const pathname = usePathname();
  const spa = useSpa();
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
