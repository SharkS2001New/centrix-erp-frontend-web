"use client";

import dynamic from "next/dynamic";
import { AuthProvider } from "@/contexts/auth-context";
import { LockScreenProvider } from "@/contexts/lock-screen-context";
import { ThemeProvider } from "@/contexts/theme-context";
import { PosSessionProvider } from "@/contexts/pos-session-context";
import { ConfirmProvider } from "@/contexts/confirm-context";
import { AppToaster } from "@/components/shared/app-toaster";
import { NotificationRealtimeProvider } from "@/components/realtime/notification-realtime-provider";
import { OrgThemeBridge } from "@/components/layout/org-theme-bridge";

const BrowserEngagePrompts = dynamic(
  () =>
    import("@/components/pwa/browser-engage-prompts").then((m) => m.BrowserEngagePrompts),
  { ssr: false },
);

export function Providers({ children }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <OrgThemeBridge>
          <LockScreenProvider>
            <PosSessionProvider>
              <ConfirmProvider>
                <NotificationRealtimeProvider>
                  {children}
                  <AppToaster />
                  <BrowserEngagePrompts />
                </NotificationRealtimeProvider>
              </ConfirmProvider>
            </PosSessionProvider>
          </LockScreenProvider>
        </OrgThemeBridge>
      </AuthProvider>
    </ThemeProvider>
  );
}
