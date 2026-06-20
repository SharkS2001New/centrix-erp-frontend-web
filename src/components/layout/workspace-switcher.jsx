"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { buildAccessContext } from "@/lib/access-control";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { resolveActiveWorkspace, resolveAvailableWorkspaces, workspaceIcon } from "@/lib/workspaces";
import { WorkspaceApplicationPicker } from "@/components/layout/workspace-application-picker";

function ChevronDownIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function WorkspaceSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
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

  const currentWorkspace = useMemo(
    () => resolveActiveWorkspace(workspaces, getStoredWorkspace(), pathname),
    [workspaces, pathname],
  );

  if (workspaces.length <= 1) {
    return null;
  }

  async function selectWorkspace(id) {
    if (switching || id === currentWorkspace?.id) {
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

  const currentLabel = currentWorkspace?.label ?? "Applications";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="app-topbar-app-switcher"
        aria-expanded={open}
        aria-haspopup="dialog"
        title={`Current application: ${currentLabel}. Click to switch.`}
      >
        {currentWorkspace ? (
          <span className="app-topbar-app-switcher-icon" aria-hidden>
            {workspaceIcon(currentWorkspace.icon)}
          </span>
        ) : null}
        <span className="app-topbar-app-switcher-label hidden max-w-[9rem] truncate sm:inline">
          {currentLabel}
        </span>
        <ChevronDownIcon className="app-topbar-app-switcher-chevron h-4 w-4 shrink-0" />
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
              <div className="min-w-0">
                <p className="text-[13px] font-semibold uppercase tracking-wide">Applications</p>
                {currentWorkspace ? (
                  <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                    Open: <span className="font-medium text-slate-700 dark:text-slate-200">{currentLabel}</span>
                  </p>
                ) : null}
              </div>
              <Link
                href="/choose-workspace"
                className="shrink-0 text-xs font-medium text-[#405189] hover:underline dark:text-[#878a99]"
                onClick={() => setOpen(false)}
              >
                View all
              </Link>
            </div>

            <WorkspaceApplicationPicker
              workspaces={workspaces}
              currentId={currentWorkspace?.id ?? null}
              onSelect={(id) => void selectWorkspace(id)}
              disabled={switching}
              variant="dropdown"
            />

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
