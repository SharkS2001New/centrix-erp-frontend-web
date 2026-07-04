import { apiRequest } from "@/lib/api";
import { creditCustomerToOption, fetchCreditCustomerByNum } from "@/lib/credit-customer-search";

/** Option lists loaded via API search instead of bulk prefetch. */
export const REPORT_ASYNC_SEARCH_KEYS = new Set([
  "routes",
  "subcategories",
  "suppliers",
  "cashiers",
  "paymentMethods",
  "customers",
]);

/** Static lists with few choices — keep native <select>. */
export const REPORT_SHORT_SELECT_KEYS = new Set([
  "channels",
  "paymentStatuses",
  "orderStatuses",
  "stockLocations",
  "inventoryLocations",
]);

export function reportFilterUsesAsyncSearch(optionsKey) {
  return REPORT_ASYNC_SEARCH_KEYS.has(optionsKey);
}

export function reportFilterUsesLocalSearch(optionsKey, optionCount = 0) {
  if (optionsKey === "products") return false;
  if (reportFilterUsesAsyncSearch(optionsKey)) return false;
  if (REPORT_SHORT_SELECT_KEYS.has(optionsKey)) return false;
  return optionCount > 0;
}

export function reportFilterPlaceholder(optionsKey, label) {
  const map = {
    routes: "All routes",
    subcategories: "All subcategories",
    suppliers: "All suppliers",
    cashiers: "All users",
    paymentMethods: "All payment methods",
    customers: "All customers",
    products: "All products",
  };
  return map[optionsKey] ?? `All ${String(label ?? "options").toLowerCase()}`;
}

/**
 * @param {string} optionsKey
 * @param {string} query
 * @returns {Promise<Array<{ value: string, label: string, searchText?: string }>>}
 */
export async function searchReportFilterOptions(optionsKey, query) {
  const q = String(query ?? "").trim();
  if (!q) return [];

  switch (optionsKey) {
    case "routes": {
      const res = await apiRequest("/routes", { searchParams: { per_page: 50, q } });
      return (res.data ?? []).map((row) => ({
        value: row.route_name ?? String(row.id),
        label: row.route_name ?? `Route #${row.id}`,
      }));
    }
    case "subcategories": {
      const res = await apiRequest("/sub-categories", { searchParams: { per_page: 50, q } });
      return (res.data ?? []).map((row) => ({
        value: String(row.id),
        label: row.subcategory_name ?? `Subcategory #${row.id}`,
      }));
    }
    case "suppliers": {
      const res = await apiRequest("/suppliers", { searchParams: { per_page: 50, q } });
      return (res.data ?? []).map((row) => ({
        value: String(row.id),
        label: row.supplier_name ?? `Supplier #${row.id}`,
      }));
    }
    case "cashiers": {
      const res = await apiRequest("/users", { searchParams: { per_page: 50, q } });
      return (res.data ?? []).map((row) => ({
        value: String(row.id),
        label: row.full_name ?? row.username ?? `User #${row.id}`,
        searchText: `${row.full_name ?? ""} ${row.username ?? ""} ${row.id}`,
      }));
    }
    case "paymentMethods": {
      const res = await apiRequest("/payment-methods", { searchParams: { per_page: 50, q } });
      return (res.data ?? []).map((row) => ({
        value: row.method_code ?? String(row.id),
        label: row.method_name ?? row.method_code ?? `Method #${row.id}`,
      }));
    }
    case "customers": {
      const res = await apiRequest("/customers", { searchParams: { per_page: 50, q } });
      return (res.data ?? []).map((row) => ({
        value: String(row.customer_num ?? ""),
        label: `${row.customer_name ?? row.customer_num} (#${row.customer_num})`,
        searchText: `${row.customer_name ?? ""} ${row.customer_num ?? ""} ${row.phone_number ?? ""}`,
      }));
    }
    default:
      return [];
  }
}

/**
 * Resolve label for a persisted filter value (e.g. after page reload).
 * @param {string} optionsKey
 * @param {string} value
 */
export async function resolveReportFilterSelection(optionsKey, value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  switch (optionsKey) {
    case "routes":
      return { value: raw, label: raw };
    case "subcategories": {
      try {
        const row = await apiRequest(`/sub-categories/${encodeURIComponent(raw)}`);
        return {
          value: String(row.id ?? raw),
          label: row.subcategory_name ?? `Subcategory #${raw}`,
        };
      } catch {
        return { value: raw, label: `Subcategory #${raw}` };
      }
    }
    case "suppliers": {
      try {
        const row = await apiRequest(`/suppliers/${encodeURIComponent(raw)}`);
        return {
          value: String(row.id ?? raw),
          label: row.supplier_name ?? `Supplier #${raw}`,
        };
      } catch {
        return { value: raw, label: `Supplier #${raw}` };
      }
    }
    case "cashiers": {
      try {
        const row = await apiRequest(`/users/${encodeURIComponent(raw)}`);
        return {
          value: String(row.id ?? raw),
          label: row.full_name ?? row.username ?? `User #${raw}`,
        };
      } catch {
        return { value: raw, label: `User #${raw}` };
      }
    }
    case "paymentMethods": {
      const res = await apiRequest("/payment-methods", {
        searchParams: { per_page: 100, q: raw },
      });
      const row = (res.data ?? []).find(
        (m) => String(m.method_code ?? "") === raw || String(m.id) === raw,
      );
      if (!row) return { value: raw, label: raw };
      return {
        value: row.method_code ?? String(row.id),
        label: row.method_name ?? row.method_code ?? raw,
      };
    }
    case "customers": {
      const row = await fetchCreditCustomerByNum(raw);
      if (row) return creditCustomerToOption(row);
      return { value: raw, label: `Customer #${raw}` };
    }
    default:
      return null;
  }
}
