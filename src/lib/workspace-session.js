import { apiRequest } from "@/lib/api";
import { setSession, setStoredWorkspace } from "@/lib/auth-storage";
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

/**
 * Re-issue the session token with the login channel for the selected workspace.
 * POS workspace → pos channel so orders record order_source=pos.
 */
export async function applyWorkspaceSession(workspaceId) {
  const loginChannel = workspaceLoginChannel(workspaceId);
  const res = await apiRequest("/auth/switch-workspace", {
    method: "POST",
    body: {
      login_channel: loginChannel,
      client_id: getAuthClientId(),
    },
  });
  setSession(
    res.token,
    res.user,
    res.organization,
    res.memberships ?? [],
    loginChannel,
  );
  setStoredWorkspace(workspaceId);
  return res;
}
