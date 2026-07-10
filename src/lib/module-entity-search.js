import { buildPageParams } from "@/lib/paginated-api";
import { P } from "@/lib/permission-codes";

/**
 * Workspace-scoped record search for the topbar (each module searches its own data).
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   apiPath: string,
 *   listHref: string,
 *   permission?: string,
 *   useAdminApi?: boolean,
 *   mapItem: (row: Record<string, unknown>, query: string) => {
 *     id: string,
 *     label: string,
 *     subtitle?: string,
 *     href: string,
 *   },
 * }} EntitySearchConfig
 */

/** @type {Record<string, EntitySearchConfig[]>} */
export const WORKSPACE_ENTITY_SEARCH = {
  backoffice: [
    {
      id: "products",
      label: "Products",
      apiPath: "/products",
      listHref: "/products",
      permission: P.catalogue.products.view,
      mapItem: (row) => ({
        id: `product:${row.product_code}`,
        label: String(row.product_name ?? row.product_code ?? "Product"),
        subtitle: row.product_code ? String(row.product_code) : undefined,
        href: `/products/${encodeURIComponent(String(row.product_code))}`,
      }),
    },
    {
      id: "customers",
      label: "Customers",
      apiPath: "/customers",
      listHref: "/customers",
      permission: P.customers.customers.view,
      mapItem: (row) => ({
        id: `customer:${row.id}`,
        label: String(row.customer_name ?? `Customer #${row.customer_num ?? row.id}`),
        subtitle: row.phone_number ? String(row.phone_number) : undefined,
        href: `/customers/${encodeURIComponent(String(row.customer_num ?? row.id))}`,
      }),
    },
    {
      id: "suppliers",
      label: "Suppliers",
      apiPath: "/suppliers",
      listHref: "/suppliers",
      permission: P.purchasing.suppliers.view,
      mapItem: (row) => ({
        id: `supplier:${row.id}`,
        label: String(row.supplier_name ?? row.supplier_code ?? "Supplier"),
        subtitle: row.supplier_code ? String(row.supplier_code) : undefined,
        href: `/suppliers/${row.id}`,
      }),
    },
    {
      id: "expenses",
      label: "Expenses",
      apiPath: "/expenses",
      listHref: "/expenses",
      permission: P.accounting.expenses.view,
      mapItem: (row) => ({
        id: `expense:${row.id}`,
        label: String(row.description ?? row.invoice_no ?? `Expense #${row.id}`),
        subtitle: row.expense_amount != null ? String(row.expense_amount) : undefined,
        href: `/expenses?q=${encodeURIComponent(String(row.description ?? row.invoice_no ?? ""))}`,
      }),
    },
    {
      id: "lpo",
      label: "LPOs",
      apiPath: "/lpo-mst",
      listHref: "/lpo",
      permission: P.purchasing.lpo.view,
      mapItem: (row) => ({
        id: `lpo:${row.id ?? row.lpo_no}`,
        label: String(row.lpo_no ?? row.reference ?? `LPO #${row.id}`),
        subtitle: row.supplier_name ? String(row.supplier_name) : undefined,
        href: row.lpo_no ? `/lpo/${row.lpo_no}` : `/lpo?q=${encodeURIComponent(String(row.lpo_no ?? row.reference ?? ""))}`,
      }),
    },
  ],
  hr: [
    {
      id: "employees",
      label: "Employees",
      apiPath: "/employees",
      listHref: "/hr/employees",
      permission: P.hr.employees.view,
      mapItem: (row) => ({
        id: `employee:${row.id}`,
        label: String(row.full_name ?? row.employee_number ?? "Employee"),
        subtitle: row.employee_number ? String(row.employee_number) : undefined,
        href: `/hr/employees/${row.id}`,
      }),
    },
  ],
  accounting: [
    {
      id: "journal_entries",
      label: "Journal entries",
      apiPath: "/journal-entries",
      listHref: "/accounting/journal-entries",
      permission: P.accounting.journal_entries.view,
      mapItem: (row) => ({
        id: `journal:${row.id}`,
        label: String(row.entry_number ?? row.description ?? `Journal #${row.id}`),
        subtitle: row.description ? String(row.description) : undefined,
        href: row.id ? `/accounting/journal-entries/${row.id}` : `/accounting/journal-entries`,
      }),
    },
    {
      id: "customer_invoices",
      label: "Customer invoices",
      apiPath: "/customer-invoices",
      listHref: "/accounting/customer-invoices",
      permission: P.payments.customer_invoices.view,
      mapItem: (row) => ({
        id: `invoice:${row.id}`,
        label: String(row.invoice_number ?? `Invoice #${row.id}`),
        subtitle: row.customer_name ? String(row.customer_name) : undefined,
        href: `/accounting/customer-invoices?q=${encodeURIComponent(String(row.invoice_number ?? ""))}`,
      }),
    },
  ],
  distribution: [
    {
      id: "routes",
      label: "Routes",
      apiPath: "/routes",
      listHref: "/fulfillment/routes",
      permission: P.fulfillment.routes.view,
      mapItem: (row) => ({
        id: `route:${row.id}`,
        label: String(row.route_name ?? `Route #${row.id}`),
        subtitle: row.route_code ? String(row.route_code) : undefined,
        href: `/fulfillment/routes?q=${encodeURIComponent(String(row.route_name ?? ""))}`,
      }),
    },
    {
      id: "drivers",
      label: "Drivers",
      apiPath: "/drivers",
      listHref: "/fulfillment/drivers",
      permission: P.fulfillment.drivers.view,
      mapItem: (row) => ({
        id: `driver:${row.id}`,
        label: String(row.full_name ?? row.driver_code ?? `Driver #${row.id}`),
        subtitle: row.driver_code ? String(row.driver_code) : undefined,
        href: `/fulfillment/drivers?q=${encodeURIComponent(String(row.full_name ?? row.driver_code ?? ""))}`,
      }),
    },
    {
      id: "vehicles",
      label: "Vehicles",
      apiPath: "/vehicles",
      listHref: "/fulfillment/vehicles",
      permission: P.fulfillment.vehicles.view,
      mapItem: (row) => ({
        id: `vehicle:${row.id}`,
        label: String(row.vehicle_name ?? row.plate_number ?? `Vehicle #${row.id}`),
        subtitle: row.plate_number ? String(row.plate_number) : undefined,
        href: `/fulfillment/vehicles?q=${encodeURIComponent(String(row.vehicle_name ?? row.plate_number ?? ""))}`,
      }),
    },
  ],
  admin: [
    {
      id: "users",
      label: "Users",
      apiPath: "/users",
      listHref: "/admin/users",
      permission: P.admin.users.view,
      useAdminApi: true,
      mapItem: (row) => ({
        id: `user:${row.id}`,
        label: String(row.full_name ?? row.username ?? "User"),
        subtitle: row.username ? String(row.username) : undefined,
        href: `/admin/users?q=${encodeURIComponent(String(row.full_name ?? row.username ?? ""))}`,
      }),
    },
    {
      id: "branches",
      label: "Branches",
      apiPath: "/branches",
      listHref: "/admin/branches",
      permission: P.admin.branches.view,
      useAdminApi: true,
      mapItem: (row) => ({
        id: `branch:${row.id}`,
        label: String(row.branch_name ?? row.branch_code ?? "Branch"),
        subtitle: row.branch_code ? String(row.branch_code) : undefined,
        href: `/admin/branches?q=${encodeURIComponent(String(row.branch_name ?? row.branch_code ?? ""))}`,
      }),
    },
  ],
};

