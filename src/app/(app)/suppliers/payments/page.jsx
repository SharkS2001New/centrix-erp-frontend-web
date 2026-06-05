"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import {
  CatalogPageShell,
  FilterSelect,
  PaginationBar,
  SearchInput,
  formatShortDate,
} from "@/components/catalog/catalog-shared";
import { formatSupplierKes, formatSupplierPaymentReference } from "@/components/suppliers/suppliers-shared";

const PAGE_SIZE = 15;

export default function SupplierPaymentsPage() {
  const searchParams = useSearchParams();
  const presetSupplier = searchParams.get("supplier_id") ?? searchParams.get("supplier");

  const [payments, setPayments] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [supplierFilter, setSupplierFilter] = useState(presetSupplier ?? "all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const loadData = useCallback(async () => {
    setError(null);
    try {
      const searchParams = { per_page: 200 };
      if (supplierFilter !== "all") {
        searchParams.supplier_id = supplierFilter;
      }
      const [payRes, supRes] = await Promise.all([
        apiRequest("/supplier-payments", { searchParams }),
        apiRequest("/suppliers", { searchParams: { per_page: 200 } }),
      ]);
      setPayments(payRes.data ?? []);
      setSuppliers(supRes.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payments");
    } finally {
      setLoading(false);
    }
  }, [supplierFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (presetSupplier) setSupplierFilter(presetSupplier);
  }, [presetSupplier]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter((p) => {
      const hay = [
        p.supplier_name,
        p.reference_number,
        p.payment_method,
        p.paid_by_name,
        p.lpo_no != null ? `lpo ${p.lpo_no}` : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [payments, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, supplierFilter]);

  const totalPaid = useMemo(
    () => filtered.reduce((sum, p) => sum + Number(p.amount_paid ?? 0), 0),
    [filtered],
  );

  return (
    <CatalogPageShell
      title="Supplier Payments"
      subtitle="Pay suppliers for purchases (accounts payable)"
      action={
        <Link
          href={
            supplierFilter !== "all"
              ? `/suppliers/payments/new?supplier_id=${supplierFilter}&return=payments`
              : "/suppliers/payments/new?return=payments"
          }
          className="inline-flex items-center rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a]"
        >
          Record payment
        </Link>
      }
      toolbar={
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reference, supplier…"
            className="max-w-md"
          />
          <FilterSelect
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            options={[
              { value: "all", label: "All suppliers" },
              ...suppliers.map((s) => ({
                value: String(s.id),
                label: s.supplier_name,
              })),
            ]}
          />
        </div>
      }
    >
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && (
        <p className="mb-4 text-sm text-slate-600">
          Showing {filtered.length} payment{filtered.length === 1 ? "" : "s"} totalling{" "}
          <span className="font-medium text-slate-900">{formatSupplierKes(totalPaid)}</span>
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading payments…</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Supplier</th>
                    <th className="px-4 py-2.5 text-right">Amount</th>
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5">LPO</th>
                    <th className="px-4 py-2.5">Method</th>
                    <th className="px-4 py-2.5">Reference</th>
                    <th className="px-4 py-2.5">Paid by</th>
                  </tr>
                </thead>
                <tbody>
                  {pageSlice.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                        No payments found.
                      </td>
                    </tr>
                  ) : (
                    pageSlice.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                      >
                        <td className="px-4 py-3">{formatShortDate(row.date_paid)}</td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/suppliers/${row.supplier_id}`}
                            className="font-medium text-[#185FA5] hover:underline"
                          >
                            {row.supplier_name ?? "—"}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-emerald-700">
                          {formatSupplierKes(row.amount_paid)}
                          {row.amount_due_snapshot > row.amount_paid ? (
                            <span className="block text-xs font-normal text-slate-500">
                              of {formatSupplierKes(row.amount_due_snapshot)}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          {row.is_partial ? (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                              Partial
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                              Full
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-700">
                          {row.lpo_no ? `#${row.lpo_no}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{row.payment_method}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatSupplierPaymentReference(row)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{row.paid_by_name}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={safePage}
              totalPages={totalPages}
              total={filtered.length}
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
          </>
        )}
      </div>

    </CatalogPageShell>
  );
}
