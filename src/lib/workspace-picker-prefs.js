const STORAGE_KEY = "pos-erp-workspace-picker-layout";

/** @typedef {"horizontal" | "vertical"} WorkspacePickerLayout */

/** @returns {WorkspacePickerLayout} */
export function getWorkspacePickerLayout() {
  if (typeof window === "undefined") return "horizontal";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "vertical" ? "vertical" : "horizontal";
  } catch {
    return "horizontal";
  }
}

/** @param {WorkspacePickerLayout} layout */
export function setWorkspacePickerLayout(layout) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, layout === "vertical" ? "vertical" : "horizontal");
  } catch {
    /* ignore quota errors */
  }
}
