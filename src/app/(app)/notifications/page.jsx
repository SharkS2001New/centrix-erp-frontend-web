"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { ApprovalNotificationDetails } from "@/components/notifications/approval-notification-details";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";

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

function NotificationCard({ item, busy, onApprove, onReject, onOpen, onDismiss }) {
  const requester = item.requester?.full_name ?? item.requester?.username ?? "System";
  const canApprove = item.type === "approval" && item.action_request?.can_approve && item.action_request?.status === "pending";
  const canDismiss = !canApprove;

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
          {item.action_url ? (
            <Link href={item.action_url} className="rounded-md px-3 py-1.5 text-xs font-medium text-[#185FA5] hover:bg-[#185FA5]/10">
              View document
            </Link>
          ) : null}
        </div>
      ) : item.action_url ? (
        <div className="mt-3 pl-5">
          <Link href={item.action_url} className="text-xs font-medium text-[#185FA5] hover:underline">
            Open related screen
          </Link>
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
  const [bucket, setBucket] = useState("pending_approvals");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [meta, setMeta] = useState(null);

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
      if (item.action_url) router.push(item.action_url);
    },
    [markRead, router],
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

  const rejectItem = useCallback(
    async (item) => {
      const requestId = item.action_request?.id;
      if (!requestId) return;
      const reason = window.prompt("Reason for rejection (required):");
      if (!reason || reason.trim().length < 3) {
        if (reason !== null) notifyError("Rejection reason must be at least 3 characters.");
        return;
      }
      setBusyId(item.id);
      try {
        await apiRequest(`/action-requests/${requestId}/reject`, {
          method: "POST",
          body: { reason: reason.trim() },
          loading: false,
        });
        notifySuccess("Request rejected.");
        await load();
      } catch (err) {
        notifyError(err instanceof ApiError ? err.message : "Could not reject request.");
      } finally {
        setBusyId(null);
      }
    },
    [load],
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
            />
          ))}
        </div>
      )}
    </CatalogPageShell>
  );
}
