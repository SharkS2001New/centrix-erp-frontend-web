import { apiRequest } from "@/lib/api";
import {
  beginAuthSessionRotation,
  endAuthSessionRotation,
  setSession,
  setStoredCapabilities,
  setStoredWorkspace,
} from "@/lib/auth-storage";
import { workspaceLoginChannel } from "@/lib/workspaces";

const CLIENT_ID_KEY = "pos_erp_client_id";

export function getAuthClientId() {
  if (typeof window === "undefined") return "";
  let clientId = localStorage.getItem(CLIENT_ID_KEY);
  if (!clientId) {
    clientId = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, clientId);
  }
  return clientId;
}

/** Serialize workspace switches — overlapping POS↔backoffice restores raced 401 logout. */
let workspaceSwitchChain = Promise.resolve();
let workspaceSwitchInflightId = null;
let workspaceSwitchInflightPromise = null;

/**
 * Re-issue the session token with the login channel for the selected workspace.
 * POS workspace → pos channel so orders record order_source=pos.
 */
export async function applyWorkspaceSession(workspaceId) {
  const target = String(workspaceId ?? "");
  if (!target) {
    throw new Error("Workspace is required.");
  }

  // Coalesce duplicate switches to the same workspace (guard re-renders).
  if (workspaceSwitchInflightPromise && workspaceSwitchInflightId === target) {
    return workspaceSwitchInflightPromise;
  }

  const run = workspaceSwitchChain.then(async () => {
    workspaceSwitchInflightId = target;
    // Suppress concurrent API 401 → logout for the whole rotation window
    // (epoch bump alone is not enough: requests started after bump still carry
    // the old bearer until setSession runs).
    beginAuthSessionRotation();
    try {
      const loginChannel = workspaceLoginChannel(target);
      const res = await apiRequest("/auth/switch-workspace", {
        method: "POST",
        body: {
          login_channel: loginChannel,
          client_id: getAuthClientId(),
          workspace_id: target,
        },
      });
      setSession(
        res.token,
        res.user,
        res.organization,
        res.memberships ?? [],
        loginChannel,
      );
      if (res.capabilities) {
        setStoredCapabilities(res.capabilities);
      }
      setStoredWorkspace(target);
      return res;
    } finally {
      endAuthSessionRotation();
      workspaceSwitchInflightId = null;
      workspaceSwitchInflightPromise = null;
    }
  });

  workspaceSwitchInflightPromise = run;
  // Keep the chain alive after failures so the next switch still runs.
  workspaceSwitchChain = run.catch(() => {});
  return run;
}
