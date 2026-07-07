"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/auth-context";
import { notifyNotificationsChanged } from "@/lib/notification-events";
import {
  createNotificationEcho,
  disconnectNotificationEcho,
  isRealtimeConfigured,
} from "@/lib/realtime/notification-echo";

/**
 * Subscribes to private user notification events over Reverb and refreshes the bell.
 * Falls back silently to polling when Reverb env vars are not configured.
 */
export function NotificationRealtimeProvider({ children }) {
  const { user } = useAuth();
  const echoRef = useRef(null);
  const channelRef = useRef(null);

  useEffect(() => {
    if (!isRealtimeConfigured() || !user?.id) {
      disconnectNotificationEcho(echoRef.current);
      echoRef.current = null;
      channelRef.current = null;
      return undefined;
    }

    const echo = createNotificationEcho();
    if (!echo) {
      return undefined;
    }

    echoRef.current = echo;

    const channelName = `user.${user.id}`;
    const channel = echo.private(channelName);
    channelRef.current = channel;

    channel.listen(".notification.created", () => {
      notifyNotificationsChanged();
    });

    channel.error((error) => {
      if (process.env.NODE_ENV === "development") {
        console.warn("[realtime] notification channel error", error);
      }
    });

    return () => {
      try {
        channel.stopListening(".notification.created");
        echo.leave(channelName);
      } catch {
        /* ignore */
      }
      disconnectNotificationEcho(echo);
      echoRef.current = null;
      channelRef.current = null;
    };
  }, [user?.id]);

  return children;
}
