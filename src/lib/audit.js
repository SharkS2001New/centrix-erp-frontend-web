/** Human labels for audit `table_name` values. */
export const TABLE_LABELS = {
  products: "Products",
  sales: "Sales",
  users: "Users",
  roles: "Roles",
  branches: "Branches",
  suppliers: "Suppliers",
  customers: "Customers",
  expenses: "Expenses",
  stock_receipts: "Stock receipts",
  supplier_return_documents: "Supplier returns",
  journal_entries: "Journal entries",
  system_settings: "System settings",
};

/** @param {string} tableName */
export function tableLabel(tableName) {
  if (!tableName) return "—";
  return TABLE_LABELS[tableName] ?? tableName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** @param {string} action */
export function actionLabel(action) {
  if (!action) return "—";
  const labels = {
    create: "Created",
    update: "Updated",
    delete: "Deleted",
    login: "Login",
    logout: "Logout",
  };
  return labels[action] ?? action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** @param {string} action */
export function actionBadgeClass(action) {
  switch (action) {
    case "create":
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
    case "update":
      return "bg-sky-50 text-sky-700 ring-sky-600/20";
    case "delete":
      return "bg-red-50 text-red-700 ring-red-600/20";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-500/20";
  }
}

/** @param {Record<string, unknown> | string | null | undefined} log */
export function summarizeAuditEntry(log) {
  const action = log?.action;
  const table = tableLabel(log?.table_name);
  const record = log?.record_id ? `#${log.record_id}` : "";

  const newV = parseAuditJson(log?.new_values);
  if (action === "update" && newV && typeof newV === "object") {
    const keys = Object.keys(newV);
    if (keys.length === 1) {
      return `${keys[0]} updated on ${table} ${record}`.trim();
    }
    if (keys.length > 1) {
      return `${keys.length} fields updated on ${table} ${record}`.trim();
    }
  }

  if (action === "create") return `New ${table.toLowerCase()} record ${record}`.trim();
  if (action === "delete") return `${table} record ${record} removed`.trim();

  return `${actionLabel(action)} · ${table} ${record}`.trim();
}

/** @param {unknown} value */
export function parseAuditJson(value) {
  if (value == null || value === "") return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

/** Default date range: last 30 days through today (YYYY-MM-DD). */
export function defaultAuditDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}
