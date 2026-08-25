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

/**
 * Parse pasted Q&A text into note rows.
 * Accepts blocks separated by blank lines, each starting with Q: / A: (or Question: / Answer:).
 * @param {string} text
 * @returns {Array<{ question: string, answer: string, path?: string }>}
 */
export function parseTrainingQaPaste(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return [];

  const blocks = raw.split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);
  /** @type {Array<{ question: string, answer: string, path?: string }>} */
  const notes = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    let question = "";
    let answer = "";
    let path = "";

    for (const line of lines) {
      const q = line.match(/^(?:Q|Question)\s*[:\-]\s*(.+)$/i);
      const a = line.match(/^(?:A|Answer)\s*[:\-]\s*(.+)$/i);
      const p = line.match(/^(?:Path|Screen)\s*[:\-]\s*(.+)$/i);
      if (q) question = q[1].trim();
      else if (a) answer = a[1].trim();
      else if (p) path = p[1].trim();
      else if (!question) question = line;
      else answer = answer ? `${answer} ${line}` : line;
    }

    if (question && answer) {
      notes.push({
        question,
        answer,
        ...(path ? { path } : {}),
      });
    }
  }

  return notes;
}

export async function bulkImportTrainingNotes(notes) {
  return apiRequest(`${AI_TRAINING_API_BASE}/knowledge/bulk`, {
    method: "POST",
    body: { notes },
  });
}

export async function installFoundationTrainingNotes() {
  return apiRequest(`${AI_TRAINING_API_BASE}/knowledge/install-foundation`, {
    method: "POST",
    body: {},
  });
}

/**
 * Scan platform training notes for similar topics (duplicate clusters).
 * @param {{ workspace_id?: string | null, threshold?: number }} [opts]
 */
export async function scanTrainingNoteDuplicates(opts = {}) {
  const params = new URLSearchParams();
  if (opts.workspace_id) params.set("workspace_id", opts.workspace_id);
  if (opts.threshold != null) params.set("threshold", String(opts.threshold));
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`${AI_TRAINING_API_BASE}/knowledge/duplicates${query}`);
}

/**
 * Merge duplicate notes into one kept entry.
 * @param {{ keep_id: number, merge_ids: number[], topic?: string, content?: string }} input
 */
export async function mergeTrainingNotes(input) {
  return apiRequest(`${AI_TRAINING_API_BASE}/knowledge/merge`, {
    method: "POST",
    body: input,
  });
}

/**
 * Delete multiple platform training notes by id.
 * @param {number[]} entryIds
 */
export async function bulkDeleteTrainingNotes(entryIds) {
  return apiRequest(`${AI_TRAINING_API_BASE}/knowledge/bulk-delete`, {
    method: "POST",
    body: { entry_ids: entryIds },
  });
}
