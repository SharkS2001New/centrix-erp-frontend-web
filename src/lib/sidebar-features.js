import { navSections } from "@/lib/nav-config";

const seenHrefs = new Set();

export const SIDEBAR_FEATURE_CATALOG = navSections.flatMap((section) => {
  if (section.id === "platform" || section.superAdminOnly) return [];

  return section.items.flatMap((item) => {
    const href = item.sidebarFeatureKey ?? item.href;
    if (!href || seenHrefs.has(href)) return [];
    seenHrefs.add(href);
    return [{
      key: href,
      href,
      label: item.label,
      sectionId: section.id,
      sectionLabel: section.label ?? section.id,
    }];
  });
});

export function normalizeSidebarFeatures(raw, defaultValue = true) {
  return Object.fromEntries(
    SIDEBAR_FEATURE_CATALOG.map(({ key }) => [
      key,
      raw && Object.prototype.hasOwnProperty.call(raw, key)
        ? Boolean(raw[key])
        : defaultValue,
    ]),
  );
}
