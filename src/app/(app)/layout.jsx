import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PasswordExpiryGuard } from "@/components/auth/password-expiry-guard";

export default function AppLayout({ children }) {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <PasswordExpiryGuard>{children}</PasswordExpiryGuard>
      </Suspense>
    </AppShell>
  );
}
