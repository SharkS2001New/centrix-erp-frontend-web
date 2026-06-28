import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PasswordExpiryGuard } from "@/components/auth/password-expiry-guard";
import { AppRouteLoading } from "@/components/shared/app-route-loading";

export default function AppLayout({ children }) {
  return (
    <AppShell>
      <Suspense fallback={<AppRouteLoading label="Loading page…" />}>
        <PasswordExpiryGuard>{children}</PasswordExpiryGuard>
      </Suspense>
    </AppShell>
  );
}
