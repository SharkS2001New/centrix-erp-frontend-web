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
import { apiRequest, revokeServerAuthSession, isSessionConflictError, ApiError } from "@/lib/api";
import { endServerAuthSession } from "@/lib/end-auth-session";
import {
  clearSession,
  getStoredCapabilities,
  getStoredLoginChannel,
  getStoredMemberships,
  getStoredOrganization,
  getStoredUser,
  getStoredWorkspace,
  getToken,
  hasAuthSession,
  isScreenLocked,
  patchStoredUser,
  setSession,
  setStoredCapabilities,
  setStoredWorkspace,
  setLoginWarnings,
} from "@/lib/auth-storage";
import { clearStoredActiveSession } from "@/lib/pos-till";
import { setStoredCompanyCode } from "@/lib/tenant-config";
import { resolveGeneralSettings } from "@/lib/format";
import { setActiveGeneralSettings } from "@/lib/general-settings";
import { buildAccessContext, resolveHasPermission, resolveHasNavPermission, resolveTillFloatNavFlag } from "@/lib/access-control";
import { resolvePostLoginPath } from "@/lib/workspace-navigation";
import { workspaceLoginChannel, workspacesFromCapabilities } from "@/lib/workspaces";
import { applyWorkspaceSession } from "@/lib/workspace-session";
import { POS_LOGIN_CHANNEL, WEB_LOGIN_CHANNEL } from "@/lib/login-channels";
import { useCookieAuth } from "@/lib/auth-config";
import { invalidateReferenceDataCache } from "@/lib/reference-data-cache";
import { invalidateReportBuilderTemplateCache } from "@/lib/report-builder-templates";
import {
  capabilitiesAccessStampChanged,
  capabilitiesVersionChanged,
  isBrowserReloadNavigation,
} from "@/lib/capabilities-sync";
import {
  clearLicenseWarningDismissed,
  licenseFromAuthState,
} from "@/lib/organization-license";
import { resolveSecurityTimeouts } from "@/lib/security-settings";
import { syncLocalPrintingFromCapabilities, clearLocalPrintingSettingsCache } from "@/lib/local-printing-settings";
import { syncHotelPinDeviceBinding } from "@/lib/hotel-pin-device";

