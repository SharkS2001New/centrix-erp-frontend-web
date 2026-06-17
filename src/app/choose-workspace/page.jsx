"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { AuthGuard } from "@/components/auth-guard";
import { AuthShell } from "@/components/auth/auth-shell";
import { buildAccessContext } from "@/lib/access-control";
import { resolveAvailableWorkspaces, workspaceIcon } from "@/lib/workspaces";

function WorkspaceCard({ workspace, onSelect, disabled }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(workspace.id)}
      disabled={disabled}
      className="group flex w-full items-center gap-5 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-[#185FA5] hover:shadow-md disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-emerald-500 sm:p-6"
    >
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-3xl dark:bg-slate-800" aria-hidden>
        {workspaceIcon(workspace.icon)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold text-slate-900 group-hover:text-[#185FA5] dark:text-white dark:group-hover:text-emerald-400">
          {workspace.label}
        </span>
        <span className="mt-1 block text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          {workspace.description}
        </span>
      </span>
      <span className="shrink-0 text-sm font-semibold text-[#185FA5] dark:text-emerald-400">Open →</span>
    </button>
  );
}

function ChooseWorkspaceContent() {
  const router = useRouter();
  const { user, organization, capabilities, loading, isSuperAdmin, switchWorkspace, logout } = useAuth();
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState(null);

  const ctx = buildAccessContext({
    user,
    organization,
    capabilities,
    requireTillFloat: capabilities?.require_till_float,
    isSuperAdmin,
  });

  const workspaces = resolveAvailableWorkspaces(ctx, capabilities);

  useEffect(() => {
    if (loading || workspaces.length !== 1 || switching) return;
    let cancelled = false;
    (async () => {
      setSwitching(true);
      setSwitchError(null);
      try {
        await switchWorkspace(workspaces[0].id);
        if (!cancelled) router.replace(workspaces[0].home_path);
      } catch (err) {
        if (!cancelled) {
          setSwitchError(err instanceof Error ? err.message : "Could not open application");
        }
      } finally {
        if (!cancelled) setSwitching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, router, switchWorkspace, workspaces]);

  async function selectWorkspace(id) {
    const target = workspaces.find((w) => w.id === id);
    if (!target || switching) return;
    setSwitching(true);
    setSwitchError(null);
    try {
      await switchWorkspace(id);
      router.replace(target.home_path);
    } catch (err) {
      setSwitchError(err instanceof Error ? err.message : "Could not open application");
    } finally {
      setSwitching(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>
    );
  }

  if (switching) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">Opening…</div>
    );
  }

  if (workspaces.length === 0) {
    return (
      <AuthShell title="No applications available" subtitle="Your account does not have access to any enabled modules.">
        <p className="mt-4 text-sm text-slate-500">
          Contact your organization administrator to enable Sales, Accounting, or HR modules.
        </p>
        <button
          type="button"
          onClick={() => void logout()}
          className="mt-6 text-sm font-medium text-slate-600 underline hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
        >
          Sign out
        </button>
      </AuthShell>
    );
  }

  if (workspaces.length === 1) {
    if (switchError) {
      return (
        <AuthShell title="Could not open application" subtitle={workspaces[0].label}>
          <p className="mt-4 text-sm text-red-600 dark:text-red-300">{switchError}</p>
          <button
            type="button"
            disabled={switching}
            onClick={() => void selectWorkspace(workspaces[0].id)}
            className="mt-4 rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#144f8a] disabled:opacity-50"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-3 block text-sm font-medium text-slate-600 underline hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Sign out
          </button>
        </AuthShell>
      );
    }
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">Opening…</div>
    );
  }

  return (
    <AuthShell
      title="Choose application"
      subtitle="Select which system to open. Sign out and sign in again to change application later."
      maxWidthClass="max-w-2xl"
    >
      <div className="mt-8 flex flex-col gap-4">
        {switchError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {switchError}
          </p>
        ) : null}
        {workspaces.map((workspace) => (
          <WorkspaceCard
            key={workspace.id}
            workspace={workspace}
            onSelect={selectWorkspace}
            disabled={switching}
          />
        ))}
      </div>
      <div className="mt-8 border-t border-slate-200 pt-6 dark:border-slate-700">
        <button
          type="button"
          disabled={switching}
          onClick={() => void logout()}
          className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Sign out
        </button>
      </div>
    </AuthShell>
  );
}

export default function ChooseWorkspacePage() {
  return (
    <AuthGuard>
      <ChooseWorkspaceContent />
    </AuthGuard>
  );
}
