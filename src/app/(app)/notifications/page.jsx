"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest, ApiError } from "@/lib/api";
import { buildAccessContext, resolveTillFloatNavFlag } from "@/lib/access-control";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { notifyError, notifySuccess } from "@/lib/notify";
import { canApproveDiscountRequests } from "@/lib/sales-settings";
import { canApproveLpoRequests } from "@/lib/procurement-settings";
import { ApprovalNotificationDetails, isDiscountApprovalNotification, isLpoApprovalNotification } from "@/components/notifications/approval-notification-details";
import { resolveNotificationLinkAccess } from "@/lib/notification-action-url";
import { NotificationActionLink } from "@/components/notifications/notification-action-link";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { ActionRequestRejectionDialog } from "@/components/action-request-rejection-dialog";
import { DiscountRejectionDialog } from "@/components/discount-rejection-dialog";
import { discountApprovalLinesFromSource } from "@/lib/advised-discount-lines";

const BUCKETS = [
  { key: "pending_approvals", label: "Pending approvals" },
  { key: "unread", label: "Unread updates" },
  { key: "", label: "All notifications" },
  { key: "read", label: "Read notifications" },
];

function severityDotClass(severity) {
  switch (severity) {
    case "warning":
      return "bg-amber-400";
    case "danger":
      return "bg-red-500";
    case "success":
      return "bg-emerald-500";
    case "urgent":
      return "bg-red-600";
    default:
      return "bg-slate-400";
  }
}

