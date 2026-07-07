"use client";

import { useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { notifyNotificationsChanged } from "@/lib/notification-events";

export function ApprovalReminderButton({
  actionRequestId,
  canRemind = false,
  onReminded,
  label = "Send approval reminder",
  busyLabel = "Sending…",
  className = "",
  size = "sm",
}) {
  const [busy, setBusy] = useState(false);

  if (!actionRequestId || !canRemind) {
    return null;
  }

  const sizeClass =
    size === "md"
      ? "rounded-lg px-3 py-2 text-sm font-medium"
      : "rounded-md px-2.5 py-1 text-xs font-medium";

  async function sendReminder() {
    setBusy(true);
    try {
      await apiRequest(`/action-requests/${actionRequestId}/remind`, { method: "POST" });
      notifySuccess("Approval reminder sent to managers.");
      notifyNotificationsChanged();
      onReminded?.();
    } catch (error) {
      notifyError(error instanceof ApiError ? error.message : "Could not send approval reminder.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={sendReminder}
      disabled={busy}
      className={`border border-[color-mix(in_srgb,#f59e0b_45%,var(--theme-border))] bg-[color-mix(in_srgb,#f59e0b_10%,var(--theme-surface))] text-[var(--theme-text)] hover:bg-[color-mix(in_srgb,#f59e0b_16%,var(--theme-surface))] disabled:opacity-50 ${sizeClass} ${className}`.trim()}
    >
      {busy ? busyLabel : label}
    </button>
  );
}

export function ApprovalPendingNotice({
  message = "Waiting for manager approval.",
  actionRequest,
  onReminded,
  className = "",
}) {
  if (!actionRequest || actionRequest.status !== "pending") {
    return null;
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[color-mix(in_srgb,#f59e0b_35%,var(--theme-border))] bg-[color-mix(in_srgb,#f59e0b_12%,var(--theme-surface-muted))] px-3 py-2 text-sm text-[var(--theme-text)] ${className}`.trim()}
    >
      <p className="min-w-0">{message}</p>
      <ApprovalReminderButton
        actionRequestId={actionRequest.id}
        canRemind={actionRequest.can_remind}
        onReminded={onReminded}
        size="md"
      />
    </div>
  );
}
