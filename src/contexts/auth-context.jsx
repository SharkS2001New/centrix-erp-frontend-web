"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import {
  clearSession,
  getStoredUser,
  getToken,
  setSession,
} from "@/lib/auth-storage";
import { clearStoredActiveSession } from "@/lib/pos-till";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [capabilities, setCapabilities] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshCapabilities = useCallback(async () => {
    const caps = await apiRequest("/erp/capabilities");
    setCapabilities(caps);
  }, []);

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored) {
      setLoading(false);
      return;
    }
    setUser(stored);
    refreshCapabilities()
      .catch(() => {
        clearSession();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [refreshCapabilities]);

  const login = useCallback(
    async (username, password) => {
      const res = await apiRequest("/auth/login", {
        method: "POST",
        body: { username, password },
        token: null,
      });
      setSession(res.token, res.user);
      setUser(res.user);
      await refreshCapabilities();
      router.replace("/dashboard");
    },
    [refreshCapabilities, router],
  );

  const logout = useCallback(async () => {
    try {
      if (getToken()) {
        await apiRequest("/auth/logout", { method: "POST" });
      }
    } catch {
      /* ignore */
    }
    clearSession();
    clearStoredActiveSession();
    setUser(null);
    setCapabilities(null);
    router.replace("/login");
  }, [router]);

  const value = useMemo(
    () => ({
      user,
      capabilities,
      loading,
      login,
      logout,
      refreshCapabilities,
      isModuleEnabled: (key) => capabilities?.modules?.[key] ?? false,
    }),
    [user, capabilities, loading, login, logout, refreshCapabilities],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
