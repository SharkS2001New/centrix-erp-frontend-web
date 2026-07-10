"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell, PrimaryButton } from "@/components/catalog/catalog-shared";
import { useConfirm } from "@/lib/use-confirm";
import { printPlatformInvoice } from "@/lib/platform-invoice-print";

const STATUS_STYLES = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-blue-100 text-blue-800",
  paid: "bg-emerald-100 text-emerald-800",
  void: "bg-red-100 text-red-800",
};

export default function PlatformInvoicesPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/platform-invoices");
      setInvoices(res.data ?? []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load invoices.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete(invoice) {
    const ok = await confirm({
      title: "Delete invoice?",
      message: `Delete invoice ${invoice.invoice_number}? This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/admin/platform-invoices/${invoice.id}`, { method: "DELETE" });
      notifySuccess("Invoice deleted.");
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to delete invoice.");
    }
  }

  return (
    <CatalogPageShell
      title="Platform invoices"
      subtitle="Create and manage invoices to bill tenant organizations for modules, hosting, and platform services."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/platform/invoice-templates"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Templates
          </Link>
          <Link href="/platform/invoices/new">
            <PrimaryButton type="button">New invoice</PrimaryButton>
          </Link>
        </div>
      }
    >
      <AdminBreadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "Invoices" }]} />

      <div className="theme-panel rounded-xl border shadow-sm">
        {loading ? (
          <p className="px-5 py-8 text-sm text-slate-500">Loading invoices…</p>
        ) : invoices.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-slate-600">No invoices yet.</p>
            <Link href="/platform/invoices/new" className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-800">
              Create your first invoice
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Invoice</th>
                  <th className="px-5 py-3 font-medium">Tenant</th>
                  <th className="px-5 py-3 font-medium">Issue date</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Total</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-slate-50/80">
                    <td className="px-5 py-3 font-medium text-slate-900">{invoice.invoice_number}</td>
                    <td className="px-5 py-3 text-slate-600">
                      {invoice.organization?.org_name ?? invoice.bill_to_name ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{invoice.issue_date?.slice?.(0, 10) ?? invoice.issue_date}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[invoice.status] ?? STATUS_STYLES.draft}`}>
                        {invoice.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-slate-900">
                      {invoice.currency} {Number(invoice.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                          onClick={() => printPlatformInvoice(invoice)}
                        >
                          Print
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
                          onClick={() => router.push(`/platform/invoices/${invoice.id}`)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
                          onClick={() => void handleDelete(invoice)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CatalogPageShell>
  );
}
