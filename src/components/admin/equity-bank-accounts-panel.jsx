"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { Field, PrimaryButton, inputClassName, SearchableSelect } from "@/components/catalog/catalog-shared";
import { notifySuccess } from "@/lib/notify";

const EMPTY = {
  name: "",
  primary_account_number: "",
  paybill_number: "",
  account_number: "",
  branch_id: "",
  route_id: "",
  is_default: false,
  is_active: true,
  callback_url: "",
  callback_shared_secret: "",
};

function formFromRow(row) {
  return {
    name: row.name ?? "",
    primary_account_number: row.primary_account_number ?? "",
    paybill_number: row.paybill_number ?? "",
    account_number: row.account_number ?? "",
    branch_id: row.branch_id != null ? String(row.branch_id) : "",
    route_id: row.route_id != null ? String(row.route_id) : "",
    is_default: Boolean(row.is_default),
    is_active: row.is_active !== false,
    callback_url: row.callback_url ?? "",
    callback_shared_secret: "",
  };
}

/**
 * @param {{
 *   branches?: array,
 *   routes?: array,
 *   setError?: (msg: string | null) => void,
 *   refreshKey?: number | string,
 * }} props
 */
export function EquityBankAccountsPanel({ branches = [], routes = [], setError, refreshKey = 0 }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/equity-bank-accounts", { loading: false, reportIssues: false });
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch (e) {
      setError?.(e instanceof ApiError ? e.message : "Failed to load Equity accounts");
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  function resetForm() {
    setForm(EMPTY);
    setEditingId(null);
  }

  function startEdit(row) {
    setEditingId(row.id);
    setForm(formFromRow(row));
  }

  async function save() {
    setSaving(true);
    setError?.(null);
    try {
      const body = {
        name: form.name.trim(),
        primary_account_number: form.primary_account_number.trim(),
        paybill_number: form.paybill_number.trim() || null,
        account_number: form.account_number.trim() || null,
        branch_id: form.branch_id ? Number(form.branch_id) : null,
        route_id: form.route_id ? Number(form.route_id) : null,
        is_default: Boolean(form.is_default),
        is_active: Boolean(form.is_active),
        callback_url: form.callback_url.trim() || null,
        callback_shared_secret: form.callback_shared_secret.trim() || null,
      };
      if (editingId) {
        await apiRequest(`/equity-bank-accounts/${editingId}`, { method: "PATCH", body });
        notifySuccess("Equity account updated.");
      } else {
        await apiRequest("/equity-bank-accounts", { method: "POST", body });
        notifySuccess("Equity account created.");
      }
      resetForm();
      await load();
    } catch (e) {
      setError?.(e instanceof ApiError ? e.message : "Failed to save Equity account");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row) {
    if (row.is_default) return;
    setSaving(true);
    setError?.(null);
    try {
      await apiRequest(`/equity-bank-accounts/${row.id}`, { method: "DELETE" });
      notifySuccess("Equity account removed.");
      if (editingId === row.id) resetForm();
      await load();
    } catch (e) {
      setError?.(e instanceof ApiError ? e.message : "Failed to delete Equity account");
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
  const selectOptions = [
    { value: "", label: "Add new Equity account…" },
    ...rows.map((row) => ({
      value: String(row.id),
      label: `${row.name || "Account"} · ${row.primary_account_number}${
        row.has_own_callback_credentials ? " · own callback" : ""
      }`,
    })),
  ];

  return (
    <div className="mt-6 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4">
      <h4 className="theme-heading text-sm font-semibold">Saved Equity accounts</h4>
      <p className="theme-subtext mt-1 text-xs">
        Select an account to edit numbers, route mapping, and optional callback URL / shared secret. Blank
        callback fields inherit the organization defaults above.
      </p>

      <div className="mt-3 max-w-xl">
        <Field label="Select Equity account to edit">
          <SearchableSelect
            value={editingId != null ? String(editingId) : ""}
            onChange={(v) => {
              if (!v) {
                resetForm();
                return;
              }
              const row = rows.find((r) => String(r.id) === String(v));
              if (row) startEdit(row);
            }}
            options={selectOptions}
            placeholder="Choose a saved account"
          />
        </Field>
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-slate-500">Loading Equity accounts…</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.length === 0 ? (
            <li className="text-sm text-slate-500">
              No Equity accounts saved yet. Add one below — it will appear in this list after you save.
            </li>
          ) : (
            rows.map((row) => (
              <li
                key={row.id}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                  editingId === row.id ? "border-[#185FA5] bg-sky-50/60" : "border-slate-200"
                }`}
              >
                <div>
                  <span className="font-medium text-slate-900">{row.name}</span>
                  <span className="ml-2 text-slate-600">{row.primary_account_number}</span>
                  {row.is_default ? (
                    <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-800">
                      Default
                    </span>
                  ) : null}
                  {row.has_own_callback_credentials ? (
                    <span className="ml-2 rounded bg-violet-50 px-1.5 py-0.5 text-[11px] text-violet-800">
                      Own callback
                    </span>
                  ) : (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                      Uses org callback
                    </span>
                  )}
                  {row.route_id ? (
                    <span className="ml-2 text-xs text-slate-500">Route #{row.route_id}</span>
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

      <h4 className="theme-heading mt-5 text-sm font-semibold">
        {editingId ? "Edit Equity account" : "Add Equity account"}
      </h4>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label="Account name">
          <input
            className={inputClassName()}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Nairobi route Equity"
          />
        </Field>
        <Field label="Primary account / paybill (callback)">
          <input
            className={inputClassName()}
            value={form.primary_account_number}
            onChange={(e) => setForm((f) => ({ ...f, primary_account_number: e.target.value }))}
            placeholder="Equity merchant / paybill number"
          />
        </Field>
        <Field label="Paybill number (alias)">
          <input
            className={inputClassName()}
            value={form.paybill_number}
            onChange={(e) => setForm((f) => ({ ...f, paybill_number: e.target.value }))}
          />
        </Field>
        <Field label="Account number (alias)">
          <input
            className={inputClassName()}
            value={form.account_number}
            onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))}
          />
        </Field>
        <Field label="Map to route">
          <SearchableSelect
            value={form.route_id}
            onChange={(v) => setForm((f) => ({ ...f, route_id: v }))}
            options={[{ value: "", label: "— None —" }, ...routeOptions]}
            placeholder="Route"
          />
        </Field>
        <Field label="Map to branch">
          <SearchableSelect
            value={form.branch_id}
            onChange={(v) => setForm((f) => ({ ...f, branch_id: v }))}
            options={[{ value: "", label: "— None —" }, ...branchOptions]}
            placeholder="Branch"
          />
        </Field>
      </div>

      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
        <h5 className="text-sm font-semibold text-slate-800">Callback for this account</h5>
        <p className="mt-1 text-xs text-slate-600">
          Optional. Leave blank to use the organization Equity callback URL / shared secret above.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="Callback URL">
            <input
              className={inputClassName()}
              value={form.callback_url}
              onChange={(e) => setForm((f) => ({ ...f, callback_url: e.target.value }))}
              placeholder="https://…/api/v1/payments/equity/confirmation"
            />
          </Field>
          <Field label="Callback shared secret">
            <input
              type="password"
              className={inputClassName()}
              value={form.callback_shared_secret}
              onChange={(e) => setForm((f) => ({ ...f, callback_shared_secret: e.target.value }))}
              placeholder={editingId ? "Leave blank to keep existing / inherit" : "Leave blank to inherit"}
            />
          </Field>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.is_default}
            onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
          />
          Default for org
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
          />
          Active
        </label>
        <PrimaryButton
          type="button"
          disabled={saving || !form.name.trim() || !form.primary_account_number.trim()}
          onClick={() => void save()}
        >
          {editingId ? "Update account" : "Add account"}
        </PrimaryButton>
        {editingId ? (
          <button type="button" className="text-sm text-slate-600 underline" onClick={resetForm}>
            Cancel edit
          </button>
        ) : null}
      </div>
    </div>
  );
}
