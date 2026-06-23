/** Workspaces available in the AI training test console. */
export const AI_TRAINING_WORKSPACES = [
  { id: "backoffice", label: "Backoffice", pathname: "/sales" },
  { id: "accounting", label: "Accounting", pathname: "/accounting" },
  { id: "hr", label: "Human Resources", pathname: "/hr" },
  { id: "distribution", label: "Distribution", pathname: "/fulfillment" },
  { id: "admin", label: "Administration", pathname: "/admin" },
  { id: "pos", label: "External POS", pathname: "/pos" },
];

export const AI_TRAINING_WORKSPACE_OPTIONS = [
  { value: "", label: "All modules" },
  ...AI_TRAINING_WORKSPACES.map((w) => ({ value: w.id, label: w.label })),
];

export const AI_TRAINING_API_BASE = "/admin/ai-training";

export function aiTrainingApiBase() {
  return AI_TRAINING_API_BASE;
}

export function aiTrainingWorkspacePath(workspaceId) {
  return AI_TRAINING_WORKSPACES.find((w) => w.id === workspaceId)?.pathname ?? "/dashboard";
}
