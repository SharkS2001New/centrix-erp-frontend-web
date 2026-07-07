export { useConfirm } from "@/contexts/confirm-context";

/** Standard delete confirmation options for useConfirm(). */
export function confirmDeleteOptions(entityLabel, message) {
  const label = entityLabel ?? "this record";
  return {
    title: "Delete",
    message: message ?? `Delete ${label}? This cannot be undone.`,
    confirmLabel: "Delete",
    destructive: true,
  };
}

/** Standard remove confirmation (attachments, images, non-record items). */
export function confirmRemoveOptions(entityLabel, message) {
  const label = entityLabel ?? "this item";
  return {
    title: "Remove",
    message: message ?? `Remove ${label}?`,
    confirmLabel: "Remove",
    destructive: true,
  };
}
