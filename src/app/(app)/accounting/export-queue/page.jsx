"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useQueuedTask } from "@/lib/use-queued-task";
import { useOrgFormat } from "@/lib/org-format";
import { CatalogPageShell, PrimaryButton } from "@/components/catalog/catalog-shared";

export default function ExportQueuePage() {
  const { shortDate } = useOrgFormat();
  const [rows, setRows] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [integration, setIntegration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const { runQueuedTask, overlayNode } = useQueuedTask("Please wait while export queue items are processed…");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const searchParams = statusFilter ? { status: statusFilter } : undefined;
      const [res, statusRes] = await Promise.all([
        apiRequest("/accounting/export-queue", { searchParams }),
        apiRequest("/accounting/integration/status").catch(() => null),
      ]);
      setRows(res.data ?? []);
      setIntegration(statusRes);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load export queue");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function processQueue(retryFailed = false) {
    setWorking(true);
    setMessage(null);
    setError(null);
    try {
      const path = retryFailed ? "/accounting/export-queue/retry-failed" : "/accounting/export-queue/process";
      const res = await runQueuedTask(() => apiRequest(path, { method: "POST" }), {
        message: retryFailed
          ? "Please wait while failed exports are retried…"
          : "Please wait while pending exports are processed…",
      });
      if (retryFailed) {
        setMessage(
          `Retried ${res.reset ?? 0} failed item(s): ${res.exported ?? 0} exported, ${res.failed ?? 0} failed.`,
        );
      } else {
        setMessage(`Processed ${res.processed ?? 0}: ${res.exported ?? 0} exported, ${res.failed ?? 0} failed.`);
      }
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to process export queue");
    } finally {
      setWorking(false);
    }
  }

  const counts = useMemo(() => {
    const tally = { pending: 0, exported: 0, failed: 0, stub: 0 };
    for (const row of rows) {
      const key = row.status ?? "pending";
      if (tally[key] !== undefined) tally[key] += 1;
      if (String(row.external_journal_id ?? "").startsWith("QBO-STUB-")) tally.stub += 1;
    }
    return tally;
  }, [rows]);

  const qbMode = integration?.quickbooks_mode ?? "unknown";
  const connected = integration?.connection?.status === "connected";

  return (
    <CatalogPageShell
      title="Export Queue"
      subtitle="Accounting > External journal exports"
      actions={
        <div className="flex flex-wrap gap-2">
          <PrimaryButton
            type="button"
            showIcon={false}
            disabled={working}
            onClick={() => void processQueue(false)}
          >
            {working ? "Processing…" : "Process pending"}
          </PrimaryButton>
          {counts.failed > 0 ? (
            <button
              type="button"
              disabled={working}
              onClick={() => void processQueue(true)}
              className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              Retry failed
            </button>
          ) : null}
        </div>
      }
    >
      {integration ? (
        <div className="mb-4 space-y-2">
          <p
            className={`rounded-lg border px-4 py-3 text-sm ${
              qbMode === "stub"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : connected
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-slate-200 bg-slate-50 text-slate-700"
            }`}
          >
            {qbMode === "stub" ? (
              <>
                <strong>Stub mode</strong> — QuickBooks client credentials are not configured. Exports receive
                fake IDs (<code className="text-xs">QBO-STUB-…</code>) without calling Intuit. Add credentials in{" "}
                <Link href="/admin/settings" className="font-medium underline">
                  Finance settings
                </Link>
                , connect OAuth, and map accounts for live export.
              </>
            ) : connected ? (
              <>
                QuickBooks is connected (realm {integration.connection?.realm_id ?? "—"}). Live journal export is
                active when you process the queue.
              </>
            ) : (
              <>
                QuickBooks credentials are set but not connected. Open{" "}
                <Link href="/admin/settings" className="font-medium underline">
                  Finance settings
                </Link>{" "}
                to connect OAuth before processing exports.
              </>
            )}
          </p>
          {integration.pending_exports > 0 ? (
            <p className="text-sm text-slate-600">
              {integration.pending_exports} pending export(s) waiting to be processed.
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}
      {message ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <select
          className="rounded-lg border border-slate-300 px-3 py-2"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="pending">Pending ({counts.pending})</option>
          <option value="exported">Exported ({counts.exported})</option>
          <option value="failed">Failed ({counts.failed})</option>
        </select>
        <Link href="/accounting/account-mappings" className="font-medium text-[#185FA5] hover:underline">
          Account mappings
        </Link>
        <Link href="/admin/settings" className="font-medium text-[#185FA5] hover:underline">
          Finance settings
        </Link>
      </div>

      <div className={`overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm ${loading ? "opacity-60" : ""}`}>
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Entry</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">External ID</th>
              <th className="px-4 py-3">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No export queue items{statusFilter ? ` with status "${statusFilter}"` : ""}.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isStub = String(row.external_journal_id ?? "").startsWith("QBO-STUB-");
                return (
                  <tr key={row.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{row.entry_number}</div>
                      <div className="text-xs text-slate-500">{row.description}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{shortDate(row.entry_date)}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.reference_type} #{row.reference_id}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          row.status === "exported"
                            ? isStub
                              ? "border-amber-200 bg-amber-50 text-amber-800"
                              : "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : row.status === "failed"
                              ? "border-red-200 bg-red-50 text-red-800"
                              : "border-amber-200 bg-amber-50 text-amber-800"
                        }`}
                      >
                        {row.status}
                        {isStub ? " (stub)" : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.external_journal_id ?? "—"}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-xs text-red-700" title={row.last_error ?? ""}>
                      {row.last_error ?? "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {overlayNode}
    </CatalogPageShell>
  );
}
