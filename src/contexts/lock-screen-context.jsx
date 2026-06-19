"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@/contexts/auth-context";
import { LockScreenOverlay } from "@/components/auth/lock-screen-overlay";
import { apiRequest, ApiError, formatApiErrorMessage } from "@/lib/api";
import { isScreenLocked, setScreenLocked } from "@/lib/auth-storage";

const LockScreenContext = createContext(null);

/** Lock the app after this many milliseconds without user activity. */
const IDLE_LOCK_MS = 10 * 60 * 1000;

const IDLE_ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "click", "wheel", "scroll"];

export function LockScreenProvider({ children }) {
  const { user, loading } = useAuth();
  const [locked, setLocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!loading && user && isScreenLocked()) {
      setLocked(true);
    }
  }, [loading, user]);

  useEffect(() => {
    if (!user) {
      setScreenLocked(false);
      setLocked(false);
      setError(null);
    }
  }, [user]);

  const lockScreen = useCallback(() => {
    setScreenLocked(true);
    setLocked(true);
    setError(null);
  }, []);

  useEffect(() => {
    if (loading || !user || locked) return undefined;

    let timeoutId = window.setTimeout(() => {
      lockScreen();
    }, IDLE_LOCK_MS);

    function resetIdleTimer() {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        lockScreen();
      }, IDLE_LOCK_MS);
    }

    IDLE_ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, resetIdleTimer, { passive: true });
    });

    return () => {
      window.clearTimeout(timeoutId);
      IDLE_ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, resetIdleTimer);
      });
    };
  }, [loading, user, locked, lockScreen]);

  const unlockScreen = useCallback(async (password) => {
    setUnlocking(true);
    setError(null);
    try {
      await apiRequest("/auth/verify-password", {
        method: "POST",
        body: { password },
      });
      setScreenLocked(false);
      setLocked(false);
      setError(null);
    } catch (e) {
      const body = e instanceof ApiError ? e.body : null;
      setError(formatApiErrorMessage(body, e instanceof Error ? e.message : "Incorrect password."));
    } finally {
      setUnlocking(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      locked,
      lockScreen,
      unlockScreen,
      unlocking,
      error,
      clearError: () => setError(null),
    }),
    [locked, lockScreen, unlockScreen, unlocking, error],
  );

  return (
    <LockScreenContext.Provider value={value}>
      {children}
      {locked && user ? (
        <LockScreenOverlay
          user={user}
          unlocking={unlocking}
          error={error}
          onUnlock={unlockScreen}
        />
      ) : null}
    </LockScreenContext.Provider>
  );
}

export function useLockScreen() {
  const ctx = useContext(LockScreenContext);
  if (!ctx) throw new Error("useLockScreen must be used within LockScreenProvider");
  return ctx;
}
