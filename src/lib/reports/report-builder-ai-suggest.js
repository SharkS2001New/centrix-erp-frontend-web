import { apiRequest } from "@/lib/api";

/**
 * Ask org AI to draft a report builder name + spec from a natural-language instruction.
 * @param {{ instruction: string, workspaceId?: string | null }} params
 * @returns {Promise<{ name: string, description: string | null, spec: object }>}
 */
export async function suggestReportBuilderWithAi({ instruction, workspaceId = null } = {}) {
  const body = {
    instruction: String(instruction ?? "").trim(),
  };
  if (workspaceId) {
    body.workspace_id = workspaceId;
  }

  return apiRequest("/reports/builder/suggest", {
    method: "POST",
    body,
  });
}

/**
 * Merge a suggest API payload into builder form state (pure helper for tests).
 * @param {{ name?: string, description?: string | null, spec?: object }} suggestion
 * @param {{ name?: string, description?: string, spec?: object }} current
 */
export function applyReportBuilderSuggestion(suggestion, current = {}) {
  const nextName =
    typeof suggestion?.name === "string" && suggestion.name.trim()
      ? suggestion.name.trim()
      : current.name ?? "";
  const nextDescription =
    suggestion?.description != null && String(suggestion.description).trim()
      ? String(suggestion.description).trim()
      : current.description ?? "";
  const nextSpec =
    suggestion?.spec && typeof suggestion.spec === "object"
      ? {
          source: suggestion.spec.source ?? null,
          sources: Array.isArray(suggestion.spec.sources) ? suggestion.spec.sources : [],
          blend_by: suggestion.spec.blend_by ?? null,
          columns: Array.isArray(suggestion.spec.columns) ? suggestion.spec.columns : [],
          group_by: Array.isArray(suggestion.spec.group_by) ? suggestion.spec.group_by : [],
          sort: suggestion.spec.sort ?? null,
          charts: Array.isArray(suggestion.spec.charts) ? suggestion.spec.charts : [],
          kpis: Array.isArray(suggestion.spec.kpis) ? suggestion.spec.kpis : [],
        }
      : current.spec ?? null;

  return {
    name: nextName,
    description: nextDescription,
    spec: nextSpec,
  };
}
