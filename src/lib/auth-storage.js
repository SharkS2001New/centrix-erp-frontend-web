import { useCookieAuth } from "./auth-config";
import { clearAllTabWorkspaceMemory } from "./tab-workspace";

const TOKEN_KEY = "pos_erp_token";
const WORKSPACE_ROUTE_MEMORY_PREFIX = "pos_erp_workspace_routes";

/**
 * Monotonic session generation. Bumped on login, workspace/channel switch, and logout
 * so in-flight API 401s from a rotated Sanctum token do not clear the new session.
 */
let authEpoch = 0;

export function getAuthEpoch() {
  return authEpoch;
}

export function bumpAuthEpoch() {
  authEpoch += 1;
  return authEpoch;
}

function clearWorkspaceRouteMemoryOnLogout() {
  if (typeof window === "undefined") return;
  try {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(WORKSPACE_ROUTE_MEMORY_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => sessionStorage.removeItem(key));
    clearAllTabWorkspaceMemory();
  } catch {
    /* ignore */
  }
}
const USER_KEY = "pos_erp_user";
const ORG_KEY = "pos_erp_organization";
const MEMBERSHIPS_KEY = "pos_erp_memberships";
const LOGIN_CHANNEL_KEY = "pos_erp_login_channel";
const WORKSPACE_KEY = "pos_erp_workspace";
const SCREEN_LOCKED_KEY = "pos_erp_screen_locked";
const CAPABILITIES_KEY = "pos_erp_capabilities";
const LOGIN_WARNINGS_KEY = "pos_erp_login_warnings";

function currentOrganizationId() {
  return (
    Number(getStoredOrganization()?.id ?? 0) ||
    Number(getStoredUser()?.organization_id ?? 0) ||
    0
  );
}

function capabilitiesStorageKey(organizationId = currentOrganizationId()) {
  const orgId = Number(organizationId);
  if (Number.isFinite(orgId) && orgId > 0) {
    return `${CAPABILITIES_KEY}:org:${orgId}`;
  }
  return CAPABILITIES_KEY;
}

function capabilitiesBelongToOrganization(capabilities, organizationId) {
  if (!capabilities || typeof capabilities !== "object") return false;
  const orgId = Number(organizationId);
  if (!Number.isFinite(orgId) || orgId <= 0) return true;
  const capsOrgId = Number(
    capabilities.organization_id ?? capabilities.organization?.id ?? 0,
  );
  // Legacy payloads without organization_id are only trusted when no org is known.
  if (!Number.isFinite(capsOrgId) || capsOrgId <= 0) return false;
  return capsOrgId === orgId;
}

export function getToken() {
  if (typeof window === "undefined") return null;
  if (useCookieAuth) return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function hasAuthSession() {
  if (typeof window === "undefined") return false;
  if (useCookieAuth) {
    return Boolean(getStoredUser());
  }
  return Boolean(getToken() && getStoredUser());
}

export function setSession(token, user, organization = null, memberships = [], loginChannel = null) {
  bumpAuthEpoch();
  if (useCookieAuth) {
    localStorage.removeItem(TOKEN_KEY);
  } else if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  }
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (organization) {
    localStorage.setItem(ORG_KEY, JSON.stringify(organization));
  }
  localStorage.setItem(MEMBERSHIPS_KEY, JSON.stringify(memberships ?? []));
  if (loginChannel) {
    localStorage.setItem(LOGIN_CHANNEL_KEY, loginChannel);
  }
}

export function getStoredWorkspace() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(WORKSPACE_KEY);
}

export function setStoredWorkspace(workspaceId) {
  if (typeof window === "undefined") return;
  if (workspaceId) {
    localStorage.setItem(WORKSPACE_KEY, workspaceId);
  } else {
    localStorage.removeItem(WORKSPACE_KEY);
  }
}

export function getStoredLoginChannel() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LOGIN_CHANNEL_KEY);
}

export function setStoredLoginChannel(channel) {
  if (typeof window === "undefined") return;
  if (channel) {
    localStorage.setItem(LOGIN_CHANNEL_KEY, channel);
  } else {
    localStorage.removeItem(LOGIN_CHANNEL_KEY);
  }
}

