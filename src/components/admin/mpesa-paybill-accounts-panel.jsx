"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { resolveMpesaSettingsHref } from "@/lib/centrix-payments-routes";
import { Field, PrimaryButton, inputClassName, SearchableSelect } from "@/components/catalog/catalog-shared";
import { notifySuccess } from "@/lib/notify";

const ACCOUNT_TYPES = [
  { value: "paybill", label: "Paybill (Lipa na M-Pesa paybill)" },
  { value: "till", label: "Buy goods till" },
];

const EMPTY = {
  account_type: "paybill",
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
  env: "",
  consumer_key: "",
  consumer_secret: "",
  passkey: "",
  stk_callback_url: "",
  c2b_confirmation_url: "",
  c2b_validation_url: "",
};

function inferAccountType(row) {
  if (!row) return "paybill";
  const till = String(row.till_number ?? "").trim();
  const primary = String(row.primary_short_code ?? "").trim();
  if (till && till !== primary) return "till";
  if (till && !String(row.shortcode ?? "").trim()) return "till";
  return "paybill";
}

function formFromRow(row) {
  return {
    account_type: inferAccountType(row),
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
    env: row.env ?? "",
    consumer_key: row.consumer_key ?? "",
    consumer_secret: "",
    passkey: "",
    stk_callback_url: row.stk_callback_url ?? "",
    c2b_confirmation_url: row.c2b_confirmation_url ?? "",
    c2b_validation_url: row.c2b_validation_url ?? "",
  };
}

function credentialLabel(row, kind) {
  if (kind === "consumer_key") {
    if (row.consumer_key) return row.consumer_key;
    return row.has_own_daraja_credentials ? "Inherited" : "Org default";
  }
  if (kind === "consumer_secret") {
    return row.has_consumer_secret ? "Saved" : "Org default";
  }
  if (kind === "passkey") {
    return row.has_passkey ? "Saved" : "Org default";
  }
  return "—";
}

function scopeLabel(row, { routes, tills }) {
  if (row.pos_till_id) {
    const till = tills.find((item) => Number(item.id) === Number(row.pos_till_id));
    return till ? `POS: ${till.till_name || till.till_number}` : `POS till #${row.pos_till_id}`;
  }
  if (row.route_id) {
    const route = routes.find((item) => Number(item.id) === Number(row.route_id));
    return route ? `Route: ${route.route_name}` : `Route #${row.route_id}`;
  }
  return "Org-wide";
}

function typeLabel(row) {
  return inferAccountType(row) === "till" ? "Buy goods till" : "Paybill";
}

/**
 * @param {{
 *   branches?: array,
 *   routes?: array,
 *   tills?: array,
 *   setError?: (msg: string | null) => void,
 *   refreshKey?: number | string,
 *   showCredentialHint?: boolean,
 * }} props
 */
