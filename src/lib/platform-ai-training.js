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
  const chunkSize = 500;
  let created = 0;
  const entries = [];
  for (let i = 0; i < notes.length; i += chunkSize) {
    const chunk = notes.slice(i, i + chunkSize);
    const res = await apiRequest(`${AI_TRAINING_API_BASE}/knowledge/bulk`, {
      method: "POST",
      body: { notes: chunk },
    });
    created += Number(res.created ?? chunk.length);
    if (Array.isArray(res.entries)) entries.push(...res.entries);
  }
  return { created, entries };
}

/**
 * Delete every platform training note (optional workspace filter).
 * @param {{ workspace_id?: string | null }} [opts]
 */
export async function deleteAllTrainingNotes(opts = {}) {
  return apiRequest(`${AI_TRAINING_API_BASE}/knowledge/delete-all`, {
    method: "POST",
    body: {
      confirm: true,
      workspace_id: opts.workspace_id || null,
    },
  });
}

/**
 * Normalize spreadsheet / CSV column keys for Q&A import.
 * @param {Record<string, string>} row
 * @returns {{ question: string, answer: string, path?: string, workspace_id?: string } | null}
 */
export function mapTrainingQaSpreadsheetRow(row) {
  if (!row || typeof row !== "object") return null;
  const normalized = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[String(key).trim().toLowerCase().replace(/\s+/g, "_")] = String(value ?? "").trim();
  }

  const question =
    normalized.question ||
    normalized.topic ||
    normalized.q ||
    normalized.title ||
    "";
  const answer =
    normalized.answer ||
    normalized.content ||
    normalized.a ||
    normalized.note ||
    "";
  const path = normalized.path || normalized.screen || normalized.href || "";
  const workspace_id =
    normalized.workspace_id ||
    normalized.workspace ||
    normalized.module ||
    "";

  if (!question || !answer) return null;

  return {
    question: question.slice(0, 200),
    answer: answer.slice(0, 8000),
    ...(path ? { path: path.slice(0, 200) } : {}),
    ...(workspace_id ? { workspace_id } : {}),
  };
}

/**
 * Parse Excel/CSV rows or Q:/A: text into training notes.
 * @param {File} file
 * @returns {Promise<Array<{ question: string, answer: string, path?: string, workspace_id?: string }>>}
 */
export async function parseTrainingQaFile(file) {
  const name = String(file?.name ?? "").toLowerCase();
  const isText = name.endsWith(".txt") || name.endsWith(".md");

  if (isText) {
    const text = await file.text();
    return parseTrainingQaPaste(text);
  }

  const { parseSpreadsheet } = await import("@/components/catalog/catalog-import-export-shared");
  const rows = await parseSpreadsheet(file);
  /** @type {Array<{ question: string, answer: string, path?: string, workspace_id?: string }>} */
  const notes = [];
  for (const row of rows) {
    const mapped = mapTrainingQaSpreadsheetRow(row);
    if (mapped) notes.push(mapped);
  }
  return notes;
}

/**
 * Rows for Excel / PDF export of saved training notes.
 * @param {Array<Record<string, unknown>>} knowledge
 */
export function trainingNotesExportRows(knowledge) {
  return (knowledge ?? []).map((entry) => ({
    question: String(entry.topic ?? ""),
    answer: String(entry.content ?? ""),
    path: String(entry.path ?? ""),
    workspace_id: String(entry.workspace_id ?? ""),
  }));
}

export const TRAINING_NOTES_EXPORT_COLUMNS = [
  { key: "question", label: "Question" },
  { key: "answer", label: "Answer", wrap: true },
  { key: "path", label: "Path" },
  { key: "workspace_id", label: "Workspace" },
];

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
