"use client";

import { useCallback, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import {
  CatalogPageShell,
  PrimaryButton,
  SECONDARY_BTN_CLASS,
} from "@/components/catalog/catalog-shared";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { notifyError, notifySuccess } from "@/lib/notify";

function StatusPill({ ok }) {
  const label = ok === true ? "OK" : ok === false ? "Fail" : "N/A";
  const className =
    ok === true
      ? "bg-emerald-100 text-emerald-800"
      : ok === false
        ? "bg-red-100 text-red-800"
        : "bg-slate-100 text-slate-600";

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}

function formatCheckedAt(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export default function PlatformHealthPage() {
  const [loading, setLoading] = useState(false);
  const [reverbBusy, setReverbBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [reverbTest, setReverbTest] = useState(null);

  const runTests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/platform-health", { loading: false });
      setResult(res);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Health check failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const sendReverbNotification = useCallback(async () => {
    setReverbBusy(true);
    setReverbTest(null);
    try {
      const res = await apiRequest("/admin/platform-health/reverb-test", {
        method: "POST",
        loading: false,
      });
      setReverbTest(res);
      if (res?.ok) {
        notifySuccess(
          "Test notification sent over Reverb — watch the bell badge update without refreshing.",
        );
      } else {
        notifyError(res?.message || "Reverb test failed");
      }
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Reverb test failed";
      setReverbTest({ ok: false, message });
      notifyError(message);
    } finally {
      setReverbBusy(false);
    }
  }, []);

  const checks = Array.isArray(result?.checks) ? result.checks : [];

  return (
    <CatalogPageShell
      title="Infrastructure health"
      subtitle="Quick tests for this app pod, Reverb realtime, scheduler, queue workers, and sibling pods."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={reverbBusy}
            onClick={() => void sendReverbNotification()}
            className={`${SECONDARY_BTN_CLASS} px-4 py-2 disabled:opacity-50`}
          >
            {reverbBusy ? "Sending…" : "Send Reverb test"}
          </button>
          <PrimaryButton type="button" showIcon={false} onClick={() => void runTests()} disabled={loading}>
            {loading ? "Running…" : result ? "Run again" : "Run tests"}
          </PrimaryButton>
        </div>
      }
    >
      <AdminBreadcrumb
        items={[
          { label: "Platform", href: "/platform" },
          { label: "Infrastructure health" },
        ]}
      />

      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <p>
          <strong className="text-slate-800">Send Reverb test</strong> creates a real in-app
          notification for you and broadcasts it on your private channel. If the bell updates live
          (no refresh), Reverb is working end-to-end.
        </p>
        <p className="mt-2">
          Scheduler needs cron running <code className="rounded bg-white px-1">schedule:run</code>{" "}
          every minute. Queue needs <code className="rounded bg-white px-1">queue:work</code> unless
          the driver is <code className="rounded bg-white px-1">sync</code>.
        </p>
        <p className="mt-2">
          Optional peers:{" "}
          <code className="rounded bg-white px-1">PLATFORM_PEER_HEALTH_URLS</code> (comma-separated
          API bases).
        </p>
      </div>

      {reverbTest ? (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
            reverbTest.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          <p className="font-medium">{reverbTest.ok ? "Reverb broadcast sent" : "Reverb test failed"}</p>
          <p className="mt-1">{reverbTest.message}</p>
          {reverbTest.notification_id ? (
            <p className="mt-1 text-xs opacity-80">Notification #{reverbTest.notification_id}</p>
          ) : null}
        </div>
      ) : null}

      {!result && !loading ? (
        <p className="text-sm text-slate-500">Click Run tests to probe this environment.</p>
      ) : null}

      {result ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <StatusPill ok={result.ok} />
            <span>
              Overall:{" "}
              <strong className="text-slate-900">{result.ok ? "Healthy" : "Issues found"}</strong>
            </span>
            <span className="text-slate-400">·</span>
            <span>Host: {result.hostname ?? "—"}</span>
            <span className="text-slate-400">·</span>
            <span>Checked: {formatCheckedAt(result.checked_at)}</span>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5">Check</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Detail</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((check) => (
                  <tr key={check.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-900">{check.label}</td>
                    <td className="px-4 py-3">
                      <StatusPill ok={check.ok} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">{check.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </CatalogPageShell>
  );
}
