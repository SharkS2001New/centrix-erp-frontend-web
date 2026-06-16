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
  getStoredMemberships,
  getStoredOrganization,
  getStoredUser,
  getToken,
  setSession,
} from "@/lib/auth-storage";
import { clearStoredActiveSession } from "@/lib/pos-till";
import { getCompanyCode, setStoredCompanyCode } from "@/lib/tenant-config";
import { resolveGeneralSettings } from "@/lib/format";
import { isOrgScopedPermission, isPlatformOrganization } from "@/lib/admin-scope";
import { WEB_LOGIN_CHANNEL } from "@/lib/login-channels";

const CLIENT_ID_KEY = "pos_erp_client_id";

function getClientId() {
  if (typeof window === "undefined") return "";
  let clientId = localStorage.getItem(CLIENT_ID_KEY);
  if (!clientId) {
    clientId = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, clientId);
  }
  return clientId;
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [organization, setOrganization] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [capabilities, setCapabilities] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshCapabilities = useCallback(async () => {
    const caps = await apiRequest("/erp/capabilities");
    setCapabilities(caps);
  }, []);

  const applyAuthPayload = useCallback(
    async (res) => {
      setSession(res.token, res.user, res.organization, res.memberships ?? []);
      setStoredCompanyCode(res.organization?.company_code);
      setUser(res.user);
      setOrganization(res.organization ?? null);
      setMemberships(res.memberships ?? []);
      await refreshCapabilities();
    },
    [refreshCapabilities],
  );

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored) {
      setLoading(false);
      return;
    }
    setUser(stored);
    setOrganization(getStoredOrganization());
    setMemberships(getStoredMemberships());
    refreshCapabilities()
      .catch(() => {
        clearSession();
        setUser(null);
        setOrganization(null);
        setMemberships([]);
      })
      .finally(() => setLoading(false));
  }, [refreshCapabilities]);

  const login = useCallback(
    async (companyCode, username, password, options = {}) => {
      const { forceLogout = false } = options;
      const res = await apiRequest("/auth/login", {
        method: "POST",
        body: {
          company_code: companyCode.trim() ? companyCode.trim().toUpperCase() : "",
          username,
          password,
          client_id: getClientId(),
          login_channel: WEB_LOGIN_CHANNEL,
          ...(forceLogout ? { force_logout: true } : {}),
        },
        token: null,
      });
      await applyAuthPayload(res);
      router.replace("/dashboard");
    },
    [applyAuthPayload, router],
  );

  const switchOrganization = useCallback(
    async (companyCode) => {
      const res = await apiRequest("/auth/switch-organization", {
        method: "POST",
        body: {
          company_code: companyCode.trim().toUpperCase(),
          client_id: getClientId(),
          login_channel: WEB_LOGIN_CHANNEL,
        },
      });
      await applyAuthPayload(res);
      router.refresh();
    },
    [applyAuthPayload, router],
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
    setOrganization(null);
    setMemberships([]);
    setCapabilities(null);
    router.replace("/login");
  }, [router]);

  const value = useMemo(
    () => ({
      user,
      organization,
      memberships,
      capabilities,
      loading,
      login,
      switchOrganization,
      logout,
      refreshCapabilities,
      isModuleEnabled: (key) => capabilities?.modules?.[key] ?? false,
      isSuperAdmin: () => Boolean(user?.is_super_admin || capabilities?.is_super_admin),
      hasPermission: (code) => {
        const superAdmin = Boolean(user?.is_super_admin || capabilities?.is_super_admin);
        if (superAdmin) {
          if (isPlatformOrganization(organization) && isOrgScopedPermission(code)) {
            return false;
          }
          return true;
        }
        if (user?.is_admin || capabilities?.is_admin) return true;
        if (!code) return true;
        return capabilities?.permissions?.[code] ?? false;
      },
      isOrgWide: () => (capabilities?.access_scope ?? user?.access_scope) === "org" || user?.is_admin,
      generalSettings: () => resolveGeneralSettings(capabilities),
      sessionIdleMinutes: () => capabilities?.session_idle_minutes ?? 30,
    }),
    [
      user,
      organization,
      memberships,
      capabilities,
      loading,
      login,
      switchOrganization,
      logout,
      refreshCapabilities,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
