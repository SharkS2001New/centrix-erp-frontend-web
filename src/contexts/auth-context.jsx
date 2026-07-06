"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { apiRequest, revokeServerAuthSession, isSessionConflictError } from "@/lib/api";
import {
  clearSession,
  getStoredCapabilities,
  getStoredLoginChannel,
  getStoredMemberships,
  getStoredOrganization,
  getStoredUser,
  getStoredWorkspace,
  hasAuthSession,
  isScreenLocked,
  patchStoredUser,
  setSession,
  setStoredCapabilities,
  setStoredWorkspace,
} from "@/lib/auth-storage";
import { clearStoredActiveSession } from "@/lib/pos-till";
import { setStoredCompanyCode } from "@/lib/tenant-config";
import { resolveGeneralSettings } from "@/lib/format";
import { buildAccessContext, resolveHasPermission, resolveTillFloatNavFlag } from "@/lib/access-control";
import { resolvePostLoginPath, workspaceLoginChannel, workspacesFromCapabilities } from "@/lib/workspaces";
import { applyWorkspaceSession } from "@/lib/workspace-session";
import { POS_LOGIN_CHANNEL, WEB_LOGIN_CHANNEL } from "@/lib/login-channels";
import { useCookieAuth } from "@/lib/auth-config";
import { invalidateReferenceDataCache } from "@/lib/reference-data-cache";
import { invalidateReportBuilderTemplateCache } from "@/lib/report-builder-templates";
import { capabilitiesVersionChanged } from "@/lib/capabilities-sync";

