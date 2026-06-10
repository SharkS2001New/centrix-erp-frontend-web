const MODULE_LABELS = {
  sales: "Sales",
  payments: "Payments",
  inventory: "Inventory",
  reports: "Reports",
  purchasing: "Procurement",
  accounting: "Finance",
  hr: "HR & Payroll",
  admin: "Administration",
  pos: "Point of sale",
  catalogue: "Products",
  dashboard: "Dashboard",
};

const ACTION_COLUMNS = ["view", "create", "edit", "delete", "approve"];

/** Fixed module rows — every cell should have a matching permission after API ensure. */
export const MATRIX_MODULES = [
  "dashboard",
  "sales",
  "inventory",
  "purchasing",
  "accounting",
  "hr",
  "admin",
  "catalogue",
  "reports",
  "payments",
  "pos",
];

export function moduleLabel(module) {
  return MODULE_LABELS[module] ?? module.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function slugCode(value, fallback = "ITEM") {
  const base = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return base || fallback;
}

export function orgListParams(organizationId) {
  return organizationId ? { "filter[organization_id]": organizationId } : {};
}

export function filterByOrganization(rows, organizationId) {
  if (!organizationId) return rows ?? [];
  return (rows ?? []).filter((row) => Number(row.organization_id) === Number(organizationId));
}

function permissionAction(permissionCode) {
  const action = String(permissionCode ?? "").split(".").pop()?.toLowerCase() ?? "";
  if (action === "manage") return "edit";
  if (action === "till") return "create";
  if (ACTION_COLUMNS.includes(action)) return action;
  return "view";
}

/** Group permissions into module rows with action columns for the matrix UI. */
export function buildPermissionMatrix(permissions) {
  const fromApi = [...new Set((permissions ?? []).map((p) => p.module).filter(Boolean))];
  const modules = [...new Set([...MATRIX_MODULES, ...fromApi])].sort((a, b) => {
    const ai = MATRIX_MODULES.indexOf(a);
    const bi = MATRIX_MODULES.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
  return modules.map((module) => {
    const modulePerms = (permissions ?? []).filter((p) => p.module === module);
    const cells = {};
    for (const action of ACTION_COLUMNS) {
      cells[action] = modulePerms.find((p) => permissionAction(p.permission_code) === action) ?? null;
    }
    const extras = modulePerms.filter((p) => {
      const action = permissionAction(p.permission_code);
      return !cells[action] || cells[action].id !== p.id;
    });
    return { module, label: moduleLabel(module), cells, extras };
  });
}

export function formatAuditValues(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2);
}