const CLIENT_ID_KEY = "pos_erp_client_id";
/** Cheap version poll so demotions (Admin → Cashier) apply without a full refresh wait. */
const CAPABILITIES_VERSION_POLL_MS = 90_000;
const POS_CAPABILITIES_REFRESH_MS = 60_000;
const CAPABILITIES_REFRESH_MS = 90_000;

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
  const capabilitiesRefreshingRef = useRef(false);
  const capabilitiesRefreshAt = useRef(0);
  const capabilitiesRefreshPromise = useRef(null);
  const capabilitiesRefreshGen = useRef(0);

  const refreshCapabilities = useCallback(async ({ force = false, maxAgeMs = CAPABILITIES_REFRESH_MS } = {}) => {
    const now = Date.now();
    const cached = getStoredCapabilities();
    if (
      !force &&
      capabilitiesRefreshPromise.current == null &&
      now - capabilitiesRefreshAt.current < maxAgeMs
    ) {
      return cached;
    }
    if (!force && capabilitiesRefreshPromise.current) {
      return capabilitiesRefreshPromise.current;
    }

    const gen = ++capabilitiesRefreshGen.current;
    capabilitiesRefreshingRef.current = true;
    const promise = (async () => {
      try {
        const caps = await apiRequest("/erp/capabilities", {
          loading: false,
          reportIssues: false,
          // After settings/role saves, never join a GET that started before the mutation.
          dedupe: force ? false : undefined,
          cache: force ? "no-store" : undefined,
        });
        if (gen !== capabilitiesRefreshGen.current) {
          return caps;
        }
        const versionBumped = capabilitiesVersionChanged(cached, caps);
        setCapabilities(caps);
        setStoredCapabilities(caps);
        syncLocalPrintingFromCapabilities(caps);
        syncStoredWorkspace(caps?.workspaces ?? []);
        capabilitiesRefreshAt.current = Date.now();
        if (versionBumped) {
          invalidateReferenceDataCache();
        }
        return caps;
      } finally {
        if (gen === capabilitiesRefreshGen.current) {
          capabilitiesRefreshPromise.current = null;
          capabilitiesRefreshingRef.current = false;
        }
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
      syncHotelPinDeviceBinding({
        user: next,
        organization: getStoredOrganization(),
        capabilities: getStoredCapabilities(),
      });
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
      syncLocalPrintingFromCapabilities(res.capabilities);
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
  const organizationLicense = useMemo(
    () => licenseFromAuthState({ capabilities, organization }),
    [capabilities, organization],
  );

  useEffect(() => {
    setActiveGeneralSettings(capabilities ? resolveGeneralSettings(capabilities) : null);
  }, [capabilities]);

  const applyAuthPayload = useCallback(async (res, channel = WEB_LOGIN_CHANNEL) => {
    // Drop prior-org capabilities refresh so a late org-1 response cannot overwrite org-2.
    capabilitiesRefreshAt.current = 0;
    capabilitiesRefreshPromise.current = null;
    capabilitiesRefreshGen.current += 1;
    clearLocalPrintingSettingsCache();

    setSession(res.token, res.user, res.organization, res.memberships ?? [], channel);
    setStoredCompanyCode(res.organization?.company_code);
    setUser(res.user);
    setOrganization(res.organization ?? null);
    setMemberships(res.memberships ?? []);
    setLoginChannel(channel);
    if (Array.isArray(res.warnings) && res.warnings.length > 0) {
      setLoginWarnings(res.warnings);
    }
    try {
      const caps =
        res.capabilities ??
        (await apiRequest("/erp/capabilities", { loading: false, reportIssues: false }));
      setCapabilities(caps);
      setStoredCapabilities(caps);
      syncLocalPrintingFromCapabilities(caps);
      syncHotelPinDeviceBinding({
        user: res.user,
        organization: res.organization,
        capabilities: caps,
      });
      capabilitiesRefreshAt.current = Date.now();
      return caps;
    } catch (e) {
      await revokeServerAuthSession();
      clearSession();
      clearLocalPrintingSettingsCache();
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
      syncLocalPrintingFromCapabilities(cachedCaps);
    }
    setLoading(false);

    const channel = getStoredLoginChannel() ?? WEB_LOGIN_CHANNEL;
    const isPosSession = channel === POS_LOGIN_CHANNEL;
    const isReload = isBrowserReloadNavigation();

    // External POS: start from cached capabilities for instant boot, but refresh important
    // org settings in the background so toggles like KRA take effect without hard reload.
    if (isPosSession && cachedCaps && !isReload) {
      capabilitiesRefreshAt.current = Date.now();
      syncStoredWorkspace(cachedCaps?.workspaces ?? []);
      refreshCapabilities({ maxAgeMs: POS_CAPABILITIES_REFRESH_MS })
        .then((caps) => {
          syncStoredWorkspace(caps?.workspaces ?? []);
        })
        .catch(() => {});
      return;
    }

    // Always force on browser reload so role/permission changes show in the sidebar
    // after F5 (not only on external POS). Soft navigations still use the TTL cache.
    refreshCapabilities({ force: isReload })
      .then((caps) => {
        syncStoredWorkspace(caps?.workspaces ?? []);
      })
      .catch(async (err) => {
        if (isScreenLocked()) return;
        if (cachedCaps) return;
        // Network/5xx must not wipe a valid session — only real auth death.
        const status = err instanceof ApiError ? err.status : null;
        if (status !== 401 && status !== 403) return;
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
    const isPosSession = loginChannel === POS_LOGIN_CHANNEL;
    const refreshOnFocus = () => {
      refreshCapabilities({
        maxAgeMs: isPosSession ? POS_CAPABILITIES_REFRESH_MS : CAPABILITIES_REFRESH_MS,
      }).catch(() => {});
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
  }, [refreshCapabilities, loginChannel]);

  useEffect(() => {
    if (!hasAuthSession() || loginChannel !== POS_LOGIN_CHANNEL) return undefined;

    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      refreshCapabilities({ maxAgeMs: POS_CAPABILITIES_REFRESH_MS }).catch(() => {});
    }, POS_CAPABILITIES_REFRESH_MS);

    return () => window.clearInterval(interval);
  }, [refreshCapabilities, loginChannel]);

  useEffect(() => {
    if (!hasAuthSession()) return undefined;

    const syncIfAccessChanged = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      try {
        const stamp = await apiRequest("/erp/capabilities/version", {
          loading: false,
          reportIssues: false,
        });
        const storedCaps = getStoredCapabilities();
        const storedUser = getStoredUser();
        if (!capabilitiesAccessStampChanged(storedCaps, storedUser, stamp)) {
          return;
        }
        await refreshCapabilities({ force: true });
        const nextRoleId = stamp?.role_id != null ? Number(stamp.role_id) : null;
        if (Number.isFinite(nextRoleId)) {
          const userPatch = {
            role_id: nextRoleId,
            is_admin: Boolean(stamp?.is_admin),
          };
          patchStoredUser(userPatch);
          setUser((prev) => (prev ? { ...prev, ...userPatch } : prev));
        }
      } catch {
        /* network / 401 handled by api client */
      }
    };

    const interval = window.setInterval(syncIfAccessChanged, CAPABILITIES_VERSION_POLL_MS);
    window.addEventListener("focus", syncIfAccessChanged);
    document.addEventListener("visibilitychange", syncIfAccessChanged);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", syncIfAccessChanged);
      document.removeEventListener("visibilitychange", syncIfAccessChanged);
    };
  }, [refreshCapabilities]);

  const switchWorkspace = useCallback(async (workspaceId) => {
    const res = await applyWorkspaceSession(workspaceId);
    setUser(res.user);
    setOrganization(res.organization ?? null);
    setMemberships(res.memberships ?? []);
    setLoginChannel(workspaceLoginChannel(workspaceId));
    if (res.capabilities) {
      setCapabilities(res.capabilities);
    }
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

      if (res?.mfa_required) {
        return res;
      }

      const caps = await applyAuthPayload(res, WEB_LOGIN_CHANNEL);
      clearLicenseWarningDismissed();
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
      return caps;
    },
    [applyAuthPayload, router, switchWorkspace],
  );

  const finishAuthenticatedSession = useCallback(
    async (res) => {
      const caps = await applyAuthPayload(res, WEB_LOGIN_CHANNEL);
      clearLicenseWarningDismissed();
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
      return caps;
    },
    [applyAuthPayload, router, switchWorkspace],
  );

  const completeTwoFactorLogin = useCallback(
    async (challengeToken, code) => {
      const res = await apiRequest("/auth/2fa/verify", {
        method: "POST",
        body: {
          challenge_token: challengeToken,
          code: String(code).trim(),
        },
        token: null,
      });
      return finishAuthenticatedSession(res);
    },
    [finishAuthenticatedSession],
  );

  const loginWithPasskey = useCallback(
    async (challengeToken, credential, options = {}) => {
      const { forceLogout = false } = options;
      const res = await apiRequest("/auth/passkeys/login", {
        method: "POST",
        body: {
          challenge_token: challengeToken,
          credential,
          client_id: getClientId(),
          login_channel: WEB_LOGIN_CHANNEL,
          ...(forceLogout ? { force_logout: true } : {}),
        },
        token: null,
      });
      return finishAuthenticatedSession(res);
    },
    [finishAuthenticatedSession],
  );

  const completeTwoFactorWithPasskey = useCallback(
    async (passkeyChallengeToken, credential) => {
      const res = await apiRequest("/auth/2fa/passkey/verify", {
        method: "POST",
        body: {
          challenge_token: passkeyChallengeToken,
          credential,
        },
        token: null,
      });
      return finishAuthenticatedSession(res);
    },
    [finishAuthenticatedSession],
  );

  const loginWithPin = useCallback(
    async (companyCode, username, pin, options = {}) => {
      const { forceLogout = false } = options;

      if (useCookieAuth && !forceLogout && hasAuthSession()) {
        await revokeServerAuthSession();
      }

      const performLogin = (force) =>
        apiRequest("/auth/pin-login", {
          method: "POST",
          body: {
            company_code: companyCode.trim() ? companyCode.trim().toUpperCase() : "",
            username,
            pin,
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

      return finishAuthenticatedSession(res);
    },
    [finishAuthenticatedSession],
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
      clearLicenseWarningDismissed();
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
      invalidateReferenceDataCache();
    },
    [applyAuthPayload, router],
  );

  const logout = useCallback(async (options = {}) => {
    const reason = options.reason ? String(options.reason) : null;
    const hadSession = hasAuthSession();
    // Capture credentials before local clear so the server revoke can authenticate.
    const token = getToken();
    const loginPath = reason ? `/login?reason=${encodeURIComponent(reason)}` : "/login";

    // 1) Local session clear only — do not set React auth state first.
    //    Clearing user/capabilities here unmounts heavy screens (e.g. POS) on the
    //    main thread and can stall the logout timeout / soft navigation for tens of seconds.
    clearSession();
    clearStoredActiveSession();
    clearLocalPrintingSettingsCache();
    invalidateReferenceDataCache();
    invalidateReportBuilderTemplateCache();
    capabilitiesRefreshAt.current = 0;
    capabilitiesRefreshPromise.current = null;
    capabilitiesRefreshGen.current += 1;

    // 2) Fire-and-forget server revoke (keepalive survives hard navigation).
    if (hadSession) {
      void endServerAuthSession({ token });
    }

    // 3) Hard navigate immediately — login must not wait on network or React unmount.
    if (typeof window !== "undefined") {
      window.location.assign(loginPath);
      return;
    }
    router.replace(loginPath);
  }, [router]);

  const isOrgWide = useCallback(
    () => (capabilities?.access_scope ?? user?.access_scope) === "org" || Boolean(user?.is_admin),
    [capabilities?.access_scope, user?.access_scope, user?.is_admin],
  );

  const applyOperatorSession = useCallback(
    async (res) => {
      const channel = getStoredLoginChannel() ?? loginChannel ?? WEB_LOGIN_CHANNEL;
      return applyAuthPayload(res, channel);
    },
    [applyAuthPayload, loginChannel],
  );

  const patchOrganization = useCallback((partial) => {
    setOrganization((prev) => {
      const next = { ...(prev ?? {}), ...(partial ?? {}) };
      setSession(
        getToken(),
        getStoredUser() ?? user,
        next,
        getStoredMemberships(),
        getStoredLoginChannel() ?? loginChannel,
      );
      return next;
    });
  }, [user, loginChannel]);

  const value = useMemo(
    () => ({
      user,
      organization,
      memberships,
      capabilities,
      loading,
      login,
      loginWithPin,
      loginWithPasskey,
      completeTwoFactorLogin,
      completeTwoFactorWithPasskey,
      loginChannel,
      switchOrganization,
      switchWorkspace,
      applyOperatorSession,
      logout,
      refreshCapabilities,
      patchOrganization,
      clearMustChangePassword,
      updateProfile,
      applyPasswordExpiry,
      completePasswordChange,
      skipPasswordExpiry,
      passwordExpiry,
      organizationLicense,
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
      hasNavPermission: (code) =>
        resolveHasNavPermission({
          user,
          organization,
          capabilities,
          code,
          isSuperAdmin: () => Boolean(user?.is_super_admin || capabilities?.is_super_admin),
        }),
      isOrgWide,
      generalSettings: () => resolveGeneralSettings(capabilities),
      sessionIdleMinutes: () => resolveSecurityTimeouts(capabilities).session_idle_minutes,
      screenLockMinutes: () => resolveSecurityTimeouts(capabilities).screen_lock_minutes,
    }),
    [
      user,
      organization,
      memberships,
      capabilities,
      loading,
      login,
      loginWithPin,
      loginWithPasskey,
      completeTwoFactorLogin,
      completeTwoFactorWithPasskey,
      loginChannel,
      switchOrganization,
      switchWorkspace,
      applyOperatorSession,
      logout,
      refreshCapabilities,
      patchOrganization,
      clearMustChangePassword,
      updateProfile,
      applyPasswordExpiry,
      completePasswordChange,
      skipPasswordExpiry,
      passwordExpiry,
      organizationLicense,
      isOrgWide,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
