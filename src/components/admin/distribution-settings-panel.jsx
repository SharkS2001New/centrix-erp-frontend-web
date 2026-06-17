"use client";

import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  DISTRIBUTION_ASSIGN_STATUS_OPTIONS,
  DISTRIBUTION_DELIVERY_DATE_OPTIONS,
  distributionFormFromApi,
  distributionPayloadFromForm,
} from "@/lib/distribution-settings";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";

function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
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

export function DistributionSettingsPanel({ saving, setSaving, setError, setMessage }) {
  const { refreshCapabilities } = useAuth();
  const [form, setForm] = useState(distributionFormFromApi({}));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiRequest("/erp/settings/distribution")
      .then((res) => setForm(distributionFormFromApi(res)))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load distribution settings"))
      .finally(() => setLoading(false));
  }, [setError]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiRequest("/erp/settings/distribution", {
        method: "PATCH",
        body: distributionPayloadFromForm(form),
      });
      setForm(distributionFormFromApi(res));
      await refreshCapabilities();
      setMessage("Distribution settings saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save distribution settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave}>
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Distribution settings</h2>
        <p className="mt-1 text-sm text-slate-500">
          Route planning, driver assignment, and proof of delivery for wholesale distributors.
        </p>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="mt-5 space-y-3">
            <Toggle
              label="Enable distribution operations"
              description="Set by the platform administrator when this organization was registered. Operational routing rules below apply when distribution is enabled."
              checked={form.enable_distribution_ops}
              onChange={() => {}}
              disabled
            />
            <Toggle
              label="Inherit customer route at checkout"
              description="When a sale has a customer with a route but no explicit route on the cart, copy the customer route to the order."
              checked={form.inherit_customer_route}
              onChange={(v) => setForm((f) => ({ ...f, inherit_customer_route: v }))}
              disabled={!form.enable_distribution_ops}
            />
            <Toggle
              label="Auto-assign driver"
              description="Pick the active driver for the order route when advancing to the assignment step."
              checked={form.auto_assign_driver}
              onChange={(v) => setForm((f) => ({ ...f, auto_assign_driver: v }))}
              disabled={!form.enable_distribution_ops}
            />
            <Toggle
              label="Auto-assign vehicle"
              description="Use the driver default vehicle when auto-assigning."
              checked={form.auto_assign_truck}
              onChange={(v) => setForm((f) => ({ ...f, auto_assign_truck: v }))}
              disabled={!form.enable_distribution_ops}
            />
            <Toggle
              label="Require load weight"
              description="Block assignment until products have weights and total load weight is greater than zero."
              checked={form.require_weight_on_load}
              onChange={(v) => setForm((f) => ({ ...f, require_weight_on_load: v }))}
              disabled={!form.enable_distribution_ops}
            />
            <Toggle
              label="Require proof of delivery"
              description="Prompt for receiver name before marking an order as delivered."
              checked={form.require_pod_on_delivered}
              onChange={(v) => setForm((f) => ({ ...f, require_pod_on_delivered: v }))}
              disabled={!form.enable_distribution_ops}
            />
            <Toggle
              label="Enforce vehicle capacity"
              description="Block locking the loading list or starting a trip when load weight exceeds the assigned vehicle max weight."
              checked={form.enforce_vehicle_capacity}
              onChange={(v) => setForm((f) => ({ ...f, enforce_vehicle_capacity: v }))}
              disabled={!form.enable_distribution_ops}
            />
            <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Cash / COD</p>
            <Toggle
              label="Enable route cash reconciliation"
              description="Track expected COD per trip and record cash collected by the driver at trip close."
              checked={form.enable_cod_reconciliation}
              onChange={(v) => setForm((f) => ({ ...f, enable_cod_reconciliation: v }))}
              disabled={!form.enable_distribution_ops}
            />
            <Toggle
              label="Require cash settlement before trip complete"
              description="Trip cannot be marked complete until collected cash is recorded."
              checked={form.require_trip_cash_settlement}
              onChange={(v) => setForm((f) => ({ ...f, require_trip_cash_settlement: v }))}
              disabled={!form.enable_distribution_ops || !form.enable_cod_reconciliation}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Assign driver on status">
                <select
                  className={inputClassName()}
                  value={form.assign_on_status}
                  onChange={(e) => setForm((f) => ({ ...f, assign_on_status: e.target.value }))}
                  disabled={!form.enable_distribution_ops}
                >
                  {DISTRIBUTION_ASSIGN_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Set delivery date on">
                <select
                  className={inputClassName()}
                  value={form.set_delivery_date_on}
                  onChange={(e) => setForm((f) => ({ ...f, set_delivery_date_on: e.target.value }))}
                  disabled={!form.enable_distribution_ops}
                >
                  {DISTRIBUTION_DELIVERY_DATE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        )}
        <div className="mt-6">
          <PrimaryButton type="submit" disabled={loading || saving} showIcon={false}>
            {saving ? "Saving…" : "Save"}
          </PrimaryButton>
        </div>
      </section>
    </form>
  );
}
