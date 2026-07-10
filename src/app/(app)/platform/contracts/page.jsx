"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  CatalogPageShell,
  FilterSelect,
  PrimaryButton,
  SECONDARY_BTN_CLASS,
} from "@/components/catalog/catalog-shared";
import { PlatformContractViewer } from "@/components/platform/platform-contract-viewer";
import {
  CONTRACT_KINDS,
  CONTRACT_STATUSES,
  CONTRACT_STATUS_STYLES,
  contractKindLabel,
  contractStatusLabel,
  formatBillingDate,
  formatBillingMoney,
} from "@/lib/platform-billing";

export default function PlatformContractsPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewerContract, setViewerContract] = useState(null);
  const [actingId, setActingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const searchParams = {};
      if (kindFilter !== "all") searchParams.kind = kindFilter;
      if (statusFilter !== "all") searchParams.status = statusFilter;
      const res = await apiRequest("/admin/platform-contracts", { searchParams });
      setRows(res.data ?? []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load contracts.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [kindFilter, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openViewer(row) {
    try {
      const detail = await apiRequest(`/admin/platform-contracts/${row.id}`, { loading: false });
      setViewerContract(detail.data ?? detail);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load contract.");
    }
  }

  async function handleDelete(row) {
    const label = row.title || row.reference || contractKindLabel(row.kind) || `#${row.id}`;
    const ok = await confirm({
      title: "Delete contract?",
      message: `Delete “${label}”? This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    setActingId(row.id);
    try {
      await apiRequest(`/admin/platform-contracts/${row.id}`, { method: "DELETE" });
      notifySuccess("Contract deleted.");
      if (viewerContract?.id === row.id) setViewerContract(null);
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not delete contract.");
    } finally {
      setActingId(null);
    }
  }

  async function acceptQuote(row) {
    setActingId(row.id);
    try {
      const res = await apiRequest(`/admin/platform-contracts/${row.id}/accept`, { method: "POST" });
      notifySuccess(res.message ?? "Quote accepted.");
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not accept quote.");
    } finally {
      setActingId(null);
    }
  }

  async function provisionFromContract(row) {
    setActingId(row.id);
    try {
      const res = await apiRequest(`/admin/platform-contracts/${row.id}/provision`, { method: "POST" });
      notifySuccess(res.message ?? "Organization provisioned from contract.");
      const orgId = res.data?.organization_id ?? res.organization_id ?? res.organization?.id;
      const invoiceId = res.data?.invoice_id ?? res.invoice_id;
      const subscriptionId = res.data?.subscription_id ?? res.subscription?.id;

      // If API provisioned the org but skipped subscription, assign from the contract plan.
      if (orgId && !subscriptionId && (row.plan_id || row.first_payment_price != null || row.amount != null)) {
        try {
          await apiRequest("/admin/platform-subscriptions", {
            method: "POST",
            body: {
              organization_id: Number(orgId),
              plan_id: row.plan_id ? Number(row.plan_id) : null,
              status: "active",
              seat_count: Number(row.seat_count) || 1,
              current_period_start: row.start_date || new Date().toISOString().slice(0, 10),
              current_period_end: row.end_date || row.valid_until || null,
              first_payment_price: row.first_payment_price ?? row.amount ?? null,
              renewal_price: row.renewal_price ?? row.amount ?? null,
              license_basis: row.license_basis ?? "org",
              workspace_keys: row.workspace_keys ?? [],
              module_keys: row.module_keys ?? [],
              contract_id: row.id,
            },
          });
          notifySuccess("Subscription created from contract.");
        } catch {
          /* org exists; admin can assign under Subscriptions */
        }
      }

      if (invoiceId) {
        router.push(`/platform/invoices/${invoiceId}`);
      } else if (orgId) {
        router.push(`/platform/organizations/${orgId}`);
      } else {
        await load();
      }
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not provision from contract.");
    } finally {
      setActingId(null);
    }
  }

  return (
    <CatalogPageShell
      title="Contracts & quotes"
      subtitle="Sales motion before billing: quote → accept → provision organization → first invoice."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={SECONDARY_BTN_CLASS} disabled={loading} onClick={() => void load()}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <Link href="/platform/contracts/new">
            <PrimaryButton type="button">New quote</PrimaryButton>
          </Link>
        </div>
      }
    >
      <AdminBreadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "Contracts & quotes" }]} />

      <div className="mb-4 flex flex-wrap gap-3">
        <FilterSelect
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
          options={[
            { value: "all", label: "All types" },
            ...CONTRACT_KINDS.map((row) => ({ value: row.id, label: row.label })),
          ]}
        />
        <FilterSelect
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "all", label: "All statuses" },
            ...CONTRACT_STATUSES.map((row) => ({ value: row.id, label: row.label })),
          ]}
        />
      </div>

      <div className="theme-panel rounded-xl border shadow-sm">
        {loading ? (
          <p className="px-5 py-8 text-sm text-slate-500">Loading contracts…</p>
        ) : rows.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500">
            <p>No quotes or contracts yet.</p>
            <Link href="/platform/contracts/new" className="mt-3 inline-block font-medium text-[#185FA5] hover:underline">
              Create a quote
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Document</th>
                  <th className="px-5 py-3">Organization</th>
                  <th className="px-5 py-3">Amount</th>
                  <th className="px-5 py-3">Dates</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900">{row.title || contractKindLabel(row.kind)}</p>
                      <p className="text-xs text-slate-500">
                        {contractKindLabel(row.kind)}
                        {row.reference ? ` · ${row.reference}` : ""}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      {row.organization?.org_name ?? row.customer_name ?? "—"}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-slate-700">
                      {formatBillingMoney(row.amount, row.currency)}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {formatBillingDate(row.start_date || row.created_at)}
                      {row.valid_until ? (
                        <span className="block text-xs">Valid until {formatBillingDate(row.valid_until)}</span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${CONTRACT_STATUS_STYLES[row.status] ?? CONTRACT_STATUS_STYLES.draft}`}
                      >
                        {contractStatusLabel(row.status)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <button
                          type="button"
                          className="text-sm font-medium text-[#185FA5] hover:underline"
                          onClick={() => void openViewer(row)}
                        >
                          View PDF
                        </button>
                        <button
                          type="button"
                          className="text-xs text-slate-600 hover:underline"
                          onClick={() => router.push(`/platform/contracts/${row.id}`)}
                        >
                          Edit
                        </button>
                        {row.kind === "quote" && row.status !== "accepted" && row.status !== "void" ? (
                          <button
                            type="button"
                            disabled={actingId === row.id}
                            className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50"
                            onClick={() => void acceptQuote(row)}
                          >
                            Accept quote
                          </button>
                        ) : null}
                        {(row.status === "accepted" || row.status === "active") && !row.organization_id ? (
                          <button
                            type="button"
                            disabled={actingId === row.id}
                            className="text-xs font-medium text-indigo-700 hover:underline disabled:opacity-50"
                            onClick={() => void provisionFromContract(row)}
                          >
                            Provision org + invoice
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={actingId === row.id}
                          className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                          onClick={() => void handleDelete(row)}
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

      <PlatformContractViewer
        open={Boolean(viewerContract)}
        contract={viewerContract}
        expanded
        onClose={() => setViewerContract(null)}
      />
    </CatalogPageShell>
  );
}
