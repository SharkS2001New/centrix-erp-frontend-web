import { getSalesOrderQueueWorkflow, salesOrderQueueNavItems } from "@/lib/order-workflow";
import { isMobileOrdersEnabled, isPosTillFloatRequired } from "@/lib/sales-settings";
import { isNavItemVisible, navSections } from "@/lib/nav-config";
import { filterNavSectionsForWorkspace, defaultWorkspaceId } from "@/lib/workspaces";

/**
 * Build sidebar sections visible for the active workspace (shared by sidebar + global search).
 */
export function buildWorkspaceNavSections({
  capabilities,
  navContext,
  workspaceId,
  isSuperAdmin,
}) {
  const requireTillFloat = isPosTillFloatRequired(capabilities?.module_settings);
  const workflow = getSalesOrderQueueWorkflow(capabilities, "backend");
  const includeMobile = isMobileOrdersEnabled(capabilities?.module_settings);
  const salesOrderNavItems = salesOrderQueueNavItems(workflow, { includeMobile }).map((item) => ({
    href: item.href,
    label: item.label,
    module: "sales.backend",
    permission: "sales.orders.view",
    exact: item.slug === "all",
    group: "Sales orders",
    ordersNav: false,
  }));

  const withOrders = navSections
    .filter((section) => !section.superAdminOnly || isSuperAdmin?.())
    .map((section) => ({
      ...section,
      items: section.items.flatMap((item) => {
        if (item.ordersNav) {
          return salesOrderNavItems.filter((navItem) => isNavItemVisible(navItem, navContext));
        }
        return isNavItemVisible(item, navContext) ? [item] : [];
      }),
    }))
    .filter((section) => section.items.length > 0);

  const resolvedWorkspaceId = workspaceId ?? defaultWorkspaceId(capabilities, navContext);

  if (!resolvedWorkspaceId) {
    return withOrders;
  }

  return filterNavSectionsForWorkspace(withOrders, resolvedWorkspaceId, navContext);
}

/** Flatten nav sections into searchable entries for the current module/workspace. */
export function flattenNavSearchEntries(sections) {
  const entries = [];

  for (const section of sections) {
    const sectionLabel = section.label ?? section.id;
    entries.push({
      id: `section:${section.id}`,
      kind: "section",
      label: sectionLabel,
      href: section.items[0]?.href ?? null,
      section: sectionLabel,
      group: null,
      keywords: sectionLabel,
    });

    for (const item of section.items) {
      const group = item.group ?? null;
      entries.push({
        id: item.href,
        kind: "link",
        label: item.label,
        href: item.href,
        section: sectionLabel,
        group,
        keywords: [item.label, group, sectionLabel, item.href.replace(/\//g, " ")].filter(Boolean).join(" "),
      });
    }
  }

  return entries;
}

export function searchNavEntries(entries, query, { limit = 12 } = {}) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scored = [];

  for (const entry of entries) {
    if (!entry.href && entry.kind === "section") continue;

    const label = entry.label.toLowerCase();
    const keywords = entry.keywords.toLowerCase();
    let score = 0;

    if (label === q) score = 100;
    else if (label.startsWith(q)) score = 80;
    else if (label.includes(q)) score = 60;
    else if (keywords.includes(q)) score = 40;
    else continue;

    if (entry.kind === "link") score += 5;
    scored.push({ entry, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label))
    .slice(0, limit)
    .map(({ entry }) => entry);
}
