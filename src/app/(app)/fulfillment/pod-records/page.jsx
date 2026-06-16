"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetchBlob, apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { isDistributionOpsEnabled } from "@/lib/distribution-settings";
import {
  CatalogPageShell,
  Field,
  FilterSelect,
  PrimaryButton,
  SearchInput,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-shared";
import { saleCustomerLabel } from "@/lib/sales";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "complete", label: "Complete" },
  { value: "partial", label: "Partial" },
  { value: "refused", label: "Refused" },
];

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export default function PodRecordsPage() {
  const { capabilities } = useAuth();
  const distributionEnabled = isDistributionOpsEnabled(capabilities);

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState(() => isoDate(new Date(Date.now() - 7 * 86400000)));
  const [toDate, setToDate] = useState(() => isoDate());
  const [previewUrl, setPreviewUrl] = useState(null);

  const loadData = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest("/pod-records", {
        searchParams: {
          per_page: 200,
          from_date: fromDate,
          to_date: toDate,
          ...(statusFilter !== "all" ? { "filter[status]": statusFilter } : {}),
        },
      });
      setRecords(res.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load POD records");
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => {
      return (
        String(r.recipient_name ?? "").toLowerCase().includes(q) ||
        String(r.sale?.order_num ?? r.sale_id).toLowerCase().includes(q)
      );
    });
  }, [records, search]);

  async function previewImage(path) {
    try {
      const blob = await apiFetchBlob(path);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch {
      setError("Could not load image");
    }
  }

  if (!distributionEnabled) {
    return (
      <CatalogPageShell title="Proof of delivery" subtitle="Delivery confirmations and signatures">
        <p className="text-sm text-slate-500">
          Enable distribution operations in Admin → Settings → Distribution.
        </p>
      </CatalogPageShell>
    );
  }

  return (
    <CatalogPageShell title="Proof of delivery" subtitle="Review delivery confirmations, photos, and signatures">
      <DashboardErrorBanner message={error} />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search recipient or order…" className="max-w-xs" />
        <Field label="From">
          <input type="date" className={inputClassName()} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </Field>
        <Field label="To">
          <input type="date" className={inputClassName()} value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </Field>
        <Field label="Status">
          <FilterSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} options={STATUS_OPTIONS} />
        </Field>
        <PrimaryButton type="button" showIcon={false} onClick={() => loadData()}>
          Refresh
        </PrimaryButton>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading POD records…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-500">No proof-of-delivery records in this period.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Captured</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Received by</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Attachments</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((record) => (
                <tr key={record.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{new Date(record.captured_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <Link href={`/sales/orders/${record.sale_id}`} className="font-mono text-[#185FA5] hover:underline">
                      {record.sale?.order_num ?? record.sale_id}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{record.sale ? saleCustomerLabel(record.sale) : "—"}</td>
                  <td className="px-4 py-3">{record.recipient_name}</td>
                  <td className="px-4 py-3 capitalize">{record.status}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {record.photo_path ? (
                        <button
                          type="button"
                          className="text-xs text-[#185FA5] hover:underline"
                          onClick={() => previewImage(`/pod-records/${record.id}/photo/file`)}
                        >
                          Photo
                        </button>
                      ) : null}
                      {record.signature_path ? (
                        <button
                          type="button"
                          className="text-xs text-[#185FA5] hover:underline"
                          onClick={() => previewImage(`/pod-records/${record.id}/signature/file`)}
                        >
                          Signature
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {previewUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPreviewUrl(null)}>
          <img src={previewUrl} alt="POD attachment" className="max-h-[80vh] max-w-full rounded-lg bg-white p-2" />
        </div>
      ) : null}
    </CatalogPageShell>
  );
}
