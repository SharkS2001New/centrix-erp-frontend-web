"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { useTabTitle } from "@/contexts/tab-workspace-context";
import { tabDetailTitle } from "@/hooks/use-tab-form-exit";
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";
import { notifyError, notifySuccess } from "@/lib/notify";
import { P } from "@/lib/permission-codes";
import { isPlatformInvestorsEnabled } from "@/lib/platform-org-features";
import {
  Field,
  FormDrawer,
  PrimaryButton,
  SECONDARY_BTN_CLASS,
  SearchableSelect,
  StatCard,
  formatKesCompact,
  formatShortDate,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { ProductSearchSelect } from "@/components/catalog/product-search-select";
import { lpoRowDisplayNumber } from "@/components/lpo/lpo-shared";
import { formatSupplierKes } from "@/components/suppliers/suppliers-shared";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "contributions", label: "Contributions" },
  { id: "batches", label: "Product batches" },
  { id: "spends", label: "Spends" },
];

const EMPTY_CONTRIBUTION = {
  contribution_type: "cash",
  contribution_date: new Date().toISOString().slice(0, 10),
  amount: "",
  payment_code: "",
  reference_number: "",
  supplier_id: "",
  lpo_no: "",
  notes: "",
};

const EMPTY_LINK = {
  payment_code: "",
  supplier_payment_id: "",
  lpo_no: "",
};

const EMPTY_ALLOCATE = {
  from_lpo: false,
  lpo_no: "",
  product_code: "",
  product_name: "",
  packaging: "",
  qty_purchased: "",
  unit_cost: "",
};

const EMPTY_SPEND = {
  spend_type: "expense",
  amount: "",
  spend_date: new Date().toISOString().slice(0, 10),
  reference_label: "",
  notes: "",
  /** @type {"lpo" | "supplier"} */
  supplier_link_mode: "lpo",
  supplier_id: "",
  lpo_no: "",
  reference_id: "",
};

function ContributionTypeBadge({ type }) {
  const t = String(type || "").toLowerCase();
  if (t === "stock") {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
        Stock
      </span>
    );
  }
  if (t === "cash") {
    return (
      <span className="inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-900">
        Cash
      </span>
    );
  }
  return <span className="capitalize text-slate-600">{type || "—"}</span>;
}

