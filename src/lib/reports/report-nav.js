import {
  BACKOFFICE_FINANCE_REPORT_MODULES,
  isBackofficeFinanceReport,
} from "@/lib/backoffice-finance-reports";
import { resolveNavHrefIcon } from "@/lib/nav-item-icons";
import { reportModuleForSlug } from "@/lib/module-registry";
import { reportPermissionCode } from "@/lib/permission-codes";
import { REPORT_CATEGORY_DEFS, reportHref, isMultiBranchReportKey } from "@/lib/reports/catalog-ui";
import { DISTRIBUTION_REPORT_DEFS } from "@/lib/reports/distribution-reports";
import { REPORT_DEFINITIONS } from "@/lib/reports/definitions";
import { HR_REPORT_DEFS } from "@/lib/reports/hr-reports";

/** Sidebar group labels — aligned with Reports hub categories. */
const GROUP_BY_CATEGORY = {
  sales: "Sales reports",
  distribution: "Distribution reports",
  customers: "Customers & receivables",
  inventory: "Inventory reports",
  purchases: "Purchasing reports",
  pos: "POS reports",
  finance: "Finance reports",
  compliance: "Compliance reports",
  hr: "Payroll & workforce",
  other: "Other reports",
};

const LABEL_OVERRIDES = {
  "items-currently-in-stock": "Items currently in stock",
  "purchases-by-supplier": "Purchases summary",
  "sales-by-user": "Sales by user",
};

function lookupReportLabel(key) {
  if (LABEL_OVERRIDES[key]) return LABEL_OVERRIDES[key];

  const hr = HR_REPORT_DEFS.find((row) => row.key === key);
  if (hr?.label) return hr.label;

  const distribution = DISTRIBUTION_REPORT_DEFS.find((row) => row.key === key);
  if (distribution?.label) return distribution.label;

  const def = REPORT_DEFINITIONS[key];
  if (def?.title) return def.title.replace(/ Report$/i, "");

  return key
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function lookupReportIcon(key, href) {
  const hr = HR_REPORT_DEFS.find((row) => row.key === key);
  if (hr?.icon) return hr.icon;

  const distribution = DISTRIBUTION_REPORT_DEFS.find((row) => row.key === key);
  if (distribution?.icon) return distribution.icon;

  return resolveNavHrefIcon(href);
}

function moduleAnyForReportKey(key) {
  if (isBackofficeFinanceReport(key)) {
    return BACKOFFICE_FINANCE_REPORT_MODULES;
  }
  return undefined;
}

/**
 * Build sidebar nav items for every report listed in the Reports hub catalog.
 * Visibility is enforced later via isNavItemVisible (module + canViewReport).
 *
 * @returns {import("@/lib/nav-config").NavItem[]}
 */
export function buildCatalogReportNavItems() {
  const items = [];
  const seenKeys = new Set();
  const seenHrefs = new Set();

  for (const category of REPORT_CATEGORY_DEFS) {
    const group = GROUP_BY_CATEGORY[category.id] ?? category.title;

    for (const key of category.keys) {
      if (seenKeys.has(key)) continue;

      const href = reportHref(key);
      if (seenHrefs.has(href)) continue;

      seenKeys.add(key);
      seenHrefs.add(href);

      items.push({
        href,
        label: lookupReportLabel(key),
        module: reportModuleForSlug(key),
        moduleAny: moduleAnyForReportKey(key),
        permission: reportPermissionCode(key),
        icon: lookupReportIcon(key, href),
        reportKey: key,
        group,
        requireMultiBranchCatalog: isMultiBranchReportKey(key),
      });
    }
  }

  return items;
}
