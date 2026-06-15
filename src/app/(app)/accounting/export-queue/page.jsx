"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { CatalogPageShell, PrimaryButton, formatShortDate } from "@/components/catalog/catalog-shared";

export default function ExportQueuePage() {
  const [rows, setRows] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const searchParams = statusFilter ? { status: statusFilter } : undefined;
      const res = await apiRequest("/accounting/export-queue", { searchParams });
      setRows(res.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load export queue");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function processQueue() {
    setWorking(true);
    setMessage(null);
    setError(null);
    try {
      const res = await apiRequest("/accounting/export-queue/process", { method: "POST" });
      setMessage(`Processed ${res.processed ?? 0}: ${res.exported ?? 0} exported, ${res.failed ?? 0} failed.`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to process export queue");
    } finally {
      setWorking(false);
    }
  }

  const counts = useMemo(() => {
    const tally = { pending: 0, exported: 0, failed: 0 };
    for (const row of rows) {
      const key = row.status ?? "pending";
      if (tally[key] !== undefined) tally[key] += 1;
    }
    return tally;
  }, [rows]);

  return (
    <CatalogPageShell
      title="Export Queue"
      subtitle="Accounting > External journal exports"
      actions={
        <PrimaryButton type="button" showIcon={false} disabled={working} onClick={() => void processQueue()}>
          {working ? "Processing…" : "Process pending"}
        </PrimaryButton>
      }
    >
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
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{row.entry_number}</div>
                    <div className="text-xs text-slate-500">{row.description}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatShortDate(row.entry_date)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {row.reference_type} #{row.reference_id}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                        row.status === "exported"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : row.status === "failed"
                            ? "border-red-200 bg-red-50 text-red-800"
                            : "border-amber-200 bg-amber-50 text-amber-800"
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.external_journal_id ?? "—"}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-xs text-red-700">{row.last_error ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </CatalogPageShell>
  );
}
