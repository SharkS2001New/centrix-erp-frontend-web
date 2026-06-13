"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiRequest, ApiError } from "@/lib/api";
import {
  clearStoredActiveSession,
  getStoredActiveSession,
  setStoredActiveSession,
} from "@/lib/pos-till";
import { useAuth } from "@/contexts/auth-context";

const PosSessionContext = createContext(null);

export function PosSessionProvider({ children }) {
  const { user, capabilities } = useAuth();
  const [activeSession, setActiveSession] = useState(null);
  const [suspendedSession, setSuspendedSession] = useState(null);
  const [sessionReport, setSessionReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const hasPosTill = useMemo(() => {
    const perms = capabilities?.permissions ?? {};
    return Boolean(perms["pos.till"] ?? capabilities?.modules?.["sales.pos"]);
  }, [capabilities]);

  const verifySession = useCallback(async (session) => {
    if (!session?.id) return null;
    try {
      const res = await apiRequest(`/till-float-sessions/${session.id}`);
      if (String(res.status).toLowerCase() !== "open") {
        clearStoredActiveSession();
        return null;
      }
      setStoredActiveSession(res);
      return res;
    } catch {
      clearStoredActiveSession();
      return null;
    }
  }, []);

  const findOpenSessionForUser = useCallback(async (userId) => {
    if (!userId) return null;
    try {
      const res = await apiRequest("/till-float-sessions", {
        searchParams: {
          per_page: 10,
          "filter[status]": "open",
          "filter[cashier_id]": userId,
        },
      });
      return (res.data ?? []).find((row) => String(row.status).toLowerCase() === "open") ?? null;
    } catch {
      return null;
    }
  }, []);

  const findSuspendedSessionForUser = useCallback(async (userId) => {
    if (!userId) return null;
    try {
      const res = await apiRequest("/till-float-sessions", {
        searchParams: {
          per_page: 10,
          "filter[status]": "suspended",
          "filter[cashier_id]": userId,
        },
      });
      return (res.data ?? []).find((row) => String(row.status).toLowerCase() === "suspended") ?? null;
    } catch {
      return null;
    }
  }, []);

  const refreshReport = useCallback(async (sessionId) => {
    const id = sessionId ?? activeSession?.id;
    if (!id) {
      setSessionReport(null);
      return null;
    }
    try {
      const report = await apiRequest(`/pos/sessions/${id}/x-report`);
      setSessionReport(report);
      return report;
    } catch {
      setSessionReport(null);
      return null;
    }
  }, [activeSession?.id]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      const stored = getStoredActiveSession();
      let verified = stored ? await verifySession(stored) : null;
      if (!verified && user?.id) {
        const recovered = await findOpenSessionForUser(user.id);
        if (recovered) {
          verified = await verifySession(recovered);
        }
      }
      const suspended = !verified && user?.id ? await findSuspendedSessionForUser(user.id) : null;
      if (!cancelled) {
        setActiveSession(verified);
        setSuspendedSession(suspended);
        if (verified?.id) {
          await refreshReport(verified.id);
        }
        setLoading(false);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [verifySession, refreshReport, findOpenSessionForUser, findSuspendedSessionForUser, user?.id]);

  const openSession = useCallback(
    async ({ till_id, branch_id, working_amount, payment_type }) => {
      setBusy(true);
      setError(null);
      try {
        const session = await apiRequest("/pos/sessions/open", {
          method: "POST",
          body: {
            till_id,
            branch_id,
            working_amount: Number(working_amount) || 0,
            payment_type: payment_type || "CASH",
          },
        });
        setStoredActiveSession(session);
        setActiveSession(session);
        await refreshReport(session.id);
        return session;
      } catch (e) {
        const message = e instanceof ApiError ? e.message : "Could not open session";
        setError(message);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [refreshReport],
  );

  const addFloat = useCallback(
    async ({ new_float, payment_type }) => {
      if (!activeSession?.id) return null;
      setBusy(true);
      setError(null);
      try {
        const session = await apiRequest(`/pos/sessions/${activeSession.id}/add-float`, {
          method: "POST",
          body: {
            new_float: Number(new_float),
            payment_type: payment_type || "CASH",
          },
        });
        setStoredActiveSession(session);
        setActiveSession(session);
        await refreshReport(session.id);
        return session;
      } catch (e) {
        const message = e instanceof ApiError ? e.message : "Could not add float";
        setError(message);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [activeSession?.id, refreshReport],
  );

  const recordCashMovement = useCallback(
    async ({ type, amount, reason }) => {
      if (!activeSession?.id) return null;
      setBusy(true);
      setError(null);
      try {
        const session = await apiRequest(`/pos/sessions/${activeSession.id}/cash-movement`, {
          method: "POST",
          body: {
            type,
            amount: Number(amount),
            reason: reason?.trim() || null,
          },
        });
        setStoredActiveSession(session);
        setActiveSession(session);
        await refreshReport(session.id);
        return session;
      } catch (e) {
        const message = e instanceof ApiError ? e.message : "Could not record cash movement";
        setError(message);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [activeSession?.id, refreshReport],
  );

  const refreshActiveSession = useCallback(async () => {
    if (!activeSession?.id) return null;
    const verified = await verifySession(activeSession);
    setActiveSession(verified);
    if (verified?.id) await refreshReport(verified.id);
    return verified;
  }, [activeSession, verifySession, refreshReport]);

  const suspendSession = useCallback(async () => {
    if (!activeSession?.id) return null;
    setBusy(true);
    setError(null);
    try {
      const session = await apiRequest(`/pos/sessions/${activeSession.id}/suspend`, {
        method: "POST",
      });
      clearStoredActiveSession();
      setActiveSession(null);
      setSessionReport(null);
      setSuspendedSession(session);
      return session;
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Could not suspend session";
      setError(message);
      throw e;
    } finally {
      setBusy(false);
    }
  }, [activeSession?.id]);

  const resumeSession = useCallback(
    async (sessionId) => {
      const id = sessionId ?? suspendedSession?.id ?? activeSession?.id;
      if (!id) return null;
      setBusy(true);
      setError(null);
      try {
        const session = await apiRequest(`/pos/sessions/${id}/resume`, {
          method: "POST",
        });
        setStoredActiveSession(session);
        setActiveSession(session);
        setSuspendedSession(null);
        await refreshReport(session.id);
        return session;
      } catch (e) {
        const message = e instanceof ApiError ? e.message : "Could not resume session";
        setError(message);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [activeSession?.id, refreshReport, suspendedSession?.id],
  );

  const closeSession = useCallback(
    async ({ closing_amount, expected_amount, notes, closing_denominations }) => {
      if (!activeSession?.id) return null;
      setBusy(true);
      setError(null);
      try {
        const res = await apiRequest(`/pos/sessions/${activeSession.id}/close`, {
          method: "POST",
          body: {
            closing_amount: Number(closing_amount),
            expected_amount:
              expected_amount != null ? Number(expected_amount) : sessionReport?.expected_cash,
            notes: notes?.trim() || null,
            closing_denominations: closing_denominations ?? null,
          },
        });
        clearStoredActiveSession();
        setActiveSession(null);
        setSuspendedSession(null);
        setSessionReport(null);
        return res;
      } catch (e) {
        const message = e instanceof ApiError ? e.message : "Could not close session";
        setError(message);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [activeSession?.id, sessionReport?.expected_cash],
  );

  const clearSession = useCallback(() => {
    clearStoredActiveSession();
    setActiveSession(null);
    setSuspendedSession(null);
    setSessionReport(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      capabilities,
      hasPosTill,
      activeSession,
      suspendedSession,
      sessionReport,
      loading,
      busy,
      error,
      setError,
      openSession,
      addFloat,
      recordCashMovement,
      suspendSession,
      resumeSession,
      closeSession,
      clearSession,
      refreshReport,
      refreshActiveSession,
      verifySession,
      tillId: activeSession?.till_id ?? null,
      floatSessionId: activeSession?.id ?? null,
    }),
    [
      user,
      capabilities,
      hasPosTill,
      activeSession,
      suspendedSession,
      sessionReport,
      loading,
      busy,
      error,
      openSession,
      addFloat,
      recordCashMovement,
      suspendSession,
      resumeSession,
      closeSession,
      clearSession,
      refreshReport,
      refreshActiveSession,
      verifySession,
    ],
  );

  return <PosSessionContext.Provider value={value}>{children}</PosSessionContext.Provider>;
}

export function usePosSession() {
  const ctx = useContext(PosSessionContext);
  if (!ctx) throw new Error("usePosSession must be used within PosSessionProvider");
  return ctx;
}
