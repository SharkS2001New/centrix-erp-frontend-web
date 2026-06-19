import { REPORT_CATEGORY_DEFS } from "@/lib/reports/catalog-ui";
import { WORKSPACE_REPORT_MODULES } from "@/lib/workspace-reports";
import { P } from "@/lib/permission-codes";

export function customReportKey(id) {
  return `custom-${id}`;
}

export function customReportHref(id) {
  return `/reports/custom/${id}`;
}

/** @param {{ id: number, name: string, description?: string | null, category_id?: string, report_module?: string | null }} template */
export function templateToReportEntry(template) {
  return {
    key: customReportKey(template.id),
    label: template.name,
    href: customReportHref(template.id),
    isCustom: true,
    reportModule: template.report_module ?? null,
    categoryId: template.category_id ?? "other",
    description: template.description ?? null,
  };
}

/** @param {{ report_module?: string | null }} template @param {string} workspaceId */
export function customReportBelongsToWorkspace(template, workspaceId) {
  const modules = WORKSPACE_REPORT_MODULES[workspaceId] ?? [];
  if (!template.report_module) {
    return workspaceId === "backoffice";
  }

  return modules.includes(template.report_module);
}

/**
 * Merge saved custom reports into built-in hub categories by module.
 * @param {ReturnType<import("@/lib/reports/catalog-ui").buildReportCategories>} categories
 * @param {Array<{ id: number, name: string, description?: string | null, category_id?: string, category_label?: string, report_module?: string | null }>} templates
 */
export function mergeCustomReportsIntoCategories(categories, templates) {
  if (!templates?.length) return categories;

  const defsById = Object.fromEntries(REPORT_CATEGORY_DEFS.map((def) => [def.id, def]));
  const byId = new Map(categories.map((cat) => [cat.id, { ...cat, reports: [...cat.reports] }]));

  for (const template of templates) {
    const entry = templateToReportEntry(template);
    const catId = template.category_id ?? "other";

    if (!byId.has(catId)) {
      const def = defsById[catId];
      byId.set(catId, {
        id: catId,
        title: def?.title ?? template.category_label ?? "Other Reports",
        description: def?.description ?? "Saved custom reports",
        icon: def?.icon ?? "other",
        reports: [],
        count: 0,
      });
    }

    byId.get(catId).reports.push(entry);
  }

  return [...byId.values()]
    .map((cat) => ({
      ...cat,
      reports: cat.reports.sort((a, b) => {
        if (Boolean(a.isCustom) !== Boolean(b.isCustom)) {
          return a.isCustom ? 1 : -1;
        }
        return a.label.localeCompare(b.label);
      }),
      count: cat.reports.length,
    }))
    .filter((cat) => cat.reports.length > 0);
}

/** @param {Array<{ id: number, name: string, category_label?: string, report_module?: string | null }>} templates */
export function buildCustomReportNavItems(templates) {
  return templates
    .map((template) => ({
      href: customReportHref(template.id),
      label: template.name,
      module: template.report_module ?? null,
      permission: P.reports.builder.view,
      group: template.category_label ?? "Other Reports",
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** @param {import("@/lib/nav-config").NavSection[]} sections @param {ReturnType<typeof buildCustomReportNavItems>} customItems */
export function injectCustomReportsIntoNavSections(sections, customItems) {
  if (!customItems.length) return sections;

  return sections.map((section) => {
    if (section.id !== "reports") return section;

    return {
      ...section,
      items: [...section.items, ...customItems],
    };
  });
}
