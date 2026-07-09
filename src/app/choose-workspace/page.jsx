"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { AuthGuard } from "@/components/auth-guard";
import { AuthShell } from "@/components/auth/auth-shell";
import { WorkspaceOpeningScreen } from "@/components/branding/workspace-opening-screen";
import { buildAccessContext, resolveTillFloatNavFlag } from "@/lib/access-control";
import { persistWorkspaceRouteBeforeSwitch, recallWorkspaceLandingPath } from "@/lib/workspace-navigation";
import { resolveAvailableWorkspaces } from "@/lib/workspaces";
import { WorkspaceApplicationPicker } from "@/components/layout/workspace-application-picker";
import { SignOutButton } from "@/components/layout/sign-out-button";

function ChooseWorkspaceContent() {
  const router = useRouter();
  const { user, organization, capabilities, loading, isSuperAdmin, switchWorkspace, logout } = useAuth();
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState(null);

  const ctx = buildAccessContext({
    user,
    organization,
    capabilities,
    requireTillFloat: resolveTillFloatNavFlag(capabilities),
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
        const resumePath = recallWorkspaceLandingPath(
          user?.id,
          organization?.id,
          workspaces[0].id,
          capabilities,
          ctx,
        );
        await switchWorkspace(workspaces[0].id);
        if (!cancelled) router.replace(resumePath);
      } catch (err) {
        if (!cancelled) {
          setSwitchError(err instanceof Error ? err.message : "Could not open application");
          setSwitching(false);
        }
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
      const resumePath = recallWorkspaceLandingPath(user?.id, organization?.id, id, capabilities, ctx);
      await switchWorkspace(id);
      router.replace(resumePath);
    } catch (err) {
      setSwitchError(err instanceof Error ? err.message : "Could not open application");
      setSwitching(false);
    }
  }

  const signOutAction = (
    <SignOutButton disabled={switching} onClick={() => void logout()} />
  );

  if (loading) {
    return <WorkspaceOpeningScreen message="Opening" />;
  }

  if (switching) {
    return <WorkspaceOpeningScreen message="Opening" />;
  }

  if (workspaces.length === 0) {
    return (
      <AuthShell title="No applications available" subtitle="Your account does not have access to any enabled modules." headerActions={signOutAction}>
        <p className="mt-4 text-sm text-slate-500">
          Contact your organization administrator to enable Sales, Accounting, or HR modules.
        </p>
      </AuthShell>
    );
  }

  if (workspaces.length === 1) {
    if (switchError) {
      return (
        <AuthShell title="Could not open application" subtitle={workspaces[0].label} headerActions={signOutAction}>
          <p className="mt-4 text-sm text-red-600 dark:text-red-300">{switchError}</p>
          <button
            type="button"
            disabled={switching}
            onClick={() => void selectWorkspace(workspaces[0].id)}
            className="mt-4 rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#144f8a] disabled:opacity-50"
          >
            Try again
          </button>
        </AuthShell>
      );
    }
    return <WorkspaceOpeningScreen message="Opening" />;
  }

  return (
    <AuthShell
      title="Choose application"
      subtitle="Select which system to open."
      maxWidthClass="max-w-3xl"
      headerActions={signOutAction}
    >
      <div className="mt-8">
        {switchError ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {switchError}
          </p>
        ) : null}
        <WorkspaceApplicationPicker
          workspaces={workspaces}
          onSelect={selectWorkspace}
          disabled={switching}
          variant="page"
        />
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
