import { useCookieAuth } from "./auth-config";

const TOKEN_KEY = "pos_erp_token";
const USER_KEY = "pos_erp_user";
const ORG_KEY = "pos_erp_organization";
const MEMBERSHIPS_KEY = "pos_erp_memberships";
const LOGIN_CHANNEL_KEY = "pos_erp_login_channel";
const WORKSPACE_KEY = "pos_erp_workspace";
const SCREEN_LOCKED_KEY = "pos_erp_screen_locked";

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

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ORG_KEY);
  localStorage.removeItem(MEMBERSHIPS_KEY);
  localStorage.removeItem(LOGIN_CHANNEL_KEY);
  localStorage.removeItem(WORKSPACE_KEY);
  clearScreenLocked();
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
