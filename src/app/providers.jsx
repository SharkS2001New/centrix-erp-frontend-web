"use client";

import { AuthProvider } from "@/contexts/auth-context";
import { LockScreenProvider } from "@/contexts/lock-screen-context";
import { ThemeProvider } from "@/contexts/theme-context";
import { PosSessionProvider } from "@/contexts/pos-session-context";
import { ConfirmProvider } from "@/contexts/confirm-context";
import { AppToaster } from "@/components/shared/app-toaster";
import { NotificationRealtimeProvider } from "@/components/realtime/notification-realtime-provider";

export function Providers({ children }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <LockScreenProvider>
          <PosSessionProvider>
            <ConfirmProvider>
              <NotificationRealtimeProvider>
                {children}
                <AppToaster />
              </NotificationRealtimeProvider>
            </ConfirmProvider>
          </PosSessionProvider>
        </LockScreenProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
