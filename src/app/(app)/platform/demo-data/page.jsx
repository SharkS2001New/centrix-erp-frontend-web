"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  CatalogPageShell,
  PrimaryButton,
  SECONDARY_BTN_CLASS,
} from "@/components/catalog/catalog-shared";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { SPA_STORAGE_KEY } from "@/lib/spa/seed";
import { useConfirm } from "@/lib/use-confirm";

function clearLocalSalonDemo() {
  try {
    window.localStorage.removeItem(SPA_STORAGE_KEY);
  } catch {
    // The salon sample lives in this browser only. A blocked store is not fatal.
  }
}

export default function PlatformDemoDataPage() {
  const confirm = useConfirm();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const data = await apiRequest("/admin/demo-data");
    setStatus(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .catch((error) => {
        if (!cancelled) {
          notifyError(error instanceof ApiError ? error.message : "Could not load demo data status.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function generate() {
    const ok = await confirm({
      title: "Generate demo data",
      message: status?.loaded
        ? "Replace the current demo organisations with a fresh set? Organisations you registered yourself stay in place."
        : "Create the driving school, salon, and hotel demo organisations? Organisations you registered yourself stay in place.",
      confirmLabel: status?.loaded ? "Replace demo data" : "Generate demo data",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const data = await apiRequest("/admin/demo-data", { method: "POST" });
      clearLocalSalonDemo();
      setStatus(data);
      notifySuccess(data.message || "Demo organisations are ready.");
    } catch (error) {
      notifyError(error instanceof ApiError ? error.message : "Could not generate demo data.");
    } finally {
      setBusy(false);
    }
  }

  async function rollback() {
    const ok = await confirm({
      title: "Roll back demo data",
      message:
        "Permanently delete the demo organisations and everything in them? Organisations you registered yourself stay in place.",
      confirmLabel: "Roll back",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const data = await apiRequest("/admin/demo-data", { method: "DELETE" });
      clearLocalSalonDemo();
      setStatus(data);
      notifySuccess(data.message || "Demo organisations were removed.");
    } catch (error) {
      notifyError(error instanceof ApiError ? error.message : "Could not roll back demo data.");
    } finally {
      setBusy(false);
    }
  }

  const organizations = status?.organizations ?? [];

  return (
    <>
      <AdminBreadcrumb
        items={[
          { label: "Platform", href: "/platform" },
          { label: "Demo data" },
        ]}
      />
      <CatalogPageShell
        title="Demo data"
        subtitle="Create sample organisations for a driving school, a salon, and a hotel, then remove only those organisations in one step."
        navigationReady={!loading}
        action={
          <>
            <button
              type="button"
              className={SECONDARY_BTN_CLASS}
              onClick={() => void rollback()}
              disabled={busy || loading || !status?.loaded}
            >
              Roll back
            </button>
            <PrimaryButton showIcon={false} onClick={() => void generate()} disabled={busy || loading}>
              {status?.loaded ? "Replace demo data" : "Generate demo data"}
            </PrimaryButton>
          </>
        }
      >
        <section className="theme-panel mb-4 rounded-xl border p-5 shadow-sm">
          <p className="theme-subtext text-sm">
            Sign in to a demo organisation with its company code, username{" "}
            <span className="theme-heading font-medium">{status?.username || "admin"}</span>, and password{" "}
            <span className="theme-heading font-medium">{status?.password || "password"}</span>.
            Rollback deletes only organisations created here.
          </p>
          {status?.loaded && status.generated_at ? (
            <p className="theme-subtext mt-2 text-sm">
              Loaded {new Date(status.generated_at).toLocaleString()}.
            </p>
          ) : null}
        </section>
        <div className="grid gap-3 md:grid-cols-3">
          {organizations.map((org) => (
            <article key={org.company_code} className="theme-panel rounded-xl border p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <h2 className="theme-heading text-base font-semibold">{org.org_name}</h2>
                <span className="theme-subtext text-xs font-medium uppercase tracking-wide">
                  {org.present ? "Loaded" : "Not loaded"}
                </span>
              </div>
              <p className="theme-subtext mt-2 text-sm">{org.summary}</p>
              <dl className="mt-4 space-y-1 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="theme-subtext">Company code</dt>
                  <dd className="theme-heading font-medium">{org.company_code}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="theme-subtext">Username</dt>
                  <dd className="theme-heading font-medium">{org.username}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="theme-subtext">Administrator</dt>
                  <dd className="theme-heading font-medium">{org.admin_name}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </CatalogPageShell>
    </>
  );
}