export function MpesaPaybillAccountsPanel({
  branches = [],
  routes = [],
  tills = [],
  setError,
  refreshKey = 0,
  showCredentialHint = true,
}) {
  const mpesaSettingsHref = resolveMpesaSettingsHref();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);

  const scopeMaps = useMemo(() => ({ routes, tills }), [routes, tills]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/mpesa-paybill-accounts", {
        loading: false,
        reportIssues: false,
      });
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch (e) {
      setError?.(e instanceof ApiError ? e.message : "Failed to load paybill accounts");
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
      if (form.route_id && form.pos_till_id) {
        setError?.("Link a paybill to a route or a POS till, not both.");
        setSaving(false);
        return;
      }

      const primary = form.primary_short_code.trim();
      const till = form.till_number.trim();

      if (form.account_type === "paybill" && !primary) {
        setError?.("Enter the paybill number.");
        setSaving(false);
        return;
      }

      if (form.account_type === "till") {
        if (!till) {
          setError?.("Enter the buy goods till number.");
          setSaving(false);
          return;
        }
        if (!primary) {
          setError?.("Enter the head office paybill shortcode for this till.");
          setSaving(false);
          return;
        }
      }

      const body = {
        name: form.name.trim(),
        primary_short_code: primary,
        shortcode: form.shortcode.trim() || null,
        till_number: till || null,
        child_storecode: form.child_storecode.trim() || primary || till || null,
        branch_id: form.branch_id ? Number(form.branch_id) : null,
        route_id: form.route_id ? Number(form.route_id) : null,
        pos_till_id: form.pos_till_id ? Number(form.pos_till_id) : null,
        is_default: Boolean(form.is_default),
        is_active: Boolean(form.is_active),
        enable_stk_push: Boolean(form.enable_stk_push),
        env: form.env || null,
        consumer_key: form.consumer_key.trim() || null,
        consumer_secret: form.consumer_secret.trim() || null,
        passkey: form.passkey.trim() || null,
        stk_callback_url: form.stk_callback_url.trim() || null,
        c2b_confirmation_url: form.c2b_confirmation_url.trim() || null,
        c2b_validation_url: form.c2b_validation_url.trim() || null,
      };

      if (editingId) {
        await apiRequest(`/mpesa-paybill-accounts/${editingId}`, { method: "PATCH", body });
        notifySuccess("M-Pesa account updated.");
      } else {
        await apiRequest("/mpesa-paybill-accounts", { method: "POST", body });
        notifySuccess("M-Pesa account created.");
      }
      resetForm();
      await load();
    } catch (e) {
      setError?.(e instanceof ApiError ? e.message : "Failed to save M-Pesa account");
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
      notifySuccess("M-Pesa account removed.");
      if (editingId === row.id) resetForm();
      await load();
    } catch (e) {
      setError?.(e instanceof ApiError ? e.message : "Failed to delete M-Pesa account");
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

  const isTill = form.account_type === "till";

  return (
    <div className="mt-6 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4">
      <h4 className="theme-heading text-sm font-semibold">Saved M-Pesa accounts</h4>
      <p className="theme-subtext mt-1 text-xs">
        Paybills and buy goods tills configured for this organization. Per-account Daraja keys override
        the organization defaults under{" "}
        <a href={mpesaSettingsHref} className="font-medium text-[var(--theme-primary)] underline">
          M-Pesa settings
        </a>
        .
      </p>

      {loading ? (
        <p className="mt-3 text-sm text-slate-500">Loading M-Pesa accounts…</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          No paybills or tills saved yet. Add one below.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--theme-border)]">
          <table className="theme-table min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--theme-border)] bg-[var(--theme-surface-muted)] text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Main number</th>
                <th className="px-3 py-2 font-medium">Head office paybill</th>
                <th className="px-3 py-2 font-medium">STK till</th>
                <th className="px-3 py-2 font-medium">STK shortcode</th>
                <th className="px-3 py-2 font-medium">Env</th>
                <th className="px-3 py-2 font-medium">Consumer key</th>
                <th className="px-3 py-2 font-medium">Secret</th>
                <th className="px-3 py-2 font-medium">Passkey</th>
                <th className="px-3 py-2 font-medium">Linked to</th>
                <th className="px-3 py-2 font-medium">STK</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const accountType = inferAccountType(row);
                const mainNumber =
                  accountType === "till"
                    ? row.till_number || "—"
                    : row.primary_short_code || "—";
                const headOfficePaybill =
                  accountType === "till" ? row.primary_short_code || "—" : "—";
                const stkTill = accountType === "paybill" ? row.till_number || "—" : "—";
                const stkShortcode = row.shortcode || "—";

                return (
                  <tr
                    key={row.id}
                    className={`border-b border-[var(--theme-border)] ${
                      editingId === row.id ? "bg-sky-50/60 dark:bg-sky-950/20" : ""
                    }`}
                  >
                    <td className="px-3 py-2 font-medium text-slate-900">
                      {row.name}
                      {row.is_default ? (
                        <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">
                          Default
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{typeLabel(row)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-800">{mainNumber}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-700">{headOfficePaybill}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-700">{stkTill}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-700">{stkShortcode}</td>
                    <td className="px-3 py-2 text-slate-700">{row.env || "Org default"}</td>
                    <td className="max-w-[140px] truncate px-3 py-2 font-mono text-xs text-slate-700">
                      {credentialLabel(row, "consumer_key")}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{credentialLabel(row, "consumer_secret")}</td>
                    <td className="px-3 py-2 text-slate-700">{credentialLabel(row, "passkey")}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{scopeLabel(row, scopeMaps)}</td>
                    <td className="px-3 py-2 text-slate-700">{row.enable_stk_push ? "On" : "Off"}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {row.is_active === false ? "Inactive" : "Active"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="text-xs font-medium text-[#185FA5]"
                        onClick={() => startEdit(row)}
                      >
                        Edit
                      </button>
                      {!row.is_default ? (
                        <>
                          <span className="mx-1 text-slate-300">·</span>
                          <button
                            type="button"
                            className="text-xs font-medium text-red-600"
                            disabled={saving}
                            onClick={() => void remove(row)}
                          >
                            Remove
                          </button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h4 className="theme-heading mt-6 text-sm font-semibold">
        {editingId ? "Edit M-Pesa account" : "Add M-Pesa account"}
      </h4>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label="Account type">
          <SearchableSelect
            value={form.account_type}
            onChange={(v) =>
              setForm((current) => ({
                ...current,
                account_type: v === "till" ? "till" : "paybill",
              }))
            }
            options={ACCOUNT_TYPES}
            placeholder="Choose paybill or buy goods till"
          />
        </Field>
        <Field label="Display name">
          <input
            className={inputClassName()}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder={isTill ? "e.g. Main bar till" : "e.g. Company paybill"}
          />
        </Field>

        {isTill ? (
          <>
            <Field label="Buy goods till number">
              <input
                className={inputClassName()}
                value={form.till_number}
                onChange={(e) => setForm((f) => ({ ...f, till_number: e.target.value }))}
                placeholder="Safaricom till number used for STK PartyB"
              />
            </Field>
            <Field label="Head office paybill shortcode">
              <input
                className={inputClassName()}
                value={form.primary_short_code}
                onChange={(e) => setForm((f) => ({ ...f, primary_short_code: e.target.value }))}
                placeholder="Paybill that owns this till"
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="Paybill number">
              <input
                className={inputClassName()}
                value={form.primary_short_code}
                onChange={(e) => setForm((f) => ({ ...f, primary_short_code: e.target.value }))}
                placeholder="Business shortcode for C2B and STK"
              />
            </Field>
            <Field label="Till number for STK (optional)">
              <input
                className={inputClassName()}
                value={form.till_number}
                onChange={(e) => setForm((f) => ({ ...f, till_number: e.target.value }))}
                placeholder="PartyB when different from paybill"
              />
            </Field>
          </>
        )}

        <Field label="STK head office shortcode (optional)">
          <input
            className={inputClassName()}
            value={form.shortcode}
            onChange={(e) => setForm((f) => ({ ...f, shortcode: e.target.value }))}
            placeholder="Optional override for Lipa na M-Pesa Online"
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
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                route_id: v,
                ...(v ? { pos_till_id: "" } : null),
              }))
            }
            options={[{ value: "", label: "Any / org-wide" }, ...routeOptions]}
            placeholder="Link to a route"
            disabled={Boolean(form.pos_till_id)}
          />
        </Field>
        <Field label="POS till (optional)">
          <SearchableSelect
            value={form.pos_till_id}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                pos_till_id: v,
                ...(v ? { route_id: "" } : null),
              }))
            }
            options={[{ value: "", label: "Not linked to a POS till" }, ...tillOptions]}
            placeholder="e.g. Till01"
            disabled={Boolean(form.route_id)}
          />
        </Field>
      </div>

      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
        <h5 className="text-sm font-semibold text-slate-800">Daraja app for this account</h5>
        {showCredentialHint ? (
          <p className="mt-1 text-xs text-slate-600">
            Use these when this paybill or till has its own Safaricom app. Leave blank to inherit
            organization defaults.
          </p>
        ) : null}
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="Environment">
            <SearchableSelect
              value={form.env || ""}
              onChange={(v) => setForm((f) => ({ ...f, env: v }))}
              options={[
                { value: "", label: "Inherit organization default" },
                { value: "sandbox", label: "Sandbox" },
                { value: "live", label: "Live" },
              ]}
              placeholder="Environment"
            />
          </Field>
          <Field label="Consumer key">
            <input
              className={inputClassName()}
              value={form.consumer_key}
              onChange={(e) => setForm((f) => ({ ...f, consumer_key: e.target.value }))}
              placeholder="Leave blank to inherit"
            />
          </Field>
          <Field label="Consumer secret">
            <input
              type="password"
              className={inputClassName()}
              value={form.consumer_secret}
              onChange={(e) => setForm((f) => ({ ...f, consumer_secret: e.target.value }))}
              placeholder={editingId ? "Leave blank to keep existing / inherit" : "Leave blank to inherit"}
            />
          </Field>
          <Field label="Passkey (Lipa na M-Pesa)">
            <input
              type="password"
              className={inputClassName()}
              value={form.passkey}
              onChange={(e) => setForm((f) => ({ ...f, passkey: e.target.value }))}
              placeholder={editingId ? "Leave blank to keep existing / inherit" : "Leave blank to inherit"}
            />
          </Field>
          <Field label="C2B confirmation URL">
            <input
              className={inputClassName()}
              value={form.c2b_confirmation_url}
              onChange={(e) => setForm((f) => ({ ...f, c2b_confirmation_url: e.target.value }))}
              placeholder="https://…/api/v1/payments/c2b/confirmation"
            />
          </Field>
          <Field label="C2B validation URL">
            <input
              className={inputClassName()}
              value={form.c2b_validation_url}
              onChange={(e) => setForm((f) => ({ ...f, c2b_validation_url: e.target.value }))}
              placeholder="https://…/api/v1/payments/c2b/validation"
            />
          </Field>
          <Field label="STK push callback URL">
            <input
              className={inputClassName()}
              value={form.stk_callback_url}
              onChange={(e) => setForm((f) => ({ ...f, stk_callback_url: e.target.value }))}
              placeholder="https://…/api/v1/payments/stk/callback"
            />
          </Field>
        </div>
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
          Enable STK push
        </label>
        <PrimaryButton type="button" showIcon={false} disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : editingId ? "Update account" : "Add account"}
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
