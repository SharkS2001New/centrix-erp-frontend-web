"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/auth-context";
import { notifyNotificationsChanged } from "@/lib/notification-events";
import { notifyError, notifyPriceUpdate } from "@/lib/notify";
import {
  createNotificationEcho,
  disconnectNotificationEcho,
  isRealtimeConfigured,
} from "@/lib/realtime/notification-echo";

/**
 * Subscribes to private user notification events over Reverb and refreshes the bell.
 * Price / markup updates toast immediately (same path as approval outcome popups).
 * Falls back silently to polling when Reverb env vars are not configured.
 */
export function NotificationRealtimeProvider({ children }) {
  const { user } = useAuth();
  const echoRef = useRef(null);
  const lastPricingToastAtRef = useRef(0);

  useEffect(() => {
    if (!isRealtimeConfigured() || !user?.id) {
      disconnectNotificationEcho(echoRef.current);
      echoRef.current = null;
      return undefined;
    }

    let cancelled = false;
    let channel = null;
    const channelName = `user.${user.id}`;

    (async () => {
      try {
        const echo = await createNotificationEcho();
        if (cancelled || !echo) return;

        echoRef.current = echo;
        channel = echo.private(channelName);

        channel.listen(".notification.created", (payload) => {
          notifyNotificationsChanged();

          const type = String(payload?.type ?? "");
          const message = String(payload?.message ?? "").trim();
          if (type !== "catalog_pricing" || !message) return;

          const now = Date.now();
          if (now - lastPricingToastAtRef.current < 1200) return;
          lastPricingToastAtRef.current = now;

          const severity = String(payload?.severity ?? "info");
          if (severity === "danger" || severity === "error") {
            notifyError(message);
          } else {
            notifyPriceUpdate(message);
          }
        });

        channel.error((error) => {
          if (process.env.NODE_ENV === "development") {
            console.warn("[realtime] notification channel error", error);
          }
        });
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[realtime] failed to connect", error);
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        channel?.stopListening(".notification.created");
        echoRef.current?.leave(channelName);
      } catch {
        /* ignore */
      }
      disconnectNotificationEcho(echoRef.current);
      echoRef.current = null;
    };
  }, [user?.id]);

  return children;
}
