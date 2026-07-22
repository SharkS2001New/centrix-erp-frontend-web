"use client";

import { notifyError } from "@/lib/notify";
import { useCallback, useEffect, useState } from "react";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { formatShortDate, PencilIcon } from "@/components/catalog/catalog-shared";
import {
  DocumentsPanel,
  LpoDetailDrawer,
  PaymentsPanel,
  PurchasesPanel,
} from "@/components/suppliers/supplier-profile-panels";
import {
  SupplierStatusBadge,
  formatSupplierKes,
} from "@/components/suppliers/suppliers-shared";
import { lpoRowDisplayNumber } from "@/components/lpo/lpo-shared";
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "purchases", label: "Purchases" },
  { id: "payments", label: "Payments" },
  { id: "documents", label: "Documents" },
];

export function SuppliersIdScreen() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supplierId = params.id;

  const [tab, setTab] = useState(() => {
    const fromUrl = searchParams.get("tab");
    return TABS.some((t) => t.id === fromUrl) ? fromUrl : "overview";
  });
  const [summary, setSummary] = useState(null);
  const [selectedLpo, setSelectedLpo] = useState(null);
  const [lpoDrawerOpen, setLpoDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest(`/suppliers/${supplierId}/summary`);
      setSummary(data);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load supplier");
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useTabAwareDataLoad(loadData);

  useEffect(() => {
    const fromUrl = searchParams.get("tab");
    if (fromUrl && TABS.some((t) => t.id === fromUrl)) {
      setTab(fromUrl);
    }
  }, [searchParams]);

  const supplier = summary?.supplier;
  const stats = summary?.stats;
  const purchases = summary?.purchases ?? [];

  function selectLpo(row) {
    const full =
      purchases.find((p) => p.lpo_no === row.lpo_no) ??
      (row.lpo_no ? { lpo_no: row.lpo_no, ...row } : null);
    if (!full) return;
    setSelectedLpo(full);
    setLpoDrawerOpen(true);
  }

  return (
    <div className="theme-workspace min-h-full">
      <AppBreadcrumb
        items={[
          { label: "Suppliers", href: "/suppliers" },
          {
            label: supplier
              ? supplier.supplier_name || supplier.supplier_code || "Supplier"
              : "Supplier",
          },
        ]}
      />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium text-slate-900">Supplier Profile</h1>
        </div>
        {supplier && (
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/reports/supplier-statement?supplier_id=${supplier.id}`}
              className="inline-flex items-center rounded-lg border border-[#185FA5] px-4 py-2 text-sm font-medium text-[#185FA5] hover:bg-[#E6F1FB]"
            >
              Supplier Statement
            </Link>
            <Link
              href={`/lpo/new?supplier_id=${supplier.id}`}
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-[#185FA5] hover:bg-slate-50"
            >
              New purchase order
            </Link>
            <Link
              href={`/suppliers/returns/new?supplier_id=${supplier.id}`}
              className="inline-flex items-center rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-800 hover:bg-orange-100"
            >
              Record return
            </Link>
            <button
              type="button"
              onClick={() => router.push(`/suppliers/${supplier.id}/edit`)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a]"
            >
              <PencilIcon />
              Edit supplier
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading supplier…</p>
      ) : supplier ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(320px,38%)_minmax(0,1fr)]">
          <div className="space-y-6">
            <div className="theme-panel rounded-xl border p-6 shadow-sm">
              <p className="text-2xl font-semibold text-slate-900">{supplier.supplier_name}</p>
              <dl className="mt-6 space-y-4 text-sm">
                <DetailRow label="Contact Person" value={supplier.contact_person} />
                <DetailRow label="Phone" value={supplier.phone} />
                <DetailRow label="Alt. phone" value={supplier.alternate_phone} />
                <DetailRow label="Email" value={supplier.email} />
                <DetailRow label="KRA PIN" value={supplier.tax_pin} />
                <DetailRow label="Terms of payment" value={supplier.terms_of_payment} />
                <DetailRow
                  label="Amount owing"
                  value={formatSupplierKes(supplier.current_balance)}
                  highlight={Number(supplier.current_balance ?? 0) > 0}
                />
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Status
                  </dt>
                  <dd className="mt-1">
                    <SupplierStatusBadge active={supplier.is_active} />
                  </dd>
                </div>
                {supplier.address ? (
                  <DetailRow label="Address" value={supplier.address} />
                ) : null}
                {supplier.town ? <DetailRow label="Town" value={supplier.town} /> : null}
              </dl>
            </div>

            <div className="theme-panel rounded-xl border p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Purchase Summary</h2>
              <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <StatItem
                  label="Total Purchases (LPO)"
                  value={formatSupplierKes(stats?.total_purchases)}
                />
                <StatItem label="Total Paid" value={formatSupplierKes(stats?.total_paid)} />
                <StatItem label="Open LPOs" value={String(stats?.open_lpo_count ?? 0)} />
                <StatItem label="Invoices" value={String(stats?.invoice_count ?? 0)} />
                <StatItem
                  label="Last Delivery"
                  value={stats?.last_delivery ? formatShortDate(stats.last_delivery) : "—"}
                />
                <StatItem
                  label="Average Lead Time"
                  value={
                    stats?.average_lead_time_days != null
                      ? `${stats.average_lead_time_days} Days`
                      : "—"
                  }
                />
              </dl>
            </div>
          </div>

          <div className="theme-panel rounded-xl border shadow-sm">
            <div className="flex flex-wrap gap-1 border-b border-slate-200 px-4 pt-3">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`rounded-t-lg px-4 py-2 text-sm font-medium ${
                    tab === t.id
                      ? "border border-b-white border-slate-200 bg-white text-[#185FA5]"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-5">
              {tab === "overview" && (
                <OverviewTab
                  supplier={supplier}
                  stats={stats}
                  purchases={purchases}
                  onOpenLpo={selectLpo}
                />
              )}
              {tab === "purchases" && (
                <PurchasesPanel
                  items={purchases}
                  supplierId={supplier.id}
                  onSelectLpo={selectLpo}
                />
              )}
              {tab === "payments" && (
                <PaymentsPanel items={summary?.payments ?? []} supplier={supplier} />
              )}
              {tab === "documents" && (
                <DocumentsPanel
                  items={summary?.documents ?? []}
                  onSelectLpo={(row) => {
                    const full = purchases.find((p) => p.lpo_no === row.lpo_no);
                    if (full) selectLpo(full);
                  }}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}

      <LpoDetailDrawer
        lpo={selectedLpo}
        open={lpoDrawerOpen}
        onClose={() => setLpoDrawerOpen(false)}
        supplierId={supplier?.id}
      />
    </div>
  );
}

function DetailRow({ label, value, highlight }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd
        className={`mt-0.5 ${highlight ? "font-medium text-amber-700" : "text-slate-800"}`}
      >
        {value || "—"}
      </dd>
    </div>
  );
}

function StatItem({ label, value }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 font-medium text-slate-900">{value}</p>
    </div>
  );
}

function OverviewTab({ supplier, stats, purchases, onOpenLpo }) {
  const recent = purchases.slice(0, 5);

  return (
    <div className="space-y-6 text-sm">
      <p className="text-slate-700">
        Procure-to-pay for <strong>{supplier.supplier_name}</strong>: LPOs record orders,
        supplier invoices support three-way match, and payments reduce accounts payable.
      </p>
      <ul className="list-inside list-disc space-y-1 text-slate-600">
        <li>Amount owing (payable): {formatSupplierKes(supplier.current_balance)}</li>
        <li>Total LPO value: {formatSupplierKes(stats?.total_purchases)}</li>
        <li>Payments posted: {formatSupplierKes(stats?.total_paid)}</li>
      </ul>
      {recent.length > 0 && (
        <div>
          <h3 className="mb-2 font-semibold text-slate-900">Recent LPOs</h3>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {recent.map((row) => (
              <li key={row.lpo_no} className="flex items-center justify-between px-3 py-2">
                <button
                  type="button"
                  onClick={() => onOpenLpo(row)}
                  className="font-mono text-[#185FA5] hover:underline"
                >
                  {lpoRowDisplayNumber(row)}
                </button>
                <span className="text-slate-700">
                  {formatSupplierKes(row.balance_due)} due
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
