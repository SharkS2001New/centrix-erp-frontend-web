"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { Field, PrimaryButton, inputClassName, SearchableSelect } from "@/components/catalog/catalog-shared";
import { notifySuccess } from "@/lib/notify";

const EMPTY = {
  name: "",
  primary_short_code: "",
  shortcode: "",
  till_number: "",
  child_storecode: "",
  branch_id: "",
  route_id: "",
  pos_till_id: "",
  is_default: false,
  is_active: true,
  enable_stk_push: true,
};

export function MpesaPaybillAccountsPanel({
  branches = [],
  routes = [],
  tills = [],
  setError,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/mpesa-paybill-accounts", { loading: false });
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch (e) {
      setError?.(e instanceof ApiError ? e.message : "Failed to load paybill accounts");
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setForm(EMPTY);
    setEditingId(null);
  }

  function startEdit(row) {
    setEditingId(row.id);
    setForm({
      name: row.name ?? "",
      primary_short_code: row.primary_short_code ?? "",
      shortcode: row.shortcode ?? "",
      till_number: row.till_number ?? "",
      child_storecode: row.child_storecode ?? "",
      branch_id: row.branch_id != null ? String(row.branch_id) : "",
      route_id: row.route_id != null ? String(row.route_id) : "",
      pos_till_id: row.pos_till_id != null ? String(row.pos_till_id) : "",
      is_default: Boolean(row.is_default),
      is_active: row.is_active !== false,
      enable_stk_push: row.enable_stk_push !== false && row.enable_stk_push !== 0,
    });
  }

  async function save() {
    setSaving(true);
    setError?.(null);
    try {
      const body = {
        name: form.name.trim(),
        primary_short_code: form.primary_short_code.trim(),
        shortcode: form.shortcode.trim() || null,
        till_number: form.till_number.trim() || null,
        child_storecode: form.child_storecode.trim() || form.primary_short_code.trim() || null,
        branch_id: form.branch_id ? Number(form.branch_id) : null,
        route_id: form.route_id ? Number(form.route_id) : null,
        pos_till_id: form.pos_till_id ? Number(form.pos_till_id) : null,
        is_default: Boolean(form.is_default),
        is_active: Boolean(form.is_active),
        enable_stk_push: Boolean(form.enable_stk_push),
      };
      if (editingId) {
        await apiRequest(`/mpesa-paybill-accounts/${editingId}`, { method: "PATCH", body });
        notifySuccess("Paybill account updated.");
      } else {
        await apiRequest("/mpesa-paybill-accounts", { method: "POST", body });
        notifySuccess("Paybill account created.");
      }
      resetForm();
      await load();
    } catch (e) {
      setError?.(e instanceof ApiError ? e.message : "Failed to save paybill account");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row) {
    if (row.is_default) return;
    setSaving(true);
    setError?.(null);
    try {
      await apiRequest(`/mpesa-paybill-accounts/${row.id}`, { method: "DELETE" });
      notifySuccess("Paybill account removed.");
      if (editingId === row.id) resetForm();
      await load();
    } catch (e) {
      setError?.(e instanceof ApiError ? e.message : "Failed to delete paybill account");
    } finally {
      setSaving(false);
    }
  }

  const branchOptions = branches.map((b) => ({
    value: String(b.id),
    label: b.branch_name || b.branch_code || `Branch #${b.id}`,
  }));
  const routeOptions = routes.map((r) => ({
    value: String(r.id),
    label: r.route_name || `Route #${r.id}`,
  }));
  const tillOptions = tills.map((t) => ({
    value: String(t.id),
    label: `${t.till_name || t.till_number || `Till #${t.id}`} (${t.till_number || t.id})`,
  }));

  return (
    <div className="mt-6 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4">
      <h4 className="theme-heading text-sm font-semibold">Paybills for routes, shops &amp; tills</h4>
      <p className="theme-subtext mt-1 text-xs">
        Assign a different Safaricom paybill or buy-goods till to each route, shop, or POS till (e.g. Till01).
        Enable STK push per paybill so only those tills can send Lipa na M-Pesa prompts. Shortcodes stay unique
        across organizations.
      </p>

      {loading ? (
        <p className="mt-3 text-sm text-slate-500">Loading paybill accounts…</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.length === 0 ? (
            <li className="text-sm text-slate-500">
              No extra paybills yet. The default shortcode above is used until you add more.
            </li>
          ) : (
            rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium text-slate-900">{row.name}</span>
                  <span className="ml-2 text-slate-600">{row.primary_short_code}</span>
                  {row.is_default ? (
                    <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-800">
                      Default
                    </span>
                  ) : null}
                  {row.enable_stk_push ? (
                    <span className="ml-2 rounded bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-800">
                      STK on
                    </span>
                  ) : (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                      STK off
                    </span>
                  )}
                  {row.pos_till_id ? (
                    <span className="ml-2 text-xs text-slate-500">
                      POS till #{row.pos_till_id}
                    </span>
                  ) : null}
                  {row.is_active === false ? (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                      Inactive
                    </span>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-xs font-medium text-[#185FA5]"
                    onClick={() => startEdit(row)}
                  >
                    Edit
                  </button>
                  {!row.is_default ? (
                    <button
                      type="button"
                      className="text-xs font-medium text-red-600"
                      disabled={saving}
                      onClick={() => void remove(row)}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </li>
            ))
          )}
        </ul>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label={editingId ? "Edit paybill name" : "New paybill name"}>
          <input
            className={inputClassName()}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Till01 buy-goods"
          />
        </Field>
        <Field label="Business shortcode (C2B)">
          <input
            className={inputClassName()}
            value={form.primary_short_code}
            onChange={(e) => setForm((f) => ({ ...f, primary_short_code: e.target.value }))}
            placeholder="Safaricom BusinessShortCode"
          />
        </Field>
        <Field label="Buy-goods / till number (STK PartyB)">
          <input
            className={inputClassName()}
            value={form.till_number}
            onChange={(e) => setForm((f) => ({ ...f, till_number: e.target.value }))}
            placeholder="Often same as shortcode for till"
          />
        </Field>
        <Field label="STK head office shortcode (optional)">
          <input
            className={inputClassName()}
            value={form.shortcode}
            onChange={(e) => setForm((f) => ({ ...f, shortcode: e.target.value }))}
          />
        </Field>
        <Field label="Shop / branch (optional)">
          <SearchableSelect
            value={form.branch_id}
            onChange={(v) => setForm((f) => ({ ...f, branch_id: v }))}
            options={[{ value: "", label: "Any / org-wide" }, ...branchOptions]}
            placeholder="Link to a shop"
          />
        </Field>
        <Field label="Route (optional)">
          <SearchableSelect
            value={form.route_id}
            onChange={(v) => setForm((f) => ({ ...f, route_id: v }))}
            options={[{ value: "", label: "Any / org-wide" }, ...routeOptions]}
            placeholder="Link to a route"
          />
        </Field>
        <Field label="POS till (optional)">
          <SearchableSelect
            value={form.pos_till_id}
            onChange={(v) => setForm((f) => ({ ...f, pos_till_id: v }))}
            options={[{ value: "", label: "Not linked to a POS till" }, ...tillOptions]}
            placeholder="e.g. Till01"
          />
        </Field>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(form.is_default)}
            onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
          />
          Default for this organization
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_active !== false}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
          />
          Active
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.enable_stk_push !== false}
            onChange={(e) => setForm((f) => ({ ...f, enable_stk_push: e.target.checked }))}
          />
          Enable STK push on this paybill
        </label>
        <PrimaryButton type="button" showIcon={false} disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : editingId ? "Update paybill" : "Add paybill"}
        </PrimaryButton>
        {editingId ? (
          <button type="button" className="text-sm text-slate-600" onClick={resetForm}>
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}