export function entitySearchConfigsForWorkspace(workspaceId) {
  return WORKSPACE_ENTITY_SEARCH[workspaceId] ?? [];
}

export function filterEntityConfigsByAccess(configs, hasPermission) {
  return configs.filter((config) => !config.permission || hasPermission(config.permission));
}

export function workspaceSearchPlaceholder(workspaceId, workspaceLabel) {
  const configs = entitySearchConfigsForWorkspace(workspaceId);
  if (configs.length === 0) {
    return `Search ${workspaceLabel} pages…`;
  }

  const samples = configs
    .slice(0, 3)
    .map((config) => config.label.toLowerCase())
    .join(", ");

  return `Search ${samples}, pages…`;
}

/**
 * @param {typeof import("@/lib/api").apiRequest} apiRequest
 * @param {EntitySearchConfig[]} configs
 * @param {string} query
 * @param {{ limitPerType?: number, adminPath?: (path: string) => string, workspaceId?: string, organizationId?: string | number | null }} [options]
 */
export async function searchWorkspaceEntities(apiRequest, configs, query, options = {}) {
  const q = query.trim();
  if (q.length < 2 || configs.length === 0) {
    return [];
  }

  const limitPerType = options.limitPerType ?? 5;
  const adminPath = options.adminPath ?? ((path) => path);
  const workspaceId = options.workspaceId ?? "";

  const groups = await Promise.all(
    configs.map(async (config) => {
      const listHref = `${config.listHref}?q=${encodeURIComponent(q)}`;

      try {
        let items;
        const path =
          config.useAdminApi && workspaceId === "admin"
            ? adminPath(config.apiPath)
            : config.apiPath;
        const res = await apiRequest(path, {
          searchParams: buildPageParams({ page: 1, perPage: limitPerType, q }),
        });
        const rows = Array.isArray(res?.data) ? res.data : [];
        items = rows.map((row) => config.mapItem(row, q));

        return {
          type: config.id,
          label: config.label,
          listHref,
          items,
        };
      } catch {
        return {
          type: config.id,
          label: config.label,
          listHref,
          items: [],
        };
      }
    }),
  );

  return groups;
}

/**
 * @param {ReturnType<typeof searchNavEntries>} navResults
 * @param {Awaited<ReturnType<typeof searchWorkspaceEntities>>} entityGroups
 * @param {string} query
 */
export function buildModuleSearchRows(navResults, entityGroups, query) {
  /** @type {Array<Record<string, unknown>>} */
  const rows = [];
  const trimmed = query.trim();

  if (navResults.length > 0) {
    rows.push({ kind: "heading", id: "heading:pages", label: "Pages" });
    for (const entry of navResults) {
      rows.push({
        kind: "nav",
        id: `nav:${entry.href}`,
        label: entry.label,
        subtitle: [entry.section, entry.group].filter(Boolean).join(" · "),
        href: entry.href,
      });
    }
  }

  for (const group of entityGroups) {
    rows.push({ kind: "heading", id: `heading:${group.type}`, label: group.label });

    for (const item of group.items) {
      rows.push({
        kind: "entity",
        id: item.id,
        label: item.label,
        subtitle: item.subtitle,
        href: item.href,
      });
    }

    rows.push({
      kind: "entity-list",
      id: `all:${group.type}`,
      label: `View all in ${group.label}`,
      subtitle: trimmed ? `Matching “${trimmed}”` : undefined,
      href: group.listHref,
    });
  }

  return rows;
}

export function selectableSearchRows(rows) {
  return rows.filter((row) => row.kind !== "heading" && row.href);
}
