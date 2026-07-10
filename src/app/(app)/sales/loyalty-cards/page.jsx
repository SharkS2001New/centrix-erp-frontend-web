"use client";

import Link from "next/link";
import { OrgSettingsPlatformHint } from "@/components/admin/org-settings-platform-hint";
import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { mergeSalesSettings } from "@/lib/sales-settings";
import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import { printLoyaltyCard } from "@/components/sales/loyalty-card-print";
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
import { LOYALTY_CARD_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";

const EMPTY_FORM = {
  customer_num: "",
  card_number: "",
  phone_number: "",
  points_balance: "0",
  issued_at: new Date().toISOString().slice(0, 10),
  is_active: true,
};

export default function LoyaltyCardsPage() {
  const confirm = useConfirm();
  const { capabilities } = useAuth();
  const pointsEnabled = Boolean(
    mergeSalesSettings(capabilities?.module_settings).enable_redeemable_points,
  );

  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
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
      const [cardRes, custRes] = await Promise.all([
        apiRequest("/loyalty-cards", {
          searchParams: { per_page: 200, ...(search.trim() ? { q: search.trim() } : {}) },
        }),
        apiRequest("/customers", { searchParams: { per_page: 300 } }),
      ]);
      setRows(cardRes.data ?? []);
      setCustomers(custRes.data ?? []);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load loyalty cards");
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

  const canManage = pointsEnabled;

  function openCreateDrawer() {
    if (!canManage) return;
    setDrawerMode("create");
    setEditingId(null);
    setForm({ ...EMPTY_FORM, issued_at: new Date().toISOString().slice(0, 10) });
    setFormError(null);
    setDrawerOpen(true);
  }

  function openEditDrawer(card) {
    if (!canManage) return;
    setDrawerMode("edit");
    setEditingId(card.id);
    setForm({
      customer_num: String(card.customer_num ?? ""),
      card_number: card.card_number ?? "",
      phone_number: card.phone_number ?? "",
      points_balance: String(card.points_balance ?? 0),
      issued_at: card.issued_at ? String(card.issued_at).slice(0, 10) : "",
      is_active: card.is_active !== false,
    });
    setFormError(null);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setFormError(null);
  }

  function updateField(key, value) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "customer_num" && value) {
        const customer = customers.find((c) => String(c.customer_num) === String(value));
        if (customer?.phone_number && !prev.phone_number) {
          next.phone_number = customer.phone_number;
        }
      }
      return next;
    });
  }

  async function saveForm(e) {
    e.preventDefault();
    if (!canManage) return;
    setFormError(null);
    setSaving(true);
    const body = {
      customer_num: Number(form.customer_num),
      card_number: form.card_number.trim() || null,
      phone_number: form.phone_number.trim() || null,
      points_balance: Number(form.points_balance) || 0,
      issued_at: form.issued_at || null,
      is_active: form.is_active,
    };
    try {
      if (drawerMode === "create") {
        await apiRequest("/loyalty-cards", { method: "POST", body });
      } else {
        await apiRequest(`/loyalty-cards/${editingId}`, { method: "PUT", body });
      }
      await loadData();
      closeDrawer();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCard(card) {
    if (!canManage) return;
    const ok = await confirm({
      title: "Delete loyalty card",
      message: `Delete loyalty card ${card.card_number}?`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/loyalty-cards/${card.id}`, { method: "DELETE" });
      if (editingId === card.id) closeDrawer();
      await loadData();
      notifySuccess(`Card ${card.card_number} deleted`);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  function handlePrint(card) {
    printLoyaltyCard(card, capabilities?.profile_label ?? DEFAULT_PRINT_ORG_NAME);
  }

  return (
    <CatalogPageShell
      title="Loyalty cards"
      subtitle="Issue cards for registered customers — points are earned automatically on completed orders"
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
            title="Loyalty cards"
            filename="loyalty-cards"
            apiPath="/loyalty-cards"
            columns={LOYALTY_CARD_EXPORT_COLUMNS}
            totalCount={rows.length}
            getSearchParams={() => ({
              per_page: 200,
              ...(search.trim() ? { q: search.trim() } : {}),
            })}
            disabled={loading}
          />
          {canManage ? (
            <PrimaryButton onClick={openCreateDrawer}>Add loyalty card</PrimaryButton>
          ) : null}
        </div>
      }
    >
      {!pointsEnabled ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Redeemable points are disabled. Enable them under{" "}
          <OrgSettingsPlatformHint area="Organization settings → Sales" />.
          .
        </div>
      ) : null}

      <div className="mb-4 max-w-md">
        <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search card, phone, customer…" />
      </div>

      <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading loyalty cards…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="theme-table-head-row text-left text-xs font-medium">
                  <th className="px-4 py-2.5">Card #</th>
                  <th className="px-4 py-2.5">Customer</th>
                  <th className="px-4 py-2.5">Phone</th>
                  <th className="px-4 py-2.5 text-right">Points</th>
                  <th className="px-4 py-2.5">Issued</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="w-[120px] px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                      No loyalty cards yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((card) => (
                    <tr key={card.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                      <td className="px-4 py-3.5 font-mono font-semibold text-[#0C447C]">
                        {card.card_number}
                      </td>
                      <td className="px-4 py-3.5 font-medium text-slate-900">
                        {card.customer_name ?? card.customer_num}
                      </td>
                      <td className="px-4 py-3.5 text-slate-700">{card.phone_number}</td>
                      <td className="px-4 py-3.5 text-right font-medium text-slate-900">
                        {Number(card.points_balance ?? 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">
                        {card.issued_at ? String(card.issued_at).slice(0, 10) : "—"}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            card.is_active !== false
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {card.is_active !== false ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => handlePrint(card)}
                            className="rounded border border-slate-200 px-2 py-1 text-[10px] font-semibold uppercase text-[#185FA5] hover:bg-[#E6F1FB]"
                          >
                            Print
                          </button>
                          {canManage ? (
                            <>
                              <IconButton label="Edit" onClick={() => openEditDrawer(card)}>
                                <PencilIcon />
                              </IconButton>
                              <IconButton label="Delete" danger onClick={() => deleteCard(card)}>
                                <TrashIcon />
                              </IconButton>
                            </>
                          ) : null}
                        </div>
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
        title={drawerMode === "create" ? "Add loyalty card" : "Edit loyalty card"}
        open={drawerOpen}
        onClose={closeDrawer}
        onSubmit={saveForm}
        saving={saving}
        error={formError}
        submitLabel={drawerMode === "create" ? "Create card" : "Save changes"}
      >
        <Field label="Customer">
          <select
            className={inputClassName()}
            value={form.customer_num}
            required
            disabled={drawerMode === "edit"}
            onChange={(e) => updateField("customer_num", e.target.value)}
          >
            <option value="">Select customer…</option>
            {customers.map((c) => (
              <option key={c.customer_num} value={c.customer_num}>
                {c.customer_name} ({c.customer_num})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Card number">
          <input
            className={inputClassName()}
            value={form.card_number}
            onChange={(e) => updateField("card_number", e.target.value.toUpperCase())}
            placeholder="Auto-generated if blank"
            disabled={drawerMode === "edit"}
          />
        </Field>
        <Field label="Mobile phone">
          <input
            type="tel"
            className={inputClassName()}
            value={form.phone_number}
            onChange={(e) => updateField("phone_number", e.target.value)}
            placeholder="Used at POS to redeem points"
            required
          />
        </Field>
        <Field label="Points balance">
          <input
            type="number"
            min="0"
            step="any"
            className={inputClassName()}
            value={form.points_balance}
            onChange={(e) => updateField("points_balance", e.target.value)}
            required
          />
        </Field>
        <Field label="Issued date">
          <input
            type="date"
            className={inputClassName()}
            value={form.issued_at}
            onChange={(e) => updateField("issued_at", e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => updateField("is_active", e.target.checked)}
          />
          Active
        </label>
      </FormDrawer>
    </CatalogPageShell>
  );
}
