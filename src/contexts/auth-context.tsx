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
import type { Capabilities, LoginResponse, User } from "@/types/api";

type AuthState = {
  user: User | null;
  capabilities: Capabilities | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshCapabilities: () => Promise<void>;
  isModuleEnabled: (key: string) => boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshCapabilities = useCallback(async () => {
    const caps = await apiRequest<Capabilities>("/erp/capabilities");
    setCapabilities(caps);
  }, []);

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser<User>();
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
    async (username: string, password: string) => {
      const res = await apiRequest<LoginResponse>("/auth/login", {
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
    setUser(null);
    setCapabilities(null);
    router.replace("/login");
  }, [router]);

  const value = useMemo<AuthState>(
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
