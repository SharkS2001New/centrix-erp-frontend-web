import {
  getSalesOrderQueueWorkflow,
  salesOrderSidebarNavItems,
  salesTerminalOrderQueueNavItems,
} from "@/lib/order-workflow";
import { isOrderCancellationNavEnabled, isOrderExpiryNavEnabled, isDiscountApprovalNavEnabled } from "@/lib/platform-org-features";
import {
  isOrgMobileSalesEnabled,
  isTillFloatWorkflowEnabled,
  loadingListNavHref,
} from "@/lib/sales-settings";
import { userHasMobileChannel } from "@/lib/mobile-order-scope";
import { isNavItemVisible, isNavSectionVisible, navSections } from "@/lib/nav-config";
import { withNavItemIcon } from "@/lib/nav-item-icons";
import { formatNavLabel } from "@/lib/nav-label-format";
import {
  canViewOrderQueue,
  orderQueuePermissionCode,
} from "@/lib/order-queue-permissions";
import { defaultWorkspaceId, filterNavSectionsForWorkspace } from "@/lib/workspaces";

function mapSalesOrderNavItem(item) {
  return withNavItemIcon({
    href: item.href,
    label: formatNavLabel(item.label),
    module: "sales.backend",
    permission: orderQueuePermissionCode(item.slug),
    orderQueueSlug: item.slug,
    exact: item.slug === "all",
    ordersNav: false,
  });
}

/**
 * Build sidebar sections visible for the active workspace (shared by sidebar + global search).
 */
export function buildWorkspaceNavSections({
  capabilities,
  navContext,
  workspaceId,
  isSuperAdmin,
}) {
  const requireTillFloat = isTillFloatWorkflowEnabled(capabilities?.module_settings);
  const workflow = getSalesOrderQueueWorkflow(capabilities, "backend");
  const includeMobile =
    isOrgMobileSalesEnabled(capabilities) &&
    userHasMobileChannel(navContext.user?.login_channels);
  const salesOrderNavItems = [
    ...salesOrderSidebarNavItems(workflow, { excludeMobile: true }),
    ...salesTerminalOrderQueueNavItems({
      showPendingApproval: isDiscountApprovalNavEnabled(capabilities),
      showEditable: isDiscountApprovalNavEnabled(capabilities),
      showCancelled: isOrderCancellationNavEnabled(capabilities),
      showExpired: isOrderExpiryNavEnabled(capabilities),
    }),
  ].map(mapSalesOrderNavItem);
  const mobileOrderNavItems = includeMobile
    ? [
        withNavItemIcon({
          href: "/sales/orders/queues/mobile",
          label: "Mobile Orders",
          module: "sales.backend",
          permission: orderQueuePermissionCode("mobile"),
          orderQueueSlug: "mobile",
          ordersNav: false,
        }),
      ]
    : [];

  const withOrders = navSections
    .filter((section) => !section.superAdminOnly || isSuperAdmin?.())
    .map((section) => ({
      ...section,
      items: section.items.flatMap((item) => {
        if (item.ordersNav) {
          return salesOrderNavItems.filter(
            (navItem) =>
              isNavItemVisible(navItem, navContext) &&
              canViewOrderQueue(navItem.orderQueueSlug, navContext.hasPermission),
          );
        }
        if (item.mobileOrdersNav) {
          return mobileOrderNavItems.filter(
            (navItem) =>
              isNavItemVisible(navItem, navContext) &&
              canViewOrderQueue(navItem.orderQueueSlug, navContext.hasPermission),
          );
        }
        if (!isNavItemVisible(item, navContext)) return [];
        if (item.requireLoadingListNav) {
          return [{ ...item, href: loadingListNavHref(capabilities) }];
        }
        return [item];
      }),
    }))
    .filter((section) => isNavSectionVisible(section, navContext))
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
    if (!entry.href || entry.kind !== "link") continue;

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

  const results = [];
  const seenHrefs = new Set();

  for (const { entry } of scored.sort(
    (a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label),
  )) {
    if (seenHrefs.has(entry.href)) continue;
    seenHrefs.add(entry.href);
    results.push(entry);
    if (results.length >= limit) break;
  }

  return results;
}
