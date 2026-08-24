import { searchProductCatalogCached } from "@/lib/catalog-cache";
import { fetchBranchesCached } from "@/lib/reference-data-cache";
import { searchReportFilterOptions } from "@/lib/reports/report-filter-search";
import { getStoredOrganization } from "@/lib/auth-storage";

/** @typedef {'product' | 'supplier' | 'customer' | 'employee' | 'branch'} EntityMentionType */

export const ENTITY_MENTION_TYPES = [
  { type: "product", label: "Product" },
  { type: "supplier", label: "Supplier" },
  { type: "customer", label: "Customer" },
  { type: "employee", label: "Employee" },
  { type: "branch", label: "Branch" },
];

/**
 * @param {string} text
 * @param {number} caret
 * @returns {{ start: number, query: string } | null}
 */
export function detectMentionTrigger(text, caret) {
  const value = String(text ?? "");
  const pos = Math.max(0, Math.min(Number(caret) || 0, value.length));
  const before = value.slice(0, pos);
  const match = before.match(/(^|[\s(,;])@([^\s@]*)$/);
  if (!match) return null;
  const query = match[2] ?? "";
  const start = pos - query.length - 1;
  return { start, query };
}

/**
 * @param {{ type: EntityMentionType, id?: string|number|null, code?: string|null, label: string }} entity
 */
export function mentionDisplayLabel(entity) {
  const label = String(entity?.label ?? "").trim() || String(entity?.code ?? entity?.id ?? "item");
  return `@${label.replace(/\s+/g, " ").trim()}`;
}

/**
 * Insert a mention at the active `@` trigger and return updated text + caret.
 * @param {string} text
 * @param {{ start: number, query: string }} trigger
 * @param {{ type: EntityMentionType, id?: string|number|null, code?: string|null, label: string }} entity
 */
export function insertMentionAtTrigger(text, trigger, entity) {
  const value = String(text ?? "");
  const start = trigger.start;
  const end = start + 1 + String(trigger.query ?? "").length;
  const token = mentionDisplayLabel(entity);
  const before = value.slice(0, start);
  const after = value.slice(end);
  const needsSpace = after.length === 0 || !/^\s/.test(after);
  const inserted = `${token}${needsSpace ? " " : ""}`;
  const nextText = `${before}${inserted}${after}`;
  return {
    text: nextText,
    caret: before.length + inserted.length,
    token,
  };
}

/**
 * Drop refs whose display token is no longer present in the text.
 * @param {string} text
 * @param {Array<{ type: string, id?: string|number|null, code?: string|null, label: string }>} refs
 */
export function pruneEntityRefs(text, refs) {
  const value = String(text ?? "");
  return (Array.isArray(refs) ? refs : []).filter((ref) => {
    const token = mentionDisplayLabel(ref);
    return value.includes(token);
  });
}

/**
 * Serialize refs for API payloads (stable shape).
 * @param {Array<object>} refs
 */
export function serializeEntityRefs(refs) {
  return (Array.isArray(refs) ? refs : [])
    .map((ref) => ({
      type: String(ref.type ?? "").trim(),
      id: ref.id != null && ref.id !== "" ? String(ref.id) : null,
      code: ref.code != null && ref.code !== "" ? String(ref.code) : null,
      label: String(ref.label ?? "").trim(),
    }))
    .filter((ref) => ref.type && ref.label);
}

/**
 * @param {EntityMentionType} type
 * @param {string} query
 * @param {{ signal?: AbortSignal, organizationId?: number|null }} [options]
 * @returns {Promise<Array<{ type: EntityMentionType, id: string|null, code: string|null, label: string, meta?: string }>>}
 */
export async function searchEntityMentions(type, query, options = {}) {
  const q = String(query ?? "").trim();
  const orgId = options.organizationId ?? getStoredOrganization()?.id ?? null;

  switch (type) {
    case "product": {
      if (!q) return [];
      const rows = await searchProductCatalogCached(orgId, q, {
        limit: 12,
        signal: options.signal,
      });
      return rows.map((row) => ({
        type: "product",
        id: null,
        code: String(row.product_code ?? ""),
        label: String(row.product_name ?? row.product_code ?? ""),
        meta: String(row.product_code ?? ""),
      }));
    }
    case "supplier": {
      const optionsList = await searchReportFilterOptions("suppliers", q);
      return optionsList.slice(0, 12).map((opt) => ({
        type: "supplier",
        id: String(opt.value),
        code: null,
        label: String(opt.label),
        meta: `ID ${opt.value}`,
      }));
    }
    case "customer": {
      const optionsList = await searchReportFilterOptions("customers", q);
      return optionsList.slice(0, 12).map((opt) => ({
        type: "customer",
        id: null,
        code: String(opt.value),
        label: String(opt.label).replace(/\s*\(#\d+\)\s*$/, "").trim() || String(opt.value),
        meta: `#${opt.value}`,
      }));
    }
    case "employee": {
      const optionsList = await searchReportFilterOptions("cashiers", q);
      return optionsList.slice(0, 12).map((opt) => ({
        type: "employee",
        id: String(opt.value),
        code: null,
        label: String(opt.label),
        meta: `User #${opt.value}`,
      }));
    }
    case "branch": {
      const branches = await fetchBranchesCached(orgId);
      const needle = q.toLowerCase();
      return branches
        .filter((b) => {
          if (!needle) return true;
          const hay = `${b.branch_name ?? ""} ${b.branch_code ?? ""} ${b.id}`.toLowerCase();
          return hay.includes(needle);
        })
        .slice(0, 12)
        .map((b) => ({
          type: "branch",
          id: String(b.id),
          code: b.branch_code ? String(b.branch_code) : null,
          label: String(b.branch_name ?? b.branch_code ?? `Branch #${b.id}`),
          meta: b.branch_code ? String(b.branch_code) : `ID ${b.id}`,
        }));
    }
    default:
      return [];
  }
}

/** Prefetch empty-query lists for tabs that support it. */
export async function searchEntityMentionsPrefetch(type, options = {}) {
  if (type === "product") return [];
  return searchEntityMentions(type, "", options);
}

/**
 * Lightweight client helper used by unit tests.
 * @param {string} text
 * @param {number} caret
 */
export function mentionQueryAtCaret(text, caret) {
  return detectMentionTrigger(text, caret)?.query ?? null;
}
