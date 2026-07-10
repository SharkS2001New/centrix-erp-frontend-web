/** Leaf constants — keep free of nav/workspace imports to avoid circular init. */

export const WORKSPACE_ICONS = {
  building: "🏢",
  chart: "📊",
  people: "👥",
  pos: "🛒",
  truck: "🚛",
  app: "📱",
  settings: "⚙️",
};

/** Display order for the application switcher and choose-workspace screen. */
export const WORKSPACE_DISPLAY_ORDER = [
  "pos",
  "backoffice",
  "distribution",
  "accounting",
  "hr",
  "admin",
];

/**
 * @param {Array<{ id: string }>} workspaces
 */
export function sortWorkspaces(workspaces) {
  const rank = new Map(WORKSPACE_DISPLAY_ORDER.map((id, index) => [id, index]));
  return [...workspaces].sort(
    (a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999),
  );
}
