"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { UserPermissionMatrix } from "@/components/admin/user-permission-matrix";
import { ActiveBadge, PrimaryButton } from "@/components/catalog/catalog-shared";
import { formatLoginChannels } from "@/lib/login-channels";

export function UserDetailModal({
  open,
  user,
  roleName,
  branchName,
  matrix,
  rolePermissionIds,
  grantedIds,
  deniedIds,
  permLoading,
  permSaving,
  permError,
  onClose,
  onTogglePermission,
  onSavePermissions,
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === "Escape" && !permSaving) onClose?.();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, permSaving]);

  if (!open || !mounted || !user) return null;

  const canEditPermissions = !user.is_admin;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !permSaving) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-detail-modal-title"
        className="theme-modal flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">User details</p>
            <h2 id="user-detail-modal-title" className="mt-1 truncate text-lg font-semibold text-slate-900">
              {user.full_name}
            </h2>
            <p className="mt-0.5 truncate text-sm text-slate-500">
              @{user.username} · {roleName ?? "No role"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={permSaving}
            className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs uppercase text-slate-500">Email</dt>
              <dd className="text-slate-800">{user.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">Login channels</dt>
              <dd className="mt-0.5 text-slate-900">{formatLoginChannels(user.login_channels)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">Branch</dt>
              <dd className="text-slate-800">{branchName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">Access scope</dt>
              <dd className="text-slate-800">{user.access_scope === "org" ? "Organization" : "Branch"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">Login</dt>
              <dd>
                <ActiveBadge active={user.is_active !== false} />
              </dd>
            </div>
          </dl>

          <div className="mt-6">
            <h3 className="text-sm font-medium text-slate-900">Permissions</h3>
            <p className="mt-1 text-xs text-slate-500">
              Permissions start from the user&apos;s role. Uncheck a role permission to revoke it for this user only,
              or check extra boxes to grant additional rights.
            </p>

            {user.is_admin ? (
              <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Administrators have all permissions. Per-user overrides do not apply.
              </p>
            ) : permLoading ? (
              <p className="mt-4 text-sm text-slate-500">Loading permissions…</p>
            ) : (
              <>
                {permError ? (
                  <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {permError}
                  </p>
                ) : null}
                <div className="mt-4 overflow-x-auto">
                  <UserPermissionMatrix
                    matrix={matrix}
                    rolePermissionIds={rolePermissionIds}
                    grantedIds={grantedIds}
                    deniedIds={deniedIds}
                    onToggle={onTogglePermission}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={permSaving}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Close
          </button>
          {canEditPermissions ? (
            <PrimaryButton
              type="button"
              showIcon={false}
              onClick={onSavePermissions}
              disabled={permSaving || permLoading}
            >
              {permSaving ? "Saving…" : "Save permission overrides"}
            </PrimaryButton>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
