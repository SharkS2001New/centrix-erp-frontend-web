"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { PodAttachmentLink } from "@/components/fulfillment/pod-attachment-preview";

function formatCapturedAt(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

/**
 * Loads and displays POD record(s) for a sale — used on order detail and trip reconciliation.
 */
export function PodRecordSummary({ saleId, compact = false }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!saleId) {
      setRecords([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("/pod-records", {
        searchParams: { per_page: 5, "filter[sale_id]": saleId },
        loading: false,
      });
      setRecords(res.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load proof of delivery.");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [saleId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <p className="theme-subtext text-sm">
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-[#185FA5] align-[-2px]" />{" "}
        Loading proof of delivery…
      </p>
    );
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!records.length) {
    return compact ? null : <p className="theme-subtext text-sm">No proof of delivery captured.</p>;
  }

  const record = records[0];

  return (
    <div className={compact ? "space-y-1 text-sm" : "theme-panel rounded-xl border p-4 shadow-sm"}>
      {!compact ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="theme-heading text-sm font-semibold">Proof of delivery</h3>
          <Link href="/fulfillment/pod-records" className="text-xs font-medium text-[#185FA5] hover:underline">
            All POD records
          </Link>
        </div>
      ) : null}
      <dl className={compact ? "space-y-1" : "grid gap-3 sm:grid-cols-2"}>
        <div>
          <dt className="theme-subtext text-xs">Received by</dt>
          <dd className="font-medium text-slate-800">{record.recipient_name ?? "—"}</dd>
        </div>
        <div>
          <dt className="theme-subtext text-xs">Captured</dt>
          <dd className="font-medium text-slate-800">{formatCapturedAt(record.captured_at)}</dd>
        </div>
        <div>
          <dt className="theme-subtext text-xs">Status</dt>
          <dd className="font-medium capitalize text-slate-800">{record.status ?? "—"}</dd>
        </div>
        {record.notes ? (
          <div className={compact ? "" : "sm:col-span-2"}>
            <dt className="theme-subtext text-xs">Notes</dt>
            <dd className="text-slate-700">{record.notes}</dd>
          </div>
        ) : null}
      </dl>
      {(record.photo_path || record.signature_path) && (
        <div className={`flex flex-wrap gap-3 ${compact ? "mt-2" : "mt-4 border-t border-slate-100 pt-3"}`}>
          {record.photo_path ? (
            <PodAttachmentLink recordId={record.id} kind="photo" label="View photo" />
          ) : null}
          {record.signature_path ? (
            <PodAttachmentLink recordId={record.id} kind="signature" label="View signature" />
          ) : null}
        </div>
      )}
      {record.lines?.length > 0 && !compact ? (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-left font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2 text-right">Delivered</th>
                <th className="px-3 py-2 text-right">Refused</th>
              </tr>
            </thead>
            <tbody>
              {record.lines.map((line) => (
                <tr key={line.id ?? line.sale_item_id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    {line.sale_item?.product?.product_name ?? line.sale_item?.product_code ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right">{line.qty_delivered ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{line.qty_refused ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
