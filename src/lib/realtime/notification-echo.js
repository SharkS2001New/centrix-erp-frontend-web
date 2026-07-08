import { getToken } from "@/lib/auth-storage";
import { useCookieAuth } from "@/lib/auth-config";
import { apiV1BaseUrl } from "@/lib/api-base-url";

export function isRealtimeConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_REVERB_APP_KEY &&
      process.env.NEXT_PUBLIC_REVERB_HOST,
  );
}

function reverbScheme() {
  return process.env.NEXT_PUBLIC_REVERB_SCHEME === "https" ? "https" : "http";
}

function reverbPort() {
  const raw = process.env.NEXT_PUBLIC_REVERB_PORT;
  if (raw === undefined || raw === "") {
    return reverbScheme() === "https" ? 443 : 8080;
  }
  return Number(raw);
}

/** @returns {Promise<import('laravel-echo').default | null>} */
export async function createNotificationEcho() {
  if (!isRealtimeConfigured() || typeof window === "undefined") {
    return null;
  }

  const [{ default: Echo }, { default: Pusher }] = await Promise.all([
    import("laravel-echo"),
    import("pusher-js"),
  ]);

  window.Pusher = Pusher;

  const scheme = reverbScheme();
  const port = reverbPort();
  const token = getToken();
  const authEndpoint = `${apiV1BaseUrl()}/broadcasting/auth`;
  const transports = scheme === "https" ? ["wss"] : ["ws", "wss"];

  const shared = {
    broadcaster: "reverb",
    key: process.env.NEXT_PUBLIC_REVERB_APP_KEY,
    wsHost: process.env.NEXT_PUBLIC_REVERB_HOST,
    wsPort: port,
    wssPort: port,
    forceTLS: scheme === "https",
    enabledTransports: transports,
    disableStats: true,
  };

  if (useCookieAuth) {
    return new Echo({
      ...shared,
      authorizer: (channel) => ({
        authorize: (socketId, callback) => {
          fetch(authEndpoint, {
            method: "POST",
            credentials: "include",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              socket_id: socketId,
              channel_name: channel.name,
            }),
          })
            .then((response) => {
              if (!response.ok) {
                throw new Error(`Broadcast auth failed (${response.status})`);
              }
              return response.json();
            })
            .then((data) => callback(null, data))
            .catch((error) => callback(error, null));
        },
      }),
    });
  }

  return new Echo({
    ...shared,
    authEndpoint,
    auth: {
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
  });
}

/** @param {import('laravel-echo').default | null} echo */
export function disconnectNotificationEcho(echo) {
  if (!echo) return;
  try {
    echo.disconnect();
  } catch {
    /* ignore */
  }
}