function StatusBadge({ active }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export function InvestorsIdScreen() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const investorId = params.id;
  const { capabilities, hasPermission } = useAuth();
  const enabled = isPlatformInvestorsEnabled(capabilities);
  const canEdit = enabled && hasPermission?.(P.investors.investors.edit);
  const canCreate = enabled && hasPermission?.(P.investors.investors.create);
  const canReport =
    enabled &&
    (hasPermission?.(P.investors.reports.view) || hasPermission?.(P.investors.investors.view));

  const [tab, setTab] = useState(() => {
    const fromUrl = searchParams.get("tab");
    if (fromUrl === "reports") return "overview";
    return TABS.some((t) => t.id === fromUrl) ? fromUrl : "overview";
  });
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);

  const [contribDrawer, setContribDrawer] = useState(false);
  const [contribForm, setContribForm] = useState(EMPTY_CONTRIBUTION);
  const [linkDrawer, setLinkDrawer] = useState(null);
  const [linkForm, setLinkForm] = useState(EMPTY_LINK);
  const [allocDrawer, setAllocDrawer] = useState(null);
  const [allocForm, setAllocForm] = useState(EMPTY_ALLOCATE);
  const [spendDrawer, setSpendDrawer] = useState(false);
  const [spendForm, setSpendForm] = useState(EMPTY_SPEND);
  const [spendSuppliers, setSpendSuppliers] = useState([]);
  const [spendLpos, setSpendLpos] = useState([]);
  const [spendPayments, setSpendPayments] = useState([]);
  const [spendMetaLoading, setSpendMetaLoading] = useState(false);
  const [spendPaymentsLoading, setSpendPaymentsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const loadData = useCallback(async () => {
    if (!enabled) {
      setPayload(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await apiRequest(`/investors/${investorId}`);
      setPayload(data);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load investor");
    } finally {
      setLoading(false);
    }
  }, [enabled, investorId]);

  useTabAwareDataLoad(loadData);

  useEffect(() => {
    const fromUrl = searchParams.get("tab");
    if (fromUrl === "reports" && investorId) {
      router.replace(`/investors/reports?investor=${investorId}`);
      return;
    }
    if (fromUrl && TABS.some((t) => t.id === fromUrl)) setTab(fromUrl);
  }, [searchParams, investorId, router]);

  const investor = payload?.data;
  const summary = payload?.summary ?? {};

  useTabTitle(
    investor
      ? tabDetailTitle("Investors", investor.investor_name || investor.investor_code || investorId)
      : null,
  );

  const contributions = investor?.contributions ?? [];
  const batches = investor?.batches ?? [];
  const spends = investor?.spend_links ?? investor?.spendLinks ?? [];

  async function saveContribution(e) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      await apiRequest(`/investors/${investorId}/contributions`, {
        method: "POST",
        body: {
          contribution_type: contribForm.contribution_type,
          contribution_date: contribForm.contribution_date,
          amount: Number(contribForm.amount) || 0,
          payment_code: contribForm.payment_code.trim() || null,
          reference_number: contribForm.reference_number.trim() || null,
          supplier_id: contribForm.supplier_id ? Number(contribForm.supplier_id) : null,
          lpo_no: contribForm.lpo_no ? Number(contribForm.lpo_no) : null,
          notes: contribForm.notes.trim() || null,
        },
      });
      setContribDrawer(false);
      notifySuccess("Contribution recorded");
      await loadData();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveLink(e) {
    e.preventDefault();
    if (!linkDrawer) return;
    setFormError(null);
    setSaving(true);
    try {
      await apiRequest(`/investors/${investorId}/contributions/${linkDrawer.id}/link`, {
        method: "POST",
        body: {
          payment_code: linkForm.payment_code.trim() || null,
          supplier_payment_id: linkForm.supplier_payment_id
            ? Number(linkForm.supplier_payment_id)
            : null,
          lpo_no: linkForm.lpo_no ? Number(linkForm.lpo_no) : null,
        },
      });
      setLinkDrawer(null);
      notifySuccess("Payment / LPO linked");
      await loadData();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Link failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveAllocate(e) {
    e.preventDefault();
    if (!allocDrawer) return;
    setFormError(null);
    setSaving(true);
    try {
      const body = allocForm.from_lpo
        ? {
            from_lpo: true,
            lpo_no: Number(allocForm.lpo_no || allocDrawer.lpo_no),
            lines: [
              {
                product_code: "_",
                qty_purchased: 1,
              },
            ],
          }
        : {
            lines: [
              {
                product_code: allocForm.product_code.trim(),
                product_name: allocForm.product_name.trim() || null,
                packaging: allocForm.packaging.trim() || null,
                qty_purchased: Number(allocForm.qty_purchased),
                unit_cost: Number(allocForm.unit_cost) || 0,
                lpo_no: allocForm.lpo_no ? Number(allocForm.lpo_no) : allocDrawer.lpo_no,
              },
            ],
          };
      await apiRequest(`/investors/${investorId}/contributions/${allocDrawer.id}/allocate`, {
        method: "POST",
        body,
      });
      setAllocDrawer(null);
      notifySuccess("Products allocated to investor batch");
      await loadData();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Allocate failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveSpend(e) {
    e.preventDefault();
    setFormError(null);

    if (spendForm.spend_type === "supplier_payment") {
      if (spendForm.supplier_link_mode === "lpo" && !spendForm.lpo_no && !spendForm.reference_id) {
        setFormError("Choose an LPO, or link an existing supplier payment.");
        return;
      }
      if (
        spendForm.supplier_link_mode === "supplier" &&
        !spendForm.supplier_id &&
        !spendForm.reference_id
      ) {
        setFormError("Choose a supplier, or link an existing supplier payment.");
        return;
      }
    }

    setSaving(true);
    try {
      const body = {
        spend_type: spendForm.spend_type,
        amount: Number(spendForm.amount) || null,
        spend_date: spendForm.spend_date,
        reference_label: spendForm.reference_label.trim() || null,
        notes: spendForm.notes.trim() || null,
      };
      if (spendForm.spend_type === "supplier_payment") {
        if (spendForm.reference_id) {
          body.reference_id = Number(spendForm.reference_id);
        }
        if (spendForm.supplier_link_mode === "lpo" && spendForm.lpo_no) {
          body.lpo_no = Number(spendForm.lpo_no);
        }
        if (spendForm.supplier_id) {
          body.supplier_id = Number(spendForm.supplier_id);
        }
      }
      await apiRequest(`/investors/${investorId}/spends`, {
        method: "POST",
        body,
      });
      setSpendDrawer(false);
      notifySuccess("Spend linked");
      await loadData();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!spendDrawer || spendForm.spend_type !== "supplier_payment") return undefined;
    let cancelled = false;
    setSpendMetaLoading(true);
    Promise.all([
      apiRequest("/suppliers", { searchParams: { per_page: 200 } }).catch(() => ({ data: [] })),
      apiRequest("/lpo-mst", { searchParams: { per_page: 100 } }).catch(() => ({ data: [] })),
    ])
      .then(([supRes, lpoRes]) => {
        if (cancelled) return;
        setSpendSuppliers(supRes?.data ?? []);
        setSpendLpos(lpoRes?.data ?? []);
      })
      .finally(() => {
        if (!cancelled) setSpendMetaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [spendDrawer, spendForm.spend_type]);

  useEffect(() => {
    if (!spendDrawer || spendForm.spend_type !== "supplier_payment") {
      setSpendPayments([]);
      return undefined;
    }
    const hasLpo = spendForm.supplier_link_mode === "lpo" && spendForm.lpo_no;
    const hasSupplier =
      spendForm.supplier_link_mode === "supplier" && spendForm.supplier_id;
    if (!hasLpo && !hasSupplier) {
      setSpendPayments([]);
      return undefined;
    }
    let cancelled = false;
    setSpendPaymentsLoading(true);
    const searchParams = { per_page: 50 };
    if (hasLpo) searchParams.lpo_no = spendForm.lpo_no;
    if (hasSupplier || spendForm.supplier_id) {
      searchParams.supplier_id = spendForm.supplier_id;
    }
    apiRequest("/supplier-payments", { searchParams })
      .then((res) => {
        if (cancelled) return;
        setSpendPayments(res?.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setSpendPayments([]);
      })
      .finally(() => {
        if (!cancelled) setSpendPaymentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    spendDrawer,
    spendForm.spend_type,
    spendForm.supplier_link_mode,
    spendForm.lpo_no,
    spendForm.supplier_id,
  ]);

  const spendSupplierOptions = useMemo(
    () =>
      spendSuppliers.map((s) => ({
        value: String(s.id),
        label: s.supplier_name || s.supplier_code || `Supplier #${s.id}`,
      })),
    [spendSuppliers],
  );

  const spendLpoOptions = useMemo(
    () =>
      spendLpos.map((lpo) => {
        const display = lpoRowDisplayNumber(lpo);
        const supplierName = lpo.supplier?.supplier_name || "";
        return {
          value: String(lpo.lpo_no),
          label: supplierName ? `${display} · ${supplierName}` : display,
          supplier_id: lpo.supplier_id != null ? String(lpo.supplier_id) : "",
        };
      }),
    [spendLpos],
  );

  const spendPaymentOptions = useMemo(
    () =>
      spendPayments.map((p) => {
        const amount = formatSupplierKes(p.amount_paid ?? 0);
        const date = p.date_paid || "";
        const lpoBit = p.lpo_no ? ` · LPO ${lpoRowDisplayNumber(p)}` : "";
        const ref = p.reference_number ? ` · ${p.reference_number}` : "";
        return {
          value: String(p.id),
          label: `#${p.id} · ${amount}${date ? ` · ${date}` : ""}${lpoBit}${ref}`,
          amount: p.amount_paid,
          reference_label: p.reference_number
            ? `Supplier payment #${p.id} · ${p.reference_number}`
            : `Supplier payment #${p.id}`,
        };
      }),
    [spendPayments],
  );

  const overviewStats = useMemo(() => {
    const cashCount = contributions.filter(
      (c) => String(c.contribution_type || "").toLowerCase() === "cash",
    ).length;
    const stockCount = contributions.filter(
      (c) => String(c.contribution_type || "").toLowerCase() === "stock",
    ).length;
    const activeBatches = batches.filter((b) => Number(b.qty_remaining ?? 0) > 0).length;
    return { cashCount, stockCount, activeBatches, spendCount: spends.length };
  }, [contributions, batches, spends]);

  if (!enabled) {
    return (
      <div className="theme-workspace p-6">
        <p className="text-sm text-slate-600">Investors module is disabled for this organization.</p>
      </div>
    );
  }

  if (loading && !investor) {
    return (
      <div className="theme-workspace p-6">
        <p className="text-sm text-slate-500">Loading investor…</p>
      </div>
    );
  }

  if (!investor) {
    return (
      <div className="theme-workspace p-6">
        <p className="text-sm text-slate-600">Investor not found.</p>
        <Link href="/investors" className="mt-2 inline-block text-sm text-[var(--brand-primary)]">
          Back to investors
        </Link>
      </div>
    );
  }

  return (
    <div className="theme-workspace min-h-full">
      <AppBreadcrumb
        items={[
          { label: "Investors", href: "/investors" },
          { label: investor.investor_name || investor.investor_code || "Investor" },
        ]}
      />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-medium text-slate-900">{investor.investor_name}</h1>
            <StatusBadge active={investor.is_active !== false} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {investor.investor_code}
            {investor.contact_person ? ` · ${investor.contact_person}` : ""}
            {investor.phone ? ` · ${investor.phone}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canReport ? (
            <Link
              href={`/investors/reports?investor=${investorId}`}
              className={SECONDARY_BTN_CLASS}
            >
              Reports
            </Link>
          ) : null}
          {(canCreate || canEdit) && (
            <PrimaryButton
              onClick={() => {
                setContribForm({ ...EMPTY_CONTRIBUTION });
                setFormError(null);
                setContribDrawer(true);
              }}
            >
              Add contribution
            </PrimaryButton>
          )}
          {canEdit && (
            <button
              type="button"
              className={SECONDARY_BTN_CLASS}
              onClick={() => {
                setSpendForm({ ...EMPTY_SPEND });
                setFormError(null);
                setSpendDrawer(true);
              }}
            >
              Link spend
            </button>
          )}
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Cash contributed" value={formatKesCompact(summary.cash_contributed ?? 0)} />
        <StatCard label="Stock contributed" value={formatKesCompact(summary.stock_contributed ?? 0)} />
        <StatCard label="Stock value (available)" value={formatKesCompact(summary.stock_value ?? 0)} />
        <StatCard label="Cash pool" value={formatKesCompact(summary.cash_pool_balance ?? 0)} />
      </div>

      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium ${
              tab === t.id
                ? "border-b-2 border-[var(--brand-primary)] text-slate-900"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="theme-panel rounded-xl p-5 shadow-sm lg:col-span-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Investor profile
              </p>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-slate-500">Status</dt>
                  <dd className="mt-1">
                    <StatusBadge active={investor.is_active !== false} />
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Code</dt>
                  <dd className="mt-0.5 font-mono text-slate-900">{investor.investor_code || "—"}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Contact</dt>
                  <dd className="mt-0.5 text-slate-900">{investor.contact_person || "—"}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Phone</dt>
                  <dd className="mt-0.5 text-slate-900">{investor.phone || "—"}</dd>
                </div>
                {investor.email ? (
                  <div>
                    <dt className="text-slate-500">Email</dt>
                    <dd className="mt-0.5 break-all text-slate-900">{investor.email}</dd>
                  </div>
                ) : null}
              </dl>
              {investor.notes ? (
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{investor.notes}</p>
                </div>
              ) : null}
            </div>

            <div className="theme-panel rounded-xl p-5 shadow-sm lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Capital summary
                </p>
                <div className="flex flex-wrap gap-2">
                  {Number(summary.cash_contributed ?? 0) > 0 ? (
                    <ContributionTypeBadge type="cash" />
                  ) : null}
                  {Number(summary.stock_contributed ?? 0) > 0 ? (
                    <ContributionTypeBadge type="stock" />
                  ) : null}
                  {Number(summary.cash_contributed ?? 0) <= 0 &&
                  Number(summary.stock_contributed ?? 0) <= 0 ? (
                    <span className="text-xs text-slate-500">No contributions yet</span>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3">
                  <p className="text-xs text-slate-500">Cash deposited</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                    {formatKesCompact(summary.cash_contributed ?? 0)}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {overviewStats.cashCount} cash contribution
                    {overviewStats.cashCount === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3">
                  <p className="text-xs text-slate-500">Stock contributed</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                    {formatKesCompact(summary.stock_contributed ?? 0)}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {overviewStats.stockCount} stock contribution
                    {overviewStats.stockCount === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3">
                  <p className="text-xs text-slate-500">Cash spent</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                    {formatKesCompact(summary.cash_spent ?? 0)}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {overviewStats.spendCount} linked spend
                    {overviewStats.spendCount === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3">
                  <p className="text-xs text-slate-500">Total contributed</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                    {formatKesCompact(summary.total_contributed ?? 0)}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {overviewStats.activeBatches} active batch
                    {overviewStats.activeBatches === 1 ? "" : "es"} on hand
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="theme-panel rounded-xl p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Recent contributions
                </p>
                <button
                  type="button"
                  className="text-xs font-medium text-[var(--brand-primary)] hover:underline"
                  onClick={() => setTab("contributions")}
                >
                  View all
                </button>
              </div>
              {contributions.length === 0 ? (
                <p className="text-sm text-slate-500">No contributions yet — use Add contribution.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {contributions.slice(0, 5).map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <ContributionTypeBadge type={c.contribution_type} />
                          <span className="text-slate-500">{formatShortDate(c.contribution_date)}</span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-400">
                          {c.payment_code || c.supplier?.supplier_name || c.lpo_no
                            ? [c.payment_code, c.supplier?.supplier_name, c.lpo_no ? `LPO ${c.lpo_no}` : null]
                                .filter(Boolean)
                                .join(" · ")
                            : "—"}
                        </p>
                      </div>
                      <span className="shrink-0 font-medium tabular-nums text-slate-900">
                        {formatKesCompact(c.amount ?? 0)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="theme-panel rounded-xl p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Product batches
                </p>
                <button
                  type="button"
                  className="text-xs font-medium text-[var(--brand-primary)] hover:underline"
                  onClick={() => setTab("batches")}
                >
                  View all
                </button>
              </div>
              {batches.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No product batches yet — allocate products from a stock contribution.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {batches.slice(0, 5).map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">
                          {b.product_name || b.product_code || "Product"}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-slate-400">{b.product_code}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tabular-nums text-slate-900">
                          {Number(b.qty_remaining ?? 0)} left
                        </p>
                        <p className="text-xs tabular-nums text-slate-400">
                          of {Number(b.qty_purchased ?? 0)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "contributions" && (
        <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-sm">
              <thead>
                <tr className="theme-table-head-row text-left text-xs font-medium">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5">Payment code</th>
                  <th className="px-4 py-2.5">LPO</th>
                  <th className="px-4 py-2.5">Supplier</th>
                  <th className="px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {contributions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                      No contributions yet.
                    </td>
                  </tr>
                ) : (
                  contributions.map((c) => (
                    <tr key={c.id} className="theme-table-row border-t border-slate-100">
                      <td className="px-4 py-2.5">{formatShortDate(c.contribution_date)}</td>
                      <td className="px-4 py-2.5">
                        <ContributionTypeBadge type={c.contribution_type} />
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {formatKesCompact(c.amount ?? 0)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">{c.payment_code || "—"}</td>
                      <td className="px-4 py-2.5">{c.lpo_no || "—"}</td>
                      <td className="px-4 py-2.5">
                        {c.supplier?.supplier_name || c.supplier_id || "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        {canEdit && c.contribution_type === "stock" ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="text-xs font-medium text-[var(--brand-primary)] hover:underline"
                              onClick={() => {
                                setLinkForm({
                                  payment_code: c.payment_code || "",
                                  supplier_payment_id: c.supplier_payment_id
                                    ? String(c.supplier_payment_id)
                                    : "",
                                  lpo_no: c.lpo_no ? String(c.lpo_no) : "",
                                });
                                setFormError(null);
                                setLinkDrawer(c);
                              }}
                            >
                              Link payment/LPO
                            </button>
                            <button
                              type="button"
                              className="text-xs font-medium text-[var(--brand-primary)] hover:underline"
                              onClick={() => {
                                setAllocForm({
                                  ...EMPTY_ALLOCATE,
                                  lpo_no: c.lpo_no ? String(c.lpo_no) : "",
                                  from_lpo: false,
                                });
                                setFormError(null);
                                setAllocDrawer(c);
                              }}
                            >
                              Allocate products
                            </button>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "batches" && (
        <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="theme-table-head-row text-left text-xs font-medium">
                  <th className="px-4 py-2.5">Product</th>
                  <th className="px-4 py-2.5 text-right">Purchased</th>
                  <th className="px-4 py-2.5 text-right">Remaining</th>
                  <th className="px-4 py-2.5 text-right">Unit cost</th>
                  <th className="px-4 py-2.5 text-right">Stock value</th>
                  <th className="px-4 py-2.5">Received</th>
                  <th className="px-4 py-2.5">LPO</th>
                </tr>
              </thead>
              <tbody>
                {batches.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                      No funded product batches. Allocate from a stock contribution.
                    </td>
                  </tr>
                ) : (
                  batches.map((b) => (
                    <tr key={b.id} className="theme-table-row border-t border-slate-100">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-900">
                          {b.product_name || b.product_code}
                        </div>
                        <div className="font-mono text-xs text-slate-500">{b.product_code}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{b.qty_purchased}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{b.qty_remaining}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {formatKesCompact(b.unit_cost ?? 0)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {formatKesCompact(
                          Number(b.qty_remaining ?? 0) * Number(b.unit_cost ?? 0),
                        )}
                      </td>
                      <td className="px-4 py-2.5">{formatShortDate(b.received_at) || "—"}</td>
                      <td className="px-4 py-2.5">{b.lpo_no || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "spends" && (
        <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-sm">
              <thead>
                <tr className="theme-table-head-row text-left text-xs font-medium">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Supplier / LPO</th>
                  <th className="px-4 py-2.5">Label</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5">Notes</th>
                </tr>
              </thead>
              <tbody>
                {spends.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                      No spends linked to this investor&apos;s cash pool.
                    </td>
                  </tr>
                ) : (
                  spends.map((s) => (
                    <tr key={s.id} className="theme-table-row border-t border-slate-100">
                      <td className="px-4 py-2.5">{formatShortDate(s.spend_date)}</td>
                      <td className="px-4 py-2.5 capitalize">
                        {String(s.spend_type || "").replaceAll("_", " ")}
                      </td>
                      <td className="px-4 py-2.5">
                        {s.supplier?.supplier_name || s.lpo_no || s.reference_id ? (
                          <div>
                            <div className="text-slate-900">
                              {s.supplier?.supplier_name || "—"}
                            </div>
                            <div className="text-xs text-slate-500">
                              {[
                                s.lpo_no ? `LPO ${lpoRowDisplayNumber(s)}` : null,
                                s.reference_id ? `Payment #${s.reference_id}` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ") || "—"}
                            </div>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-2.5">{s.reference_label || "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {formatKesCompact(s.amount ?? 0)}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{s.notes || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <FormDrawer
        open={contribDrawer}
        onClose={() => setContribDrawer(false)}
        title="Add contribution"
        onSubmit={(e) => void saveContribution(e)}
        saving={saving}
        error={formError}
        submitLabel="Save contribution"
      >
          <Field label="Type" required>
            <select
              className={inputClassName()}
              value={contribForm.contribution_type}
              onChange={(e) =>
                setContribForm((p) => ({ ...p, contribution_type: e.target.value }))
              }
            >
              <option value="cash">Cash (deposit to org)</option>
              <option value="stock">Stock (paid supplier for goods)</option>
            </select>
          </Field>
          <Field label="Date" required>
            <input
              type="date"
              className={inputClassName()}
              value={contribForm.contribution_date}
              onChange={(e) =>
                setContribForm((p) => ({ ...p, contribution_date: e.target.value }))
              }
              required
            />
          </Field>
          <Field label="Amount" required>
            <input
              type="number"
              step="0.01"
              min="0"
              className={inputClassName()}
              value={contribForm.amount}
              onChange={(e) => setContribForm((p) => ({ ...p, amount: e.target.value }))}
              required
            />
          </Field>
          <Field label="Payment code">
            <input
              className={inputClassName()}
              value={contribForm.payment_code}
              onChange={(e) => setContribForm((p) => ({ ...p, payment_code: e.target.value }))}
              placeholder="Supplier payment / bank ref"
            />
          </Field>
          {contribForm.contribution_type === "stock" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="LPO no">
                <input
                  className={inputClassName()}
                  value={contribForm.lpo_no}
                  onChange={(e) => setContribForm((p) => ({ ...p, lpo_no: e.target.value }))}
                />
              </Field>
              <Field label="Supplier ID">
                <input
                  className={inputClassName()}
                  value={contribForm.supplier_id}
                  onChange={(e) =>
                    setContribForm((p) => ({ ...p, supplier_id: e.target.value }))
                  }
                />
              </Field>
            </div>
          ) : null}
          <Field label="Notes">
            <textarea
              className={inputClassName()}
              rows={2}
              value={contribForm.notes}
              onChange={(e) => setContribForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </Field>
      </FormDrawer>

      <FormDrawer
        open={Boolean(linkDrawer)}
        onClose={() => setLinkDrawer(null)}
        title="Link payment / LPO"
        onSubmit={(e) => void saveLink(e)}
        saving={saving}
        error={formError}
        submitLabel="Link"
      >
          <Field label="Payment code">
            <input
              className={inputClassName()}
              value={linkForm.payment_code}
              onChange={(e) => setLinkForm((p) => ({ ...p, payment_code: e.target.value }))}
            />
          </Field>
          <Field label="Supplier payment ID">
            <input
              className={inputClassName()}
              value={linkForm.supplier_payment_id}
              onChange={(e) =>
                setLinkForm((p) => ({ ...p, supplier_payment_id: e.target.value }))
              }
            />
          </Field>
          <Field label="LPO no">
            <input
              className={inputClassName()}
              value={linkForm.lpo_no}
              onChange={(e) => setLinkForm((p) => ({ ...p, lpo_no: e.target.value }))}
            />
          </Field>
      </FormDrawer>

      <FormDrawer
        open={Boolean(allocDrawer)}
        onClose={() => setAllocDrawer(null)}
        title="Allocate products"
        onSubmit={(e) => void saveAllocate(e)}
        saving={saving}
        error={formError}
        submitLabel="Allocate"
      >
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={allocForm.from_lpo}
              onChange={(e) => setAllocForm((p) => ({ ...p, from_lpo: e.target.checked }))}
            />
            Allocate all lines from LPO
          </label>
          {allocForm.from_lpo ? (
            <Field label="LPO no" required>
              <input
                className={inputClassName()}
                value={allocForm.lpo_no}
                onChange={(e) => setAllocForm((p) => ({ ...p, lpo_no: e.target.value }))}
                required
              />
            </Field>
          ) : (
            <>
              <Field label="Product" required>
                <ProductSearchSelect
                  value={allocForm.product_code}
                  onChange={(code) => {
                    setAllocForm((p) => ({
                      ...p,
                      product_code: code,
                      ...(code ? {} : { product_name: "", packaging: "" }),
                    }));
                  }}
                  onProductSelect={(product) => {
                    setAllocForm((p) => ({
                      ...p,
                      product_code: product?.product_code ?? "",
                      product_name: product?.product_name ?? "",
                      packaging: product?.uom?.uom_type || product?.packaging || p.packaging,
                      unit_cost:
                        product?.last_cost_price != null && product.last_cost_price !== ""
                          ? String(product.last_cost_price)
                          : p.unit_cost,
                    }));
                  }}
                  required
                  placeholder="Search by product name…"
                />
              </Field>
              {allocForm.product_code ? (
                <p className="text-xs text-slate-500">
                  Code: <span className="font-mono">{allocForm.product_code}</span>
                  {allocForm.product_name ? (
                    <>
                      {" "}
                      · {allocForm.product_name}
                    </>
                  ) : null}
                </p>
              ) : null}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Qty purchased" required>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    className={inputClassName()}
                    value={allocForm.qty_purchased}
                    onChange={(e) =>
                      setAllocForm((p) => ({ ...p, qty_purchased: e.target.value }))
                    }
                    required
                  />
                </Field>
                <Field label="Unit cost">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={inputClassName()}
                    value={allocForm.unit_cost}
                    onChange={(e) =>
                      setAllocForm((p) => ({ ...p, unit_cost: e.target.value }))
                    }
                  />
                </Field>
              </div>
            </>
          )}
      </FormDrawer>

      <FormDrawer
        open={spendDrawer}
        onClose={() => setSpendDrawer(false)}
        title="Link spend"
        onSubmit={(e) => void saveSpend(e)}
        saving={saving}
        error={formError}
        submitLabel="Save"
      >
          <Field label="Spend type" required>
            <select
              className={inputClassName()}
              value={spendForm.spend_type}
              onChange={(e) => {
                const spend_type = e.target.value;
                setSpendForm((p) => ({
                  ...EMPTY_SPEND,
                  spend_type,
                  spend_date: p.spend_date,
                  amount: spend_type === "supplier_payment" ? p.amount : p.amount,
                }));
              }}
            >
              <option value="expense">Expense</option>
              <option value="supplier_payment">Supplier payment</option>
              <option value="other">Other</option>
            </select>
          </Field>

          {spendForm.spend_type === "supplier_payment" ? (
            <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              <p className="text-xs text-slate-600">
                Trace this cash-pool spend to an LPO or supplier so it connects with supplier
                payments across the ERP.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    spendForm.supplier_link_mode === "lpo"
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-700 ring-1 ring-slate-200"
                  }`}
                  onClick={() =>
                    setSpendForm((p) => ({
                      ...p,
                      supplier_link_mode: "lpo",
                      supplier_id: "",
                      reference_id: "",
                    }))
                  }
                >
                  Against LPO
                </button>
                <button
                  type="button"
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    spendForm.supplier_link_mode === "supplier"
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-700 ring-1 ring-slate-200"
                  }`}
                  onClick={() =>
                    setSpendForm((p) => ({
                      ...p,
                      supplier_link_mode: "supplier",
                      lpo_no: "",
                      reference_id: "",
                    }))
                  }
                >
                  Supplier only (no LPO)
                </button>
              </div>

              {spendForm.supplier_link_mode === "lpo" ? (
                <Field label="LPO" required>
                  <SearchableSelect
                    value={spendForm.lpo_no}
                    loading={spendMetaLoading}
                    options={spendLpoOptions}
                    placeholder="Search LPO…"
                    searchPlaceholder="LPO number or supplier…"
                    required={!spendForm.reference_id}
                    onChange={(value) => {
                      const opt = spendLpoOptions.find((o) => o.value === String(value));
                      setSpendForm((p) => ({
                        ...p,
                        lpo_no: value ? String(value) : "",
                        supplier_id: opt?.supplier_id || "",
                        reference_id: "",
                        reference_label: value
                          ? `LPO ${lpoRowDisplayNumber({ lpo_no: value })}${
                              opt?.label?.includes("·")
                                ? ` · ${opt.label.split("·").slice(1).join("·").trim()}`
                                : ""
                            }`
                          : p.reference_label,
                      }));
                    }}
                  />
                </Field>
              ) : (
                <Field label="Supplier" required>
                  <SearchableSelect
                    value={spendForm.supplier_id}
                    loading={spendMetaLoading}
                    options={spendSupplierOptions}
                    placeholder="Search supplier…"
                    searchPlaceholder="Supplier name…"
                    required={!spendForm.reference_id}
                    onChange={(value) => {
                      const opt = spendSupplierOptions.find((o) => o.value === String(value));
                      setSpendForm((p) => ({
                        ...p,
                        supplier_id: value ? String(value) : "",
                        lpo_no: "",
                        reference_id: "",
                        reference_label: opt?.label
                          ? `Supplier payment · ${opt.label}`
                          : p.reference_label,
                      }));
                    }}
                  />
                </Field>
              )}

              {(spendForm.lpo_no || spendForm.supplier_id) && (
                <Field label="Existing supplier payment (optional)">
                  <SearchableSelect
                    value={spendForm.reference_id}
                    loading={spendPaymentsLoading}
                    options={spendPaymentOptions}
                    placeholder="Link a recorded payment…"
                    searchPlaceholder="Payment #, ref, amount…"
                    emptyLabel={
                      spendPaymentsLoading ? "Loading…" : "No matching supplier payments"
                    }
                    onChange={(value) => {
                      const opt = spendPaymentOptions.find((o) => o.value === String(value));
                      setSpendForm((p) => ({
                        ...p,
                        reference_id: value ? String(value) : "",
                        amount:
                          value && opt?.amount != null ? String(opt.amount) : p.amount,
                        reference_label: value
                          ? opt?.reference_label || p.reference_label
                          : p.reference_label,
                      }));
                    }}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Linking a payment ties this investor spend to Purchasing → Supplier payments.
                  </p>
                </Field>
              )}
            </div>
          ) : null}

          <Field label="Date" required>
            <input
              type="date"
              className={inputClassName()}
              value={spendForm.spend_date}
              onChange={(e) => setSpendForm((p) => ({ ...p, spend_date: e.target.value }))}
              required
            />
          </Field>
          <Field label="Amount" required={spendForm.spend_type !== "supplier_payment" || !spendForm.reference_id}>
            <input
              type="number"
              step="0.01"
              min="0"
              className={inputClassName()}
              value={spendForm.amount}
              onChange={(e) => setSpendForm((p) => ({ ...p, amount: e.target.value }))}
              required={spendForm.spend_type !== "supplier_payment" || !spendForm.reference_id}
            />
          </Field>
          <Field label="Label">
            <input
              className={inputClassName()}
              value={spendForm.reference_label}
              onChange={(e) =>
                setSpendForm((p) => ({ ...p, reference_label: e.target.value }))
              }
            />
          </Field>
          <Field label="Notes">
            <textarea
              className={inputClassName()}
              rows={2}
              value={spendForm.notes}
              onChange={(e) => setSpendForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </Field>
      </FormDrawer>
    </div>
  );
}
