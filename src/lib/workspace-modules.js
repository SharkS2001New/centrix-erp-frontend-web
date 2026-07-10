import { WORKSPACE_DISPLAY_ORDER, WORKSPACE_ICONS } from "@/lib/workspace-constants";
import { buildDomainChildrenMap, patchEnabledModules } from "@/lib/module-registry";

const SALES_CHILDREN = ["sales.pos", "sales.mobile", "sales.backend", "sales.dashboard", "sales.reports"];

const BACKOFFICE_SALES_CHILDREN = ["sales.backend", "sales.dashboard", "sales.reports"];

/**
 * Tenant applications shown on the login workspace picker and super-admin Applications tab.
 * Mirrors config/erp_workspaces.php.
 */
export const PROVISIONABLE_WORKSPACES = [
  {
    id: "pos",
    label: "External POS",
    description: "External POS terminal, till sessions, and end of day. Turning this on also enables Backoffice.",
    icon: "pos",
  },
  {
    id: "backoffice",
    label: "Backoffice",
    description: "Sales, inventory, purchasing, and day-to-day operations.",
    icon: "building",
  },
  {
    id: "distribution",
    label: "Distribution",
    description: "Dispatch, trips, fleet, proof of delivery, and logistics reports.",
    icon: "truck",
  },
  {
    id: "accounting",
    label: "Accounting",
    description: "General ledger, payments, receivables, expenses, and financial reports.",
    icon: "chart",
  },
  {
    id: "hr",
    label: "Human Resources",
    description: "Employees, attendance, payroll, and HR reports.",
    icon: "people",
  },
  {
    id: "admin",
    label: "Administration",
    description:
      "Users, roles, branches, company setup, and audit. Organization settings (sales, finance, security, etc.) are configured from the platform.",
    icon: "settings",
  },
];

const WORKSPACE_RANK = new Map(WORKSPACE_DISPLAY_ORDER.map((id, index) => [id, index]));

export function sortProvisionableWorkspaces(workspaces = PROVISIONABLE_WORKSPACES) {
  return [...workspaces].sort(
    (a, b) => (WORKSPACE_RANK.get(a.id) ?? 999) - (WORKSPACE_RANK.get(b.id) ?? 999),
  );
}

function syncSalesDomain(modules) {
  const next = { ...modules };
  next.sales = SALES_CHILDREN.some((key) => Boolean(next[key]));
  return next;
}

/** @param {Record<string, boolean>} enabledModules */
export function isProvisionableWorkspaceEnabled(workspace, enabledModules = {}) {
  switch (workspace.id) {
    case "pos":
      return Boolean(enabledModules["sales.pos"]);
    case "backoffice":
      return (
        Boolean(enabledModules["sales.backend"]) ||
        Boolean(enabledModules.inventory) ||
        Boolean(enabledModules.customers_suppliers)
      );
    case "distribution":
      return Boolean(enabledModules.distribution);
    case "accounting":
      return Boolean(enabledModules.accounting);
    case "hr":
      return Boolean(enabledModules.hr_payroll);
    case "admin":
      return Boolean(enabledModules.admin);
    default:
      return false;
  }
}

function enableWorkspacePatch(workspaceId) {
  switch (workspaceId) {
    case "pos":
      return {
        sales: true,
        "sales.pos": true,
        ...enableWorkspacePatch("backoffice"),
      };
    case "backoffice":
      return {
        sales: true,
        "sales.backend": true,
        "sales.dashboard": true,
        "sales.reports": true,
        inventory: true,
        "inventory.dashboard": true,
        "inventory.reports": true,
        customers_suppliers: true,
        "customers_suppliers.reports": true,
      };
    case "distribution":
      return { distribution: true };
    case "accounting":
      return { accounting: true };
    case "hr":
      return { hr_payroll: true };
    case "admin":
      return { admin: true };
    default:
      return {};
  }
}

function disableWorkspacePatch(workspaceId) {
  switch (workspaceId) {
    case "pos":
      return { "sales.pos": false };
    case "backoffice":
      return {
        "sales.backend": false,
        "sales.dashboard": false,
        "sales.reports": false,
        inventory: false,
        customers_suppliers: false,
      };
    case "distribution":
      return { distribution: false };
    case "accounting":
      return { accounting: false };
    case "hr":
      return { hr_payroll: false };
    case "admin":
      return { admin: false };
    default:
      return {};
  }
}

/**
 * Toggle a login workspace and reconcile overlapping module keys.
 *
 * @param {Record<string, boolean>} enabledModules
 * @param {string} workspaceId
 * @param {boolean} enable
 * @param {Map<string, string[]>} domainChildrenMap
 * @param {boolean} mobileOrdersEnabled
 */
export function patchEnabledModulesForWorkspace(
  enabledModules,
  workspaceId,
  enable,
  domainChildrenMap,
  mobileOrdersEnabled = true,
) {
  const workspace = PROVISIONABLE_WORKSPACES.find((item) => item.id === workspaceId);
  if (!workspace) {
    return enabledModules;
  }

  const patch =
    enable || workspaceId !== "backoffice"
      ? enable
        ? enableWorkspacePatch(workspaceId)
        : disableWorkspacePatch(workspaceId)
      : isProvisionableWorkspaceEnabled(
            PROVISIONABLE_WORKSPACES.find((item) => item.id === "pos"),
            enabledModules,
          )
        ? { ...disableWorkspacePatch("backoffice"), ...disableWorkspacePatch("pos") }
        : disableWorkspacePatch("backoffice");

  let next = patchEnabledModules(enabledModules, patch, domainChildrenMap, mobileOrdersEnabled);

  if (workspaceId === "pos" || workspaceId === "backoffice") {
    next = syncSalesDomain(next);
  }

  return next;
}

export function applicationsFromEnabledModules(enabledModules = {}) {
  const out = {};
  for (const ws of PROVISIONABLE_WORKSPACES) {
    out[ws.id] = isProvisionableWorkspaceEnabled(ws, enabledModules);
  }
  return out;
}

export function modulesFromApplications(applications = {}, moduleOptions = [], mobileOrdersEnabled = true) {
  const domainChildrenMap = buildDomainChildrenMap(moduleOptions);
  let modules = {};
  for (const ws of sortProvisionableWorkspaces()) {
    modules = patchEnabledModulesForWorkspace(
      modules,
      ws.id,
      Boolean(applications[ws.id]),
      domainChildrenMap,
      mobileOrdersEnabled,
    );
  }
  return modules;
}

export function workspaceToggleIcon(iconKey) {
  return WORKSPACE_ICONS[iconKey] ?? WORKSPACE_ICONS.app;
}

export { buildDomainChildrenMap, BACKOFFICE_SALES_CHILDREN, SALES_CHILDREN };
