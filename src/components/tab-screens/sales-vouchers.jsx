"use client";

import Link from "next/link";
import { OrgSettingsPlatformHint } from "@/components/admin/org-settings-platform-hint";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { mergeSalesSettings } from "@/lib/sales-settings";
import { formatSaleKes } from "@/lib/sales";
import { formatShortDate } from "@/components/catalog/catalog-shared";
import {
  CatalogPageShell,
  Field,
  FormDrawer,
  IconButton,
  inputClassName,
  PencilIcon,
  PrimaryButton,
  SearchInput,
  SECONDARY_BTN_CLASS,
  TrashIcon,
} from "@/components/catalog/catalog-shared";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { VOUCHER_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";

const EMPTY_FORM = {
  voucher_code: "",
  voucher_kind: "payment",
  name: "",
  description: "",
  discount_type: "fixed",
  discount_value: "",
  initial_balance: "",
  min_order_amount: "0",
  max_redemptions: "",
  valid_from: "",
  valid_until: "",
  is_active: true,
};

function discountLabel(voucher) {
  if (voucher.voucher_kind === "payment") {
    return `${formatSaleKes(voucher.balance ?? 0)} balance`;
  }
  const value = Number(voucher.discount_value ?? 0);
  if (voucher.discount_type === "percentage") {
    return `${value}% off`;
  }
  return formatSaleKes(value);
}

function redemptionLabel(voucher) {
  const used = Number(voucher.redemption_count ?? 0);
  const max = voucher.max_redemptions;
  if (max == null || max === "") {
    return `${used} used · unlimited`;
  }
  return `${used} / ${max}`;
}

function validityLabel(voucher) {
  const from = voucher.valid_from ? formatShortDate(voucher.valid_from) : null;
  const until = voucher.valid_until ? formatShortDate(voucher.valid_until) : null;
  if (from && until) return `${from} – ${until}`;
  if (from) return `From ${from}`;
  if (until) return `Until ${until}`;
  return "No expiry";
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

export function SalesVouchersScreen() {
  const confirm = useConfirm();
  const { capabilities } = useAuth();
  const vouchersEnabled = Boolean(
    mergeSalesSettings(capabilities?.module_settings).enable_vouchers,
  );

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState("create");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const loadData = useCallback(async () => {
    try {
      const res = await apiRequest("/vouchers", {
        searchParams: { per_page: 200, ...(search.trim() ? { q: search.trim() } : {}) },
      });
      setRows(res.data ?? []);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load vouchers");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      loadData();
    }, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [loadData, search]);

  const drawerTitle = drawerMode === "create" ? "Add voucher" : "Edit voucher";

  const canManage = vouchersEnabled;

  function openCreateDrawer() {
    if (!canManage) return;
    setDrawerMode("create");
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setFormError(null);
    setDrawerOpen(true);
  }

  function openEditDrawer(voucher) {
    if (!canManage) return;
    setDrawerMode("edit");
    setEditingId(voucher.id);
    setForm({
      voucher_code: voucher.voucher_code ?? "",
      voucher_kind: voucher.voucher_kind ?? "discount",
      name: voucher.name ?? "",
      description: voucher.description ?? "",
      discount_type: voucher.discount_type ?? "fixed",
      discount_value: String(voucher.discount_value ?? ""),
      initial_balance: String(voucher.initial_balance ?? voucher.balance ?? ""),
      min_order_amount: String(voucher.min_order_amount ?? 0),
      max_redemptions:
        voucher.max_redemptions == null ? "" : String(voucher.max_redemptions),
      valid_from: voucher.valid_from ? String(voucher.valid_from).slice(0, 10) : "",
      valid_until: voucher.valid_until ? String(voucher.valid_until).slice(0, 10) : "",
      is_active: voucher.is_active !== false,
    });
    setFormError(null);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setFormError(null);
  }

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function buildBody() {
    const body = {
      voucher_code: form.voucher_code.trim(),
      voucher_kind: form.voucher_kind,
      name: form.name.trim() || null,
      description: form.description.trim() || null,
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value) || 0,
      initial_balance:
        form.voucher_kind === "payment"
          ? Number(form.initial_balance || form.discount_value) || 0
          : undefined,
      min_order_amount: Number(form.min_order_amount) || 0,
      max_redemptions: form.max_redemptions.trim()
        ? Number(form.max_redemptions)
        : null,
      valid_from: form.valid_from || null,
      valid_until: form.valid_until || null,
      is_active: form.is_active,
    };
    return body;
  }

  async function saveForm(e) {
    e.preventDefault();
    if (!canManage) return;
    setFormError(null);
    setSaving(true);
    const body = buildBody();
    try {
      if (drawerMode === "create") {
        await apiRequest("/vouchers", { method: "POST", body });
      } else {
        await apiRequest(`/vouchers/${editingId}`, { method: "PUT", body });
      }
      await loadData();
      closeDrawer();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteVoucher(voucher) {
    if (!canManage) return;
    const label = voucher.voucher_code ?? voucher.name ?? "this voucher";
    const ok = await confirm({
      title: "Delete voucher",
      message: `Delete voucher ${label}?`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/vouchers/${voucher.id}`, { method: "DELETE" });
      if (editingId === voucher.id) closeDrawer();
      await loadData();
      notifySuccess(`Voucher ${label} deleted`);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  const activeCount = useMemo(
    () => rows.filter((row) => row.is_active !== false).length,
    [rows],
  );

  return (
    <CatalogPageShell
      title="Vouchers"
      subtitle="Create promotional codes for fixed or percentage discounts at checkout"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className={SECONDARY_BTN_CLASS}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <CatalogListExport
            title="Vouchers"
            apiPath="/vouchers"
            columns={VOUCHER_EXPORT_COLUMNS}
            totalCount={rows.length}
            getSearchParams={() => ({
              per_page: 200,
              ...(search.trim() ? { q: search.trim() } : {}),
            })}
            disabled={loading}
          />
          {canManage ? (
            <PrimaryButton onClick={openCreateDrawer}>Add voucher</PrimaryButton>
          ) : null}
        </div>
      }
    >
      {!vouchersEnabled ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Vouchers are disabled for this organization. Enable them under{" "}
          <OrgSettingsPlatformHint area="Organization settings → Sales" />.
          to create and redeem voucher codes.
        </div>
      ) : (
        <p className="mb-4 text-sm text-slate-600">
          {activeCount} active voucher{activeCount === 1 ? "" : "s"} · codes are case-insensitive
        </p>
      )}

      <div className="mb-4 max-w-md">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search code or name…"
        />
      </div>

      <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading vouchers…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-sm">
              <thead>
                <tr className="theme-table-head-row text-left text-xs font-medium">
                  <th className="px-4 py-2.5">Code</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Value</th>
                  <th className="px-4 py-2.5">Min order</th>
                  <th className="px-4 py-2.5">Redemptions</th>
                  <th className="px-4 py-2.5">Validity</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="w-[90px] px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                      {vouchersEnabled
                        ? "No vouchers yet. Add one to get started."
                        : "Enable vouchers in sales settings to create codes."}
                    </td>
                  </tr>
                ) : (
                  rows.map((voucher) => (
                    <tr
                      key={voucher.id}
                      className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                    >
                      <td className="px-4 py-3.5">
                        <span className="rounded bg-[#E6F1FB] px-2 py-0.5 font-mono text-sm font-semibold text-[#0C447C]">
                          {voucher.voucher_code}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-slate-600 capitalize">
                        {voucher.voucher_kind ?? "discount"}
                      </td>
                      <td className="px-4 py-3.5 font-medium text-slate-900">
                        {voucher.name || "—"}
                      </td>
                      <td className="px-4 py-3.5 text-slate-700">{discountLabel(voucher)}</td>
                      <td className="px-4 py-3.5 text-slate-700">
                        {Number(voucher.min_order_amount ?? 0) > 0
                          ? formatSaleKes(voucher.min_order_amount)
                          : "—"}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">{redemptionLabel(voucher)}</td>
                      <td className="px-4 py-3.5 text-slate-600">{validityLabel(voucher)}</td>
                      <td className="px-4 py-3.5">
                        <StatusBadge active={voucher.is_active !== false} />
                      </td>
                      <td className="px-4 py-3.5">
                        {canManage ? (
                          <div className="flex gap-1">
                            <IconButton label="Edit" onClick={() => openEditDrawer(voucher)}>
                              <PencilIcon />
                            </IconButton>
                            <IconButton label="Delete" danger onClick={() => deleteVoucher(voucher)}>
                              <TrashIcon />
                            </IconButton>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <FormDrawer
        title={drawerTitle}
        open={drawerOpen}
        onClose={closeDrawer}
        onSubmit={saveForm}
        saving={saving}
        error={formError}
        submitLabel={drawerMode === "create" ? "Add voucher" : "Save changes"}
      >
        <Field label="Voucher type">
          <select
            value={form.voucher_kind}
            onChange={(e) => updateField("voucher_kind", e.target.value)}
            className={inputClassName()}
            disabled={drawerMode === "edit"}
          >
            <option value="payment">Payment voucher (stored balance)</option>
            <option value="discount">Discount voucher (order discount)</option>
          </select>
        </Field>
        <Field label="Voucher code">
          <input
            type="text"
            value={form.voucher_code}
            onChange={(e) => updateField("voucher_code", e.target.value.toUpperCase())}
            className={inputClassName()}
            placeholder="SAVE10"
            required
            disabled={drawerMode === "edit"}
          />
          <p className="mt-1 text-xs text-slate-500">Shown at checkout. Stored uppercase.</p>
        </Field>
        <Field label="Display name">
          <input
            type="text"
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
            className={inputClassName()}
            placeholder="Ten percent off"
          />
        </Field>
        <Field label="Description">
          <textarea
            value={form.description}
            onChange={(e) => updateField("description", e.target.value)}
            className={`${inputClassName()} min-h-[4rem]`}
            placeholder="Optional internal notes"
          />
        </Field>
        {form.voucher_kind === "payment" ? (
          <Field label="Voucher balance (KES)">
            <input
              type="number"
              min="0"
              step="any"
              value={form.initial_balance}
              onChange={(e) => updateField("initial_balance", e.target.value)}
              className={inputClassName()}
              required
            />
          </Field>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Discount type">
              <select
                value={form.discount_type}
                onChange={(e) => updateField("discount_type", e.target.value)}
                className={inputClassName()}
              >
                <option value="fixed">Fixed amount (KES)</option>
                <option value="percentage">Percentage (%)</option>
              </select>
            </Field>
            <Field label={form.discount_type === "percentage" ? "Percentage" : "Amount (KES)"}>
              <input
                type="number"
                min="0"
                max={form.discount_type === "percentage" ? "100" : undefined}
                step="any"
                value={form.discount_value}
                onChange={(e) => updateField("discount_value", e.target.value)}
                className={inputClassName()}
                required
              />
            </Field>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Minimum order (KES)">
            <input
              type="number"
              min="0"
              step="any"
              value={form.min_order_amount}
              onChange={(e) => updateField("min_order_amount", e.target.value)}
              className={inputClassName()}
            />
          </Field>
          <Field label="Max redemptions">
            <input
              type="number"
              min="1"
              step="1"
              value={form.max_redemptions}
              onChange={(e) => updateField("max_redemptions", e.target.value)}
              className={inputClassName()}
              placeholder="Unlimited"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valid from">
            <input
              type="date"
              value={form.valid_from}
              onChange={(e) => updateField("valid_from", e.target.value)}
              className={inputClassName()}
            />
          </Field>
          <Field label="Valid until">
            <input
              type="date"
              value={form.valid_until}
              onChange={(e) => updateField("valid_until", e.target.value)}
              className={inputClassName()}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => updateField("is_active", e.target.checked)}
          />
          Active — can be redeemed when enabled in sales settings
        </label>
      </FormDrawer>
    </CatalogPageShell>
  );
}
