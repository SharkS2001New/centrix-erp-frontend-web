import { apiRequest } from "@/lib/api";
import { serializeEntityRefs } from "@/lib/ai/entity-mention-search";

/**
 * Ask org AI to draft a report builder name + spec from a natural-language instruction.
 * @param {{
 *   instruction: string,
 *   workspaceId?: string | null,
 *   selectedProductCodes?: string[],
 *   selectedCustomerNums?: string[],
 *   selectedSupplierIds?: number[],
 *   entityRefs?: Array<object>,
 * }} params
 * @returns {Promise<object>}
 */
export async function suggestReportBuilderWithAi({
  instruction,
  workspaceId = null,
  selectedProductCodes = null,
  selectedCustomerNums = null,
  selectedSupplierIds = null,
  entityRefs = null,
} = {}) {
  const body = {
    instruction: String(instruction ?? "").trim(),
  };
  if (workspaceId) {
    body.workspace_id = workspaceId;
  }
  if (Array.isArray(selectedProductCodes) && selectedProductCodes.length > 0) {
    body.selected_product_codes = selectedProductCodes;
  }
  if (Array.isArray(selectedCustomerNums) && selectedCustomerNums.length > 0) {
    body.selected_customer_nums = selectedCustomerNums;
  }
  if (Array.isArray(selectedSupplierIds) && selectedSupplierIds.length > 0) {
    body.selected_supplier_ids = selectedSupplierIds;
  }
  const refs = serializeEntityRefs(entityRefs);
  if (refs.length > 0) {
    body.entity_refs = refs;
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
