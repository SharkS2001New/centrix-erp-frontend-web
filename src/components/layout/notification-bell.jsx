"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest, ApiError, notifyActionError } from "@/lib/api";
import { buildAccessContext, resolveTillFloatNavFlag } from "@/lib/access-control";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { notifyError, notifySuccess } from "@/lib/notify";
import { canApproveDiscountRequests } from "@/lib/sales-settings";
import { canApproveLpoRequests } from "@/lib/procurement-settings";
import { resolveNotificationLinkAccess } from "@/lib/notification-action-url";
import { ApprovalNotificationDetails, isDiscountApprovalNotification, isDiscountApprovalOutcomeNotification, isLpoApprovalNotification } from "@/components/notifications/approval-notification-details";
import { NotificationActionLink } from "@/components/notifications/notification-action-link";
import { ActionRequestRejectionDialog } from "@/components/action-request-rejection-dialog";
import { DiscountRejectionDialog } from "@/components/discount-rejection-dialog";
import { discountApprovalLinesFromSource } from "@/lib/advised-discount-lines";

const POLL_MS = 60_000;

function BellIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

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

function NotificationRow({ item, busy, onApprove, onReject, onOpen, onDismiss, canApproveDiscounts, canApproveLpos }) {
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
    <div className="border-b px-4 py-3 last:border-b-0">
      <button type="button" onClick={() => onOpen(item)} className="w-full text-left">
        <div className="flex items-start gap-2.5">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${severityDotClass(item.severity)}`} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className={`truncate text-sm font-medium ${item.is_read ? "text-slate-600" : "text-slate-900"}`}>
              {item.title}
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{item.message}</p>
            <p className="mt-1 text-[11px] text-slate-400">
              {requester} · {item.created_at_human ?? "Just now"}
            </p>
          </div>
        </div>
      </button>
      <div className="pl-4">
        <ApprovalNotificationDetails item={item} />
      </div>

      {canApprove ? (
        <div className="mt-2 flex flex-wrap gap-2 pl-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => onApprove(item)}
            className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onReject(item)}
            className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      ) : (
        <>
          {item.action_url && !hideActionLink ? (
            <div className="mt-2 pl-4">
              <NotificationActionLink actionUrl={item.action_url} />
            </div>
          ) : null}
          {canDismiss ? (
            <div className="mt-2 pl-4">
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
        </>
      )}
    </div>
  );
}

export function NotificationBell() {
  const router = useRouter();
  const { capabilities, user, organization, isSuperAdmin, hasPermission } = useAuth();
  const canApproveDiscounts = canApproveDiscountRequests({ hasPermission });
  const canApproveLpos = canApproveLpoRequests({ hasPermission });
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const rootRef = useRef(null);
  const countInitializedRef = useRef(false);
  const previousCountRef = useRef(0);

  const maybeToastNewOutcomes = useCallback(async () => {
    try {
      const res = await apiRequest("/notifications?limit=10", { loading: false });
      const rows = Array.isArray(res?.data) ? res.data : [];
      const latestOutcome = rows.find((item) => isDiscountApprovalOutcomeNotification(item) && !item.is_read);
      if (!latestOutcome) return;
      if (latestOutcome.severity === "danger") {
        notifyError(latestOutcome.message);
      } else {
        notifySuccess(latestOutcome.message);
      }
    } catch {
      /* non-blocking */
    }
  }, []);

  const fetchCount = useCallback(async () => {
    try {
      const res = await apiRequest("/notifications/unread-count", { loading: false });
      const nextCount = Number(res?.count ?? 0);
      if (countInitializedRef.current && nextCount > previousCountRef.current) {
        void maybeToastNewOutcomes();
      }
      previousCountRef.current = nextCount;
      countInitializedRef.current = true;
      setCount(nextCount);
    } catch {
      /* ignore polling errors */
    }
  }, [maybeToastNewOutcomes]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/notifications?limit=15", { loading: false });
      setItems(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      notifyActionError(err instanceof ApiError ? err : new ApiError("Could not load notifications.", 0), "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCount();
    const timer = setInterval(() => void fetchCount(), POLL_MS);
    return () => clearInterval(timer);
  }, [fetchCount]);

  useEffect(() => {
    if (open) {
      void fetchList();
    }
  }, [open, fetchList]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchCount(), open ? fetchList() : Promise.resolve()]);
  }, [fetchCount, fetchList, open]);

  const markRead = useCallback(async (item) => {
    if (item.is_read) return;
    try {
      await apiRequest(`/notifications/${item.id}/read`, { method: "POST", loading: false });
    } catch {
      /* non-blocking */
    }
  }, []);

  const openItem = useCallback(
    async (item) => {
      await markRead(item);
      if (isDiscountApprovalNotification(item)) {
        void fetchCount();
        return;
      }
      setOpen(false);

      if (!item.action_url) {
        router.push("/notifications");
        void fetchCount();
        return;
      }

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
      } else if (access.message) {
        notifyError(access.message);
        router.push("/notifications");
      } else {
        router.push("/notifications");
      }

      void fetchCount();
    },
    [capabilities, fetchCount, isSuperAdmin, markRead, organization, router, user],
  );

  const approveItem = useCallback(
    async (item) => {
      const requestId = item.action_request?.id;
      if (!requestId) return;
      setBusyId(item.id);
      try {
        await apiRequest(`/action-requests/${requestId}/approve`, { method: "POST", loading: false });
        notifySuccess("Request approved.");
        await refreshAll();
      } catch (err) {
        notifyError(err instanceof ApiError ? err.message : "Could not approve request.");
      } finally {
        setBusyId(null);
      }
    },
    [refreshAll],
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
        await refreshAll();
      } catch (err) {
        notifyError(err instanceof ApiError ? err.message : "Could not reject request.");
      } finally {
        setBusyId(null);
      }
    },
    [rejectTarget, refreshAll],
  );

  const dismissItem = useCallback(
    async (item) => {
      setBusyId(item.id);
      try {
        await apiRequest(`/notifications/${item.id}/dismiss`, { method: "POST", loading: false });
        await refreshAll();
      } catch (err) {
        notifyError(err instanceof ApiError ? err.message : "Could not clear notification.");
      } finally {
        setBusyId(null);
      }
    },
    [refreshAll],
  );

  const clearAll = useCallback(async () => {
    setClearing(true);
    try {
      await apiRequest("/notifications/clear-all", { method: "POST", loading: false });
      notifySuccess("Notifications cleared.");
      await refreshAll();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not clear notifications.");
    } finally {
      setClearing(false);
    }
  }, [refreshAll]);

  const markAllRead = useCallback(async () => {
    setClearing(true);
    try {
      await apiRequest("/notifications/read-all", { method: "POST", loading: false });
      await refreshAll();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not mark notifications as read.");
    } finally {
      setClearing(false);
    }
  }, [refreshAll]);

  const displayCount = count > 99 ? "99+" : String(count);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="app-topbar-icon-btn relative"
        aria-label={count ? `${count} unread notifications` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <BellIcon className="h-5 w-5" />
        {count > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {displayCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b px-4 py-3 dark:border-slate-700">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Notifications {count > 0 ? `(${count})` : ""}
              </h2>
              {items.length > 0 ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={clearing}
                    onClick={() => void markAllRead()}
                    className="text-xs font-medium text-[#185FA5] hover:underline disabled:opacity-50"
                  >
                    Mark read
                  </button>
                  <button
                    type="button"
                    disabled={clearing}
                    onClick={() => void clearAll()}
                    className="text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-50"
                  >
                    Clear all
                  </button>
                </div>
              ) : null}
            </div>

            <div className="max-h-[min(24rem,60vh)] overflow-y-auto">
              {loading ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">Loading…</p>
              ) : items.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">No notifications yet.</p>
              ) : (
                items.map((item) => (
                  <NotificationRow
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
                ))
              )}
            </div>

            <div className="border-t px-4 py-2.5 dark:border-slate-700">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push("/notifications");
                }}
                className="block w-full text-center text-sm font-medium text-[#185FA5] hover:underline"
              >
                View all
              </button>
            </div>
          </div>
        </>
      ) : null}
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
    </div>
  );
}
