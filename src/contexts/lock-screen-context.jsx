"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/contexts/auth-context";
import { LockScreenOverlay } from "@/components/auth/lock-screen-overlay";
import { apiRequest, ApiError, formatApiErrorMessage } from "@/lib/api";
import { isScreenLocked, setScreenLocked, getStoredUser } from "@/lib/auth-storage";
import { getAuthClientId } from "@/lib/workspace-session";
import { mergeSecuritySettings } from "@/lib/security-settings";
import { pinUnlockEnabled } from "@/lib/hotel-pin-device";
import { isHospitalityIndustry } from "@/lib/org-settings-tabs";
import { getPasskeyAssertion, webAuthnSupported } from "@/lib/webauthn";

const LockScreenContext = createContext(null);

const IDLE_ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "click", "wheel", "scroll"];

const DEFAULT_SCREEN_LOCK_MINUTES = 5;
const DEFAULT_SESSION_IDLE_MINUTES = 60;

export function LockScreenProvider({ children }) {
  const { user, loading, logout, screenLockMinutes, sessionIdleMinutes, capabilities, applyOperatorSession } = useAuth();
  const [locked, setLocked] = useState(() => {
    if (typeof window === "undefined") return false;
    return isScreenLocked();
  });
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState(null);
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [operators, setOperators] = useState([]);
  const [operatorsLoading, setOperatorsLoading] = useState(false);
  const [selectedOperator, setSelectedOperator] = useState(null);
  const [enablePinUnlock, setEnablePinUnlock] = useState(false);
  const lockTimeoutRef = useRef(null);
  const logoutTimeoutRef = useRef(null);
  const lockedRef = useRef(false);

  const hotelLockEnabled = isHospitalityIndustry(capabilities);
  const lockMinutes = hotelLockEnabled ? screenLockMinutes() || DEFAULT_SCREEN_LOCK_MINUTES : null;
  const idleMinutes = sessionIdleMinutes() || DEFAULT_SESSION_IDLE_MINUTES;

  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  useEffect(() => {
    if (loading) return;
    if (user && isScreenLocked()) {
      if (!isHospitalityIndustry(capabilities)) {
        setScreenLocked(false);
        setLocked(false);
        return;
      }
      setLocked(true);
      return;
    }
    if (!user) {
      setLocked(false);
      setError(null);
      setPasskeyAvailable(false);
    }
  }, [loading, user, capabilities]);

  useEffect(() => {
    if (!locked || !user || !webAuthnSupported()) {
      setPasskeyAvailable(false);
      return undefined;
    }

    let cancelled = false;
    void apiRequest("/auth/passkeys")
      .then((res) => {
        if (!cancelled) {
          setPasskeyAvailable(Array.isArray(res?.passkeys) && res.passkeys.length > 0);
        }
      })
      .catch(() => {
        if (!cancelled) setPasskeyAvailable(false);
      });

    return () => {
      cancelled = true;
    };
  }, [locked, user]);

  const lockScreen = useCallback(() => {
    setScreenLocked(true);
    setLocked(true);
    setError(null);
    setSelectedOperator(null);
  }, []);

  const clearIdleTimers = useCallback(() => {
    if (lockTimeoutRef.current != null) {
      window.clearTimeout(lockTimeoutRef.current);
      lockTimeoutRef.current = null;
    }
    if (logoutTimeoutRef.current != null) {
      window.clearTimeout(logoutTimeoutRef.current);
      logoutTimeoutRef.current = null;
    }
  }, []);

  const scheduleIdleTimers = useCallback(() => {
    clearIdleTimers();

    logoutTimeoutRef.current = window.setTimeout(() => {
      void logout();
    }, idleMinutes * 60 * 1000);

    if (lockMinutes != null && !lockedRef.current) {
      lockTimeoutRef.current = window.setTimeout(() => {
        lockScreen();
      }, lockMinutes * 60 * 1000);
    }
  }, [clearIdleTimers, idleMinutes, lockMinutes, lockScreen, logout]);

  useEffect(() => {
    if (loading || !user) {
      clearIdleTimers();
      return undefined;
    }

    scheduleIdleTimers();

    function onActivity() {
      scheduleIdleTimers();
    }

    IDLE_ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, onActivity, { passive: true });
    });

    return () => {
      clearIdleTimers();
      IDLE_ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, onActivity);
      });
    };
  }, [loading, user, lockMinutes, idleMinutes, locked, scheduleIdleTimers, clearIdleTimers]);

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
      setSelectedOperator(null);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setError("Your session ended. Use Sign out below, then sign in again.");
      } else {
        const body = e instanceof ApiError ? e.body : null;
        setError(formatApiErrorMessage(body, e instanceof Error ? e.message : "Incorrect password."));
      }
    } finally {
      setUnlocking(false);
    }
  }, []);

  const unlockWithPasskey = useCallback(async () => {
    setUnlocking(true);
    setError(null);
    try {
      const begin = await apiRequest("/auth/passkeys/unlock/options", { method: "POST" });
      const credential = await getPasskeyAssertion(begin.options);
      await apiRequest("/auth/passkeys/unlock", {
        method: "POST",
        body: {
          challenge_token: begin.challenge_token,
          credential,
        },
      });
      setScreenLocked(false);
      setLocked(false);
      setSelectedOperator(null);
      setError(null);
    } catch (e) {
      if (e?.name === "NotAllowedError") {
        setError("Passkey unlock was cancelled.");
      } else if (e instanceof ApiError && e.status === 401) {
        setError("Your session ended. Use Sign out below, then sign in again.");
      } else {
        const body = e instanceof ApiError ? e.body : null;
        setError(formatApiErrorMessage(body, e instanceof Error ? e.message : "Passkey unlock failed."));
        if (e instanceof ApiError && /no passkeys/i.test(String(e.message ?? ""))) {
          setPasskeyAvailable(false);
        }
      }
    } finally {
      setUnlocking(false);
    }
  }, []);

  const loadOperators = useCallback(async () => {
    if (!pinUnlockEnabled(capabilities)) {
      setOperators([]);
      setEnablePinUnlock(false);
      return;
    }
    setOperatorsLoading(true);
    try {
      const res = await apiRequest("/auth/pin-operators", { loading: false, reportIssues: false });
      setOperators(Array.isArray(res?.data) ? res.data : []);
      if (res?.enable_pin_unlock != null) {
        setEnablePinUnlock(pinUnlockEnabled(capabilities) && Boolean(res.enable_pin_unlock));
      }
    } catch {
      setOperators([]);
    } finally {
      setOperatorsLoading(false);
    }
  }, [capabilities]);

  useEffect(() => {
    if (!locked || !user) return undefined;
    const security = mergeSecuritySettings(capabilities?.module_settings);
    setEnablePinUnlock(pinUnlockEnabled(capabilities) && security.enable_pin_unlock !== false);
    void loadOperators();
    return undefined;
  }, [locked, user, capabilities, loadOperators]);

  const unlockWithPin = useCallback(async (pin) => {
    const target = selectedOperator ?? user;
    if (!target?.id) return;
    setUnlocking(true);
    setError(null);
    try {
      if (String(target.id) === String(user?.id)) {
        await apiRequest("/auth/unlock-pin", { method: "POST", body: { pin } });
      } else {
        const res = await apiRequest("/auth/switch-operator", {
          method: "POST",
          body: {
            user_id: target.id,
            pin,
            client_id: getAuthClientId(),
          },
        });
        if (!res?.same_user && applyOperatorSession) {
          await applyOperatorSession(res);
        }
      }
      setScreenLocked(false);
      setLocked(false);
      setSelectedOperator(null);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setError("Your session ended. Use Sign out below, then sign in again.");
      } else {
        const body = e instanceof ApiError ? e.body : null;
        setError(formatApiErrorMessage(body, e instanceof Error ? e.message : "Incorrect PIN."));
      }
    } finally {
      setUnlocking(false);
    }
  }, [applyOperatorSession, selectedOperator, user]);

  const value = useMemo(
    () => ({
      locked,
      lockScreen,
      unlockScreen,
      unlockWithPasskey,
      unlockWithPin,
      unlocking,
      error,
      passkeyAvailable,
      clearError: () => setError(null),
    }),
    [locked, lockScreen, unlockScreen, unlockWithPasskey, unlockWithPin, unlocking, error, passkeyAvailable],
  );

  const lockUser = user ?? (locked ? getStoredUser() : null);
  const pinUnlockAvailable = Boolean(
    enablePinUnlock && (lockUser?.has_login_pin || selectedOperator?.has_login_pin),
  );
  const changeUserAvailable = enablePinUnlock && operators.length > 0;

  return (
    <LockScreenContext.Provider value={value}>
      {children}
      {locked && lockUser ? (
        <LockScreenOverlay
          user={lockUser}
          unlocking={unlocking}
          error={error}
          passkeyAvailable={passkeyAvailable}
          pinUnlockAvailable={pinUnlockAvailable}
          changeUserAvailable={changeUserAvailable}
          operators={operators}
          operatorsLoading={operatorsLoading}
          selectedOperator={selectedOperator}
          onSelectOperator={(row) => {
            setSelectedOperator(row);
            setError(null);
          }}
          onChangeUser={() => {
            setError(null);
            void loadOperators();
          }}
          onBackToLastUser={() => {
            setSelectedOperator(null);
            setError(null);
          }}
          onUnlock={unlockScreen}
          onUnlockWithPin={unlockWithPin}
          onUnlockWithPasskey={unlockWithPasskey}
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
