import { AppShell } from "@/components/layout/app-shell";
import { MustChangePasswordGuard } from "@/components/auth/must-change-password-guard";

export default function AppLayout({ children }) {
  return (
    <AppShell>
      <MustChangePasswordGuard>{children}</MustChangePasswordGuard>
    </AppShell>
  );
}