const CLIENT_ID_KEY = "pos_erp_client_id";
const CAPABILITIES_REFRESH_MS = 30_000;

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
  const [capabilitiesRefreshing, setCapabilitiesRefreshing] = useState(false);
  const capabilitiesRefreshAt = useRef(0);
  const capabilitiesRefreshPromise = useRef(null);

  const refreshCapabilities = useCallback(async ({ force = false } = {}) => {
    const now = Date.now();
    const cached = getStoredCapabilities();
    if (
      !force &&
      capabilitiesRefreshPromise.current == null &&
      now - capabilitiesRefreshAt.current < CAPABILITIES_REFRESH_MS
    ) {
      return cached;
    }
    if (!force && capabilitiesRefreshPromise.current) {
      return capabilitiesRefreshPromise.current;
    }

    setCapabilitiesRefreshing(true);
    const promise = (async () => {
      try {
        const caps = await apiRequest("/erp/capabilities", { loading: false, reportIssues: false });
        const versionBumped = capabilitiesVersionChanged(cached, caps);
        setCapabilities(caps);
        setStoredCapabilities(caps);
        capabilitiesRefreshAt.current = Date.now();
        if (versionBumped) {
          invalidateReferenceDataCache();
        }
        return caps;
      } finally {
        capabilitiesRefreshPromise.current = null;
        setCapabilitiesRefreshing(false);
      }
    })();

    capabilitiesRefreshPromise.current = promise;
    return promise;
  }, []);

  const clearMustChangePassword = useCallback(() => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, must_change_password: false };
      patchStoredUser({ must_change_password: false });
      return next;
    });
  }, []);

  const updateProfile = useCallback((userUpdates) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...userUpdates };
      patchStoredUser(userUpdates);
      return next;
    });
  }, []);

  const applyPasswordExpiry = useCallback((status) => {
    if (!status) return;
    setCapabilities((prev) => ({ ...(prev ?? {}), password_expiry: status }));
  }, []);

  const completePasswordChange = useCallback(async (res) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        ...(res?.user ?? {}),
        must_change_password: false,
      };
      patchStoredUser({ must_change_password: false, ...(res?.user ?? {}) });
      return next;
    });
    if (res?.capabilities) {
      setCapabilities(res.capabilities);
      setStoredCapabilities(res.capabilities);
      return res.capabilities;
    }
    if (res?.password_expiry) {
      setCapabilities((prev) => ({ ...(prev ?? {}), password_expiry: res.password_expiry }));
    } else {
      setCapabilities((prev) => {
        if (!prev?.password_expiry) return prev;
        return {
          ...prev,
          password_expiry: {
            ...prev.password_expiry,
            forced: false,
            expired: false,
            reason: null,
          },
        };
      });
    }
    try {
      return await refreshCapabilities();
    } catch {
      return res?.capabilities ?? null;
    }
  }, [refreshCapabilities]);

  const skipPasswordExpiry = useCallback(async () => {
    const res = await apiRequest("/auth/skip-password-expiry", { method: "POST" });
    applyPasswordExpiry(res.password_expiry ?? null);
    return res;
  }, [applyPasswordExpiry]);

  const passwordExpiry = capabilities?.password_expiry ?? null;

  const applyAuthPayload = useCallback(async (res, channel = WEB_LOGIN_CHANNEL) => {
    setSession(res.token, res.user, res.organization, res.memberships ?? [], channel);
    setStoredCompanyCode(res.organization?.company_code);
    setUser(res.user);
    setOrganization(res.organization ?? null);
    setMemberships(res.memberships ?? []);
    setLoginChannel(channel);
    try {
      const caps =
        res.capabilities ??
        (await apiRequest("/erp/capabilities", { loading: false, reportIssues: false }));
      setCapabilities(caps);
      setStoredCapabilities(caps);
      return caps;
    } catch (e) {
      await revokeServerAuthSession();
      clearSession();
      setUser(null);
      setOrganization(null);
      setMemberships([]);
      setCapabilities(null);
      setLoginChannel(null);
      throw e;
    }
  }, []);

  useLayoutEffect(() => {
    const stored = getStoredUser();
    if (!hasAuthSession() || !stored) {
      setLoading(false);
      return;
    }
    setUser(stored);
    setOrganization(getStoredOrganization());
    setMemberships(getStoredMemberships());
    setLoginChannel(getStoredLoginChannel() ?? WEB_LOGIN_CHANNEL);
    const cachedCaps = getStoredCapabilities();
    if (cachedCaps) {
      setCapabilities(cachedCaps);
    }
    setLoading(false);

    refreshCapabilities()
      .then((caps) => {
        syncStoredWorkspace(caps?.workspaces ?? []);
      })
      .catch(async () => {
        if (isScreenLocked()) return;
        if (cachedCaps) return;
        await revokeServerAuthSession();
        clearSession();
        setUser(null);
        setOrganization(null);
        setMemberships([]);
        setCapabilities(null);
      });
  }, [refreshCapabilities]);

  useEffect(() => {
    if (!hasAuthSession()) return undefined;

    const refreshOnFocus = () => {
      refreshCapabilities().catch(() => {});
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshOnFocus();
      }
    };

    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
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

      if (useCookieAuth && !forceLogout && hasAuthSession()) {
        await revokeServerAuthSession();
      }

      const performLogin = (force) =>
        apiRequest("/auth/login", {
          method: "POST",
          body: {
            company_code: companyCode.trim() ? companyCode.trim().toUpperCase() : "",
            username,
            password,
            client_id: getClientId(),
            login_channel: WEB_LOGIN_CHANNEL,
            ...(force ? { force_logout: true } : {}),
          },
          token: null,
        });

      let res;
      try {
        res = await performLogin(forceLogout);
      } catch (err) {
        if (!forceLogout && useCookieAuth && isSessionConflictError(err)) {
          await revokeServerAuthSession();
          res = await performLogin(true);
        } else {
          throw err;
        }
      }

      const caps = await applyAuthPayload(res, WEB_LOGIN_CHANNEL);
      if (res.must_change_password || res.user?.must_change_password) {
        router.replace("/change-password");
        return caps;
      }
      if (res.password_expiry?.forced) {
        router.replace("/change-password?reason=expired");
        return caps;
      }
      const ctx = buildAccessContext({
        user: res.user,
        organization: res.organization,
        capabilities: caps,
        requireTillFloat: resolveTillFloatNavFlag(caps),
      });
      const workspaces = workspacesFromCapabilities(caps);
      if (workspaces.length === 1) {
        const only = workspaces[0];
        if (workspaceLoginChannel(only.id) === POS_LOGIN_CHANNEL) {
          void switchWorkspace(only.id);
        } else {
          setStoredWorkspace(only.id);
        }
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
      if (res.must_change_password || res.user?.must_change_password) {
        router.replace("/change-password");
        return caps;
      }
      if (res.password_expiry?.forced) {
        router.replace("/change-password?reason=expired");
        return caps;
      }
      const ctx = buildAccessContext({
        user: res.user,
        organization: res.organization,
        capabilities: caps,
        requireTillFloat: resolveTillFloatNavFlag(caps),
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
      if (hasAuthSession()) {
        await revokeServerAuthSession();
        if (!useCookieAuth) {
          await apiRequest("/auth/logout", { method: "POST" });
        }
      }
    } catch {
      /* ignore */
    }
    clearSession();
    clearStoredActiveSession();
    invalidateReferenceDataCache();
    invalidateReportBuilderTemplateCache();
    capabilitiesRefreshAt.current = 0;
    capabilitiesRefreshPromise.current = null;
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
      capabilitiesRefreshing,
      login,
      loginChannel,
      switchOrganization,
      switchWorkspace,
      logout,
      refreshCapabilities,
      clearMustChangePassword,
      updateProfile,
      applyPasswordExpiry,
      completePasswordChange,
      skipPasswordExpiry,
      passwordExpiry,
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
      sessionIdleMinutes: () => capabilities?.session_idle_minutes ?? 60,
      screenLockMinutes: () => capabilities?.screen_lock_minutes ?? 5,
    }),
    [
      user,
      organization,
      memberships,
      capabilities,
      loading,
      capabilitiesRefreshing,
      login,
      loginChannel,
      switchOrganization,
      switchWorkspace,
      logout,
      refreshCapabilities,
      clearMustChangePassword,
      updateProfile,
      applyPasswordExpiry,
      completePasswordChange,
      skipPasswordExpiry,
      passwordExpiry,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
