import { apiRequest } from "@/lib/api";

/** Workspaces available in the AI training test console (includes hospitality). */
export const AI_TRAINING_WORKSPACES = [
  { id: "backoffice", label: "Backoffice", pathname: "/sales" },
  { id: "hospitality_backoffice", label: "Hotel Backoffice", pathname: "/hospitality" },
  { id: "hotel_bar_pos", label: "Hotel POS", pathname: "/hotel-bar-pos" },
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

/**
 * Build a knowledge draft from a frequent usage question via platform AI.
 * @param {{
 *   question: string,
 *   examples?: string[],
 *   count?: number,
 *   workspace_id?: string | null,
 *   save?: boolean,
 * }} input
 */
export async function trainAiFromUsageQuestion(input) {
  return apiRequest(`${AI_TRAINING_API_BASE}/usage/train-from-question`, {
    method: "POST",
    body: {
      question: input.question,
      examples: input.examples ?? [],
      count: input.count ?? 1,
      workspace_id: input.workspace_id || null,
      save: Boolean(input.save),
    },
  });
}