export function patchStoredUser(updates) {
  if (typeof window === "undefined") return null;
  const user = getStoredUser();
  if (!user) return null;
  const next = { ...user, ...updates };
  localStorage.setItem(USER_KEY, JSON.stringify(next));
  return next;
}

export function getStoredUser() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getStoredOrganization() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(ORG_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getStoredMemberships() {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(MEMBERSHIPS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Last capabilities payload (module_settings, permissions, etc.).
 * Written on login / ERP load; keyed by organization so org 1 KRA/finance
 * settings never bleed into org 2 after a switch.
 */
export function getStoredCapabilities() {
  if (typeof window === "undefined") return null;
  const orgId = currentOrganizationId();
  const scopedKey = capabilitiesStorageKey(orgId);
  let raw = localStorage.getItem(scopedKey);

  // One-time migrate from the legacy unscoped key when it matches this org.
  if (!raw && orgId > 0) {
    const legacy = localStorage.getItem(CAPABILITIES_KEY);
    if (legacy) {
      try {
        const parsed = JSON.parse(legacy);
        if (capabilitiesBelongToOrganization(parsed, orgId)) {
          localStorage.setItem(scopedKey, legacy);
          raw = legacy;
        }
      } catch {
        /* ignore */
      }
      try {
        localStorage.removeItem(CAPABILITIES_KEY);
      } catch {
        /* ignore */
      }
    }
  }

  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!capabilitiesBelongToOrganization(parsed, orgId)) {
      localStorage.removeItem(scopedKey);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setStoredCapabilities(capabilities) {
  if (typeof window === "undefined" || !capabilities) return;
  try {
    const orgId =
      Number(capabilities.organization_id ?? capabilities.organization?.id ?? 0) ||
      currentOrganizationId();
    const scopedKey = capabilitiesStorageKey(orgId);
    const payload =
      orgId > 0 && !capabilities.organization_id
        ? { ...capabilities, organization_id: orgId }
        : capabilities;
    localStorage.setItem(scopedKey, JSON.stringify(payload));
    // Drop legacy global key so another org cannot read these settings.
    localStorage.removeItem(CAPABILITIES_KEY);
  } catch {
    /* ignore quota errors */
  }
}

export function canSeeServerErrorDetail() {
  const user = getStoredUser();
  const capabilities = getStoredCapabilities();
  return Boolean(
    user?.is_super_admin
      || user?.is_admin
      || capabilities?.is_super_admin,
  );
}

/** Synchronous session snapshot for route/guard checks before React auth state hydrates. */
export function readCachedAuthSnapshot() {
  if (typeof window === "undefined") return null;
  if (!hasAuthSession()) return null;
  const user = getStoredUser();
  if (!user) return null;
  return {
    user,
    organization: getStoredOrganization(),
    capabilities: getStoredCapabilities(),
  };
}

export function clearSession() {
  bumpAuthEpoch();
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ORG_KEY);
  localStorage.removeItem(MEMBERSHIPS_KEY);
  localStorage.removeItem(LOGIN_CHANNEL_KEY);
  localStorage.removeItem(WORKSPACE_KEY);
  localStorage.removeItem(CAPABILITIES_KEY);
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(`${CAPABILITIES_KEY}:org:`)) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* ignore */
  }
  clearLoginWarnings();
  clearWorkspaceRouteMemoryOnLogout();
  clearScreenLocked();
}

export function getLoginWarnings() {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(LOGIN_WARNINGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setLoginWarnings(warnings) {
  if (typeof window === "undefined") return;
  try {
    if (!Array.isArray(warnings) || warnings.length === 0) {
      sessionStorage.removeItem(LOGIN_WARNINGS_KEY);
      return;
    }
    sessionStorage.setItem(LOGIN_WARNINGS_KEY, JSON.stringify(warnings));
  } catch {
    /* ignore */
  }
}

export function clearLoginWarnings() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(LOGIN_WARNINGS_KEY);
  } catch {
    /* ignore */
  }
}

export function isScreenLocked() {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(SCREEN_LOCKED_KEY) === "1";
}

export function setScreenLocked(locked) {
  if (typeof window === "undefined") return;
  if (locked) {
    sessionStorage.setItem(SCREEN_LOCKED_KEY, "1");
  } else {
    sessionStorage.removeItem(SCREEN_LOCKED_KEY);
  }
}

export function clearScreenLocked() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SCREEN_LOCKED_KEY);
}
