"use client";

import { SpaShell } from "@/components/spa/shell";
import { SpaProvider } from "@/lib/spa/store";

export default function SpaLayout({ children }) {
  return (
    <SpaProvider>
      <SpaShell>{children}</SpaShell>
    </SpaProvider>
  );
}