function NotificationCard({ item, busy, onApprove, onReject, onOpen, onDismiss, canApproveDiscounts, canApproveLpos }) {
  const requester = item.requester?.full_name ?? item.requester?.username ?? "System";
  const discountApproval = isDiscountApprovalNotification(item);
  const lpoApproval = isLpoApprovalNotification(item);
  const canApprove =
    item.type === "approval" &&
    item.action_request?.can_approve &&
    item.action_request?.status === "pending" &&
    (!discountApproval || canApproveDiscounts) &&
    (!lpoApproval || canApproveLpos);
  const canDismiss = !canApprove;
  const hideActionLink = discountApproval || lpoApproval;

  return (
    <article className="rounded-lg border bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <button type="button" onClick={() => onOpen(item)} className="w-full text-left">
        <div className="flex items-start gap-3">
          <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${severityDotClass(item.severity)}`} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={`text-sm font-semibold ${item.is_read ? "text-slate-600" : "text-slate-900 dark:text-slate-100"}`}>
                {item.title}
              </h3>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {item.type}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.message}</p>
            <p className="mt-2 text-xs text-slate-400">
              {requester} · {item.created_at_human ?? "Just now"}
            </p>
          </div>
        </div>
      </button>
      <div className="pl-5">
        <ApprovalNotificationDetails item={item} />
      </div>

      {canApprove ? (
        <div className="mt-3 flex flex-wrap gap-2 pl-5">
          <button
            type="button"
            disabled={busy}
            onClick={() => onApprove(item)}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onReject(item)}
            className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      ) : item.action_url && !hideActionLink ? (
        <div className="mt-3 pl-5">
          <NotificationActionLink actionUrl={item.action_url} />
        </div>
      ) : null}
      {canDismiss ? (
        <div className="mt-3 pl-5">
          <button
            type="button"
            disabled={busy}
            onClick={() => onDismiss(item)}
            className="text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      ) : null}
    </article>
  );
}

export default function NotificationsPage() {
  const router = useRouter();
  const { capabilities, user, organization, isSuperAdmin, hasPermission } = useAuth();
  const canApproveDiscounts = canApproveDiscountRequests({ hasPermission, capabilities });
  const canApproveLpos = canApproveLpoRequests({ hasPermission, capabilities });
  const [bucket, setBucket] = useState("pending_approvals");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [meta, setMeta] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);

  const bucketLabel = useMemo(() => BUCKETS.find((b) => b.key === bucket)?.label ?? "Notifications", [bucket]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/notifications/all", {
        searchParams: {
          bucket: bucket || undefined,
          per_page: 30,
        },
      });
      setItems(Array.isArray(res?.data) ? res.data : []);
      setMeta(res?.meta ?? null);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }, [bucket]);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = useCallback(async (item) => {
    if (item.is_read) return;
    try {
      await apiRequest(`/notifications/${item.id}/read`, { method: "POST", loading: false });
    } catch {
      /* ignore */
    }
  }, []);

  const openItem = useCallback(
    async (item) => {
      await markRead(item);
      if (isDiscountApprovalNotification(item)) {
        return;
      }
      if (!item.action_url) return;

      const access = resolveNotificationLinkAccess(item.action_url, {
        capabilities,
        ctx: buildAccessContext({
          user,
          organization,
          capabilities,
          requireTillFloat: resolveTillFloatNavFlag(capabilities),
          isSuperAdmin,
        }),
        storedWorkspaceId: getStoredWorkspace(),
      });

      if (access.canOpen && access.normalizedUrl) {
        router.push(access.normalizedUrl);
        return;
      }

      if (access.message) {
        notifyError(access.message);
      }
    },
    [capabilities, isSuperAdmin, markRead, organization, router, user],
  );

  const approveItem = useCallback(
    async (item) => {
      const requestId = item.action_request?.id;
      if (!requestId) return;
      setBusyId(item.id);
      try {
        await apiRequest(`/action-requests/${requestId}/approve`, { method: "POST", loading: false });
        notifySuccess("Request approved.");
        await load();
      } catch (err) {
        notifyError(err instanceof ApiError ? err.message : "Could not approve request.");
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const rejectItem = useCallback((item) => {
    const requestId = item.action_request?.id;
    if (!requestId) return;
    setRejectTarget({
      requestId,
      notificationId: item.id,
      isDiscount: isDiscountApprovalNotification(item),
      approvalLines: discountApprovalLinesFromSource(item),
    });
  }, []);

  const submitRejectItem = useCallback(
    async (payload) => {
      if (!rejectTarget) return;
      setBusyId(rejectTarget.notificationId);
      try {
        const body =
          typeof payload === "string"
            ? { reason: payload.trim() }
            : {
                reason: payload.reason.trim(),
                discount_guidance: payload.discount_guidance,
                advised_discount_lines: payload.advised_discount_lines,
                advised_discount_amount: payload.advised_discount_amount,
              };
        await apiRequest(`/action-requests/${rejectTarget.requestId}/reject`, {
          method: "POST",
          body,
          loading: false,
        });
        notifySuccess("Request rejected.");
        setRejectTarget(null);
        await load();
      } catch (err) {
        notifyError(err instanceof ApiError ? err.message : "Could not reject request.");
      } finally {
        setBusyId(null);
      }
    },
    [rejectTarget, load],
  );

  const markAllRead = useCallback(async () => {
    try {
      await apiRequest("/notifications/read-all", { method: "POST", loading: false });
      notifySuccess("All notifications marked as read.");
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not mark notifications as read.");
    }
  }, [load]);

  const clearAll = useCallback(async () => {
    try {
      await apiRequest("/notifications/clear-all", { method: "POST", loading: false });
      notifySuccess("Notifications cleared.");
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not clear notifications.");
    }
  }, [load]);

  const dismissItem = useCallback(
    async (item) => {
      setBusyId(item.id);
      try {
        await apiRequest(`/notifications/${item.id}/dismiss`, { method: "POST", loading: false });
        await load();
      } catch (err) {
        notifyError(err instanceof ApiError ? err.message : "Could not clear notification.");
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  return (
    <CatalogPageShell
      title="Notifications"
      description="Approvals, updates, and alerts that need your attention."
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="rounded-md border px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Mark all read
          </button>
          <button
            type="button"
            onClick={() => void clearAll()}
            className="rounded-md border px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Clear all
          </button>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {BUCKETS.map((tab) => (
          <button
            key={tab.key || "all"}
            type="button"
            onClick={() => setBucket(tab.key)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              bucket === tab.key
                ? "bg-[#185FA5] text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{bucketLabel}</h2>
        {meta?.total != null ? <span className="text-sm text-slate-500">{meta.total} total</span> : null}
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-slate-500">Loading notifications…</p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed py-12 text-center text-sm text-slate-500">No notifications in this section.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <NotificationCard
              key={item.id}
              item={item}
              busy={busyId === item.id}
              onApprove={approveItem}
              onReject={rejectItem}
              onOpen={openItem}
              onDismiss={dismissItem}
              canApproveDiscounts={canApproveDiscounts}
              canApproveLpos={canApproveLpos}
            />
          ))}
        </div>
      )}
      {rejectTarget?.isDiscount ? (
        <DiscountRejectionDialog
          open={Boolean(rejectTarget)}
          busy={Boolean(rejectTarget && busyId === rejectTarget.notificationId)}
          approvalLines={rejectTarget?.approvalLines ?? []}
          onSubmit={submitRejectItem}
          onCancel={() => {
            if (!busyId) setRejectTarget(null);
          }}
        />
      ) : (
        <ActionRequestRejectionDialog
          open={Boolean(rejectTarget)}
          busy={Boolean(rejectTarget && busyId === rejectTarget.notificationId)}
          title="Reject request"
          description="Enter a reason for rejecting this approval request."
          onSubmit={submitRejectItem}
          onCancel={() => {
            if (!busyId) setRejectTarget(null);
          }}
        />
      )}
    </CatalogPageShell>
  );
}
