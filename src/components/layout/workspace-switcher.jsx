"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { buildAccessContext } from "@/lib/access-control";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { resolveAvailableWorkspaces, workspaceIcon } from "@/lib/workspaces";

function AppsGridIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

export function WorkspaceSwitcher() {
  const router = useRouter();
  const { user, organization, capabilities, isSuperAdmin, switchWorkspace } = useAuth();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState(null);

  const ctx = useMemo(
    () =>
      buildAccessContext({
        user,
        organization,
        capabilities,
        requireTillFloat: capabilities?.require_till_float,
        isSuperAdmin,
      }),
    [capabilities, isSuperAdmin, organization, user],
  );

  const workspaces = useMemo(
    () => resolveAvailableWorkspaces(ctx, capabilities),
    [capabilities, ctx],
  );

  const currentId = getStoredWorkspace();

  if (workspaces.length <= 1) {
    return null;
  }

  async function selectWorkspace(id) {
    if (switching || id === currentId) {
      setOpen(false);
      return;
    }

    const target = workspaces.find((w) => w.id === id);
    if (!target) return;

    setSwitching(true);
    setError(null);
    try {
      await switchWorkspace(id);
      setOpen(false);
      router.push(target.home_path);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch application");
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="app-topbar-icon-btn"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Switch application"
      >
        <AppsGridIcon className="h-[18px] w-[18px]" />
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close applications menu"
            onClick={() => setOpen(false)}
          />
          <div className="velzon-apps-dropdown absolute right-0 z-50 mt-2 w-[320px] sm:w-[360px]" role="dialog">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <p className="text-[13px] font-semibold uppercase tracking-wide">Applications</p>
              <Link
                href="/choose-workspace"
                className="text-xs font-medium text-[#405189] hover:underline dark:text-[#878a99]"
                onClick={() => setOpen(false)}
              >
                View all
              </Link>
            </div>

            <div className="grid grid-cols-3 gap-2 p-3">
              {workspaces.map((workspace) => {
                const active = workspace.id === currentId;
                return (
                  <button
                    key={workspace.id}
                    type="button"
                    disabled={switching}
                    onClick={() => void selectWorkspace(workspace.id)}
                    className={`velzon-app-tile flex flex-col items-center rounded-lg border px-2 py-3 text-center transition disabled:opacity-60 ${
                      active ? "velzon-app-tile-active" : ""
                    }`}
                  >
                    <span className="velzon-app-tile-icon mb-2 flex h-10 w-10 items-center justify-center rounded-lg text-xl">
                      {workspaceIcon(workspace.icon)}
                    </span>
                    <span className="line-clamp-2 text-[11px] font-medium leading-tight">
                      {workspace.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {error ? (
              <p className="border-t px-4 py-2 text-xs text-red-600 dark:text-red-400">{error}</p>
            ) : null}
            {switching ? (
              <p className="border-t px-4 py-2 text-xs text-slate-500">Switching…</p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
