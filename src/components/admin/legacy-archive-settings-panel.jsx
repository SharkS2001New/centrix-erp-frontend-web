"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import {
  EMPTY_LEGACY_ARCHIVE_FORM,
  legacyArchiveFormFromApi,
  legacyArchivePayloadFromForm,
} from "@/lib/legacy-archive-settings";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { useSettingsApi } from "@/contexts/settings-api-context";

function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-slate-500">{description}</span> : null}
      </span>
    </label>
  );
}

function StatusPill({ ok, label }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
        ok ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
      }`}
    >
      {label}
    </span>
  );
}

function formatCount(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString() : "0";
}

export function LegacyArchiveSettingsPanel({ saving, setSaving, setError, setMessage, onAfterSave }) {
  const { settingsPath } = useSettingsApi();
  const [form, setForm] = useState(EMPTY_LEGACY_ARCHIVE_FORM);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const applyResponse = useCallback((res) => {
    setForm(legacyArchiveFormFromApi(res));
    setStatus(res?.legacy_archive_status ?? null);
    const la = res?.legacy_archive ?? {};
    if (la.host || la.port || la.username || la.password_configured) {
      setShowAdvanced(true);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest(settingsPath("legacy-archive"));
      applyResponse(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load legacy archive settings");
    } finally {
      setLoading(false);
    }
  }, [applyResponse, setError, settingsPath]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveSettings(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiRequest(settingsPath("legacy-archive"), {
        method: "PATCH",
        body: legacyArchivePayloadFromForm(form),
      });
      applyResponse(res);
      if (onAfterSave) await onAfterSave();
      setMessage("Legacy archive settings saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save legacy archive settings");
    } finally {
      setSaving(false);
    }
  }

  const counts = status?.counts ?? null;

  return (
    <form onSubmit={saveSettings}>
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Legacy archive (LightStores)</h2>
        <p className="mt-1 text-sm text-slate-500">
          Connect a restored LightStores MySQL database for read-only historical sales. Products, customers,
          VAT, UOMs, and suppliers live in Centrix — import them with{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">legacy:import-lightstores --master-data</code> on
          the API server.
        </p>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="mt-6 space-y-4">
            <Toggle
              checked={form.enabled}
              onChange={(enabled) => setForm((f) => ({ ...f, enabled }))}
              label="Enable legacy archive"
              description="When on, this tenant can browse pre-cutover sales from the legacy database and materialize individual sales for returns."
            />

            <Field label="Legacy MySQL database name">
              <input
                type="text"
                className={inputClassName()}
                value={form.database}
                onChange={(e) => setForm((f) => ({ ...f, database: e.target.value }))}
                placeholder="lightstores_moonlight"
                disabled={!form.enabled}
                required={form.enabled}
              />
              <p className="mt-1 text-xs text-slate-500">
                Database on the same MySQL server as Centrix (restored from LightStoresDBBackup.sql).
              </p>
            </Field>

            <Field label="Display label">
              <input
                type="text"
                className={inputClassName()}
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="LightStores historical sales"
                disabled={!form.enabled}
              />
            </Field>

            <Field label="Cutover date">
              <input
                type="date"
                className={inputClassName()}
                value={form.cutover_date}
                onChange={(e) => setForm((f) => ({ ...f, cutover_date: e.target.value }))}
                disabled={!form.enabled}
              />
              <p className="mt-1 text-xs text-slate-500">
                Sales on or before this date can be merged into dashboard reports when legacy archive is included.
              </p>
            </Field>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <button
                type="button"
                className="text-sm font-medium text-[#185FA5] hover:underline"
                onClick={() => setShowAdvanced((v) => !v)}
              >
                {showAdvanced ? "Hide" : "Show"} advanced connection (optional)
              </button>
              <p className="mt-1 text-xs text-slate-500">
                Leave blank to use the same MySQL host and credentials as the Centrix API.
              </p>
              {showAdvanced ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Host">
                    <input
                      type="text"
                      className={inputClassName()}
                      value={form.host}
                      onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                      placeholder="157.173.120.126"
                      disabled={!form.enabled}
                    />
                  </Field>
                  <Field label="Port">
                    <input
                      type="number"
                      min={1}
                      max={65535}
                      className={inputClassName()}
                      value={form.port}
                      onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
                      placeholder="3306"
                      disabled={!form.enabled}
                    />
                  </Field>
                  <Field label="Username">
                    <input
                      type="text"
                      className={inputClassName()}
                      value={form.username}
                      onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                      disabled={!form.enabled}
                      autoComplete="off"
                    />
                  </Field>
                  <Field label="Password">
                    <input
                      type="password"
                      className={inputClassName()}
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                      placeholder={form.password_configured ? "••••••••" : ""}
                      disabled={!form.enabled}
                      autoComplete="new-password"
                    />
                    {form.password_configured && !form.password ? (
                      <p className="mt-1 text-xs text-slate-500">Leave blank to keep the current password.</p>
                    ) : null}
                  </Field>
                </div>
              ) : null}
            </div>

            {status ? (
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Connection status</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusPill ok={status.configured} label={status.configured ? "Configured" : "Not configured"} />
                  <StatusPill ok={status.available} label={status.available ? "Reachable" : "Unreachable"} />
                  {status.read_only ? <StatusPill ok label="Read-only" /> : null}
                </div>
                {!status.available && form.enabled && form.database ? (
                  <p className="mt-3 text-sm text-amber-800">
                    Centrix cannot reach this legacy database. Check the database name, MySQL grants, and network
                    access from the API pod.
                  </p>
                ) : null}
                {counts ? (
                  <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <dt className="text-xs text-slate-500">POS sales</dt>
                      <dd className="text-lg font-semibold text-slate-900">{formatCount(counts.sales_pos)}</dd>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <dt className="text-xs text-slate-500">Mobile / route</dt>
                      <dd className="text-lg font-semibold text-slate-900">{formatCount(counts.sales_mobile)}</dd>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <dt className="text-xs text-slate-500">Debtor sales</dt>
                      <dd className="text-lg font-semibold text-slate-900">{formatCount(counts.sales_debtor)}</dd>
                    </div>
                  </dl>
                ) : null}
              </div>
            ) : null}

            <PrimaryButton type="submit" disabled={loading || saving} showIcon={false}>
              {saving ? "Saving…" : "Save legacy archive"}
            </PrimaryButton>
          </div>
        )}
      </section>
    </form>
  );
}
