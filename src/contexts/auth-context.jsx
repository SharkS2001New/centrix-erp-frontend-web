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
  getStoredLoginChannel,
  getStoredMemberships,
  getStoredOrganization,
  getStoredUser,
  getStoredWorkspace,
  getToken,
  setSession,
  setStoredWorkspace,
} from "@/lib/auth-storage";
import { clearStoredActiveSession } from "@/lib/pos-till";
import { setStoredCompanyCode } from "@/lib/tenant-config";
import { resolveGeneralSettings } from "@/lib/format";
import { buildAccessContext, resolveHasPermission } from "@/lib/access-control";
import { resolvePostLoginPath, workspaceLoginChannel, workspacesFromCapabilities } from "@/lib/workspaces";
import { applyWorkspaceSession } from "@/lib/workspace-session";
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

function syncStoredWorkspace(workspaces) {
  const stored = getStoredWorkspace();
  if (stored && !workspaces.some((w) => w.id === stored)) {
    setStoredWorkspace(workspaces.length === 1 ? workspaces[0].id : null);
    return;
  }
  if (workspaces.length === 1 && !stored) {
    setStoredWorkspace(workspaces[0].id);
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [organization, setOrganization] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [capabilities, setCapabilities] = useState(null);
  const [loginChannel, setLoginChannel] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshCapabilities = useCallback(async () => {
    const caps = await apiRequest("/erp/capabilities");
    setCapabilities(caps);
  }, []);

  const applyAuthPayload = useCallback(async (res, channel = WEB_LOGIN_CHANNEL) => {
    setSession(res.token, res.user, res.organization, res.memberships ?? [], channel);
    setStoredCompanyCode(res.organization?.company_code);
    setUser(res.user);
    setOrganization(res.organization ?? null);
    setMemberships(res.memberships ?? []);
    setLoginChannel(channel);
    const caps = await apiRequest("/erp/capabilities");
    setCapabilities(caps);
    return caps;
  }, []);

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
    setLoginChannel(getStoredLoginChannel() ?? WEB_LOGIN_CHANNEL);
    refreshCapabilities()
      .then((caps) => {
        syncStoredWorkspace(caps?.workspaces ?? []);
      })
      .catch(() => {
        clearSession();
        setUser(null);
        setOrganization(null);
        setMemberships([]);
      })
      .finally(() => setLoading(false));
  }, [refreshCapabilities]);

  const switchWorkspace = useCallback(async (workspaceId) => {
    const res = await applyWorkspaceSession(workspaceId);
    setUser(res.user);
    setOrganization(res.organization ?? null);
    setMemberships(res.memberships ?? []);
    setLoginChannel(workspaceLoginChannel(workspaceId));
    return res;
  }, []);

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
      const caps = await applyAuthPayload(res, WEB_LOGIN_CHANNEL);
      const ctx = buildAccessContext({
        user: res.user,
        organization: res.organization,
        capabilities: caps,
        requireTillFloat: caps?.require_till_float,
      });
      const workspaces = workspacesFromCapabilities(caps);
      if (workspaces.length === 1) {
        await switchWorkspace(workspaces[0].id);
      } else if (workspaces.length > 1) {
        setStoredWorkspace(null);
      }
      router.replace(resolvePostLoginPath(ctx, caps));
    },
    [applyAuthPayload, router, switchWorkspace],
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
      const caps = await applyAuthPayload(res, WEB_LOGIN_CHANNEL);
      const ctx = buildAccessContext({
        user: res.user,
        organization: res.organization,
        capabilities: caps,
        requireTillFloat: caps?.require_till_float,
      });
      const workspaces = workspacesFromCapabilities(caps);
      const stored = getStoredWorkspace();
      if (!workspaces.some((w) => w.id === stored)) {
        setStoredWorkspace(workspaces.length === 1 ? workspaces[0].id : null);
      }
      router.replace(resolvePostLoginPath(ctx, caps));
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
    setLoginChannel(null);
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
      loginChannel,
      switchOrganization,
      switchWorkspace,
      logout,
      refreshCapabilities,
      isModuleEnabled: (key) => capabilities?.modules?.[key] ?? false,
      isSuperAdmin: () => Boolean(user?.is_super_admin || capabilities?.is_super_admin),
      hasPermission: (code) =>
        resolveHasPermission({
          user,
          organization,
          capabilities,
          code,
          isSuperAdmin: () => Boolean(user?.is_super_admin || capabilities?.is_super_admin),
        }),
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
      loginChannel,
      switchOrganization,
      switchWorkspace,
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
