"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  DISTRIBUTION_ASSIGN_STATUS_OPTIONS,
  DISTRIBUTION_DELIVERY_DATE_OPTIONS,
  distributionFormFromApi,
  distributionPayloadFromForm,
} from "@/lib/distribution-settings";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { LoadingListPrintSettingsFields } from "@/components/admin/loading-list-print-settings-fields";
import { DistributionDeliveryAlerts } from "@/components/admin/customer-notification-fields";
import { SettingsSubTabBar, useSettingsSubTab } from "@/components/admin/settings-sub-tabs";
import {
  distributionDeliveryAlertPayloadFromForm,
  notificationsFormFromApi,
} from "@/lib/notifications-settings";
import { useSettingsApi } from "@/contexts/settings-api-context";

function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-4 py-3 ${
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
        <span className="theme-heading block text-sm font-medium">{label}</span>
        {description ? <span className="theme-subtext mt-0.5 block text-xs">{description}</span> : null}
      </span>
    </label>
  );
}

export function DistributionSettingsPanel({ saving, setSaving, setError, setMessage, onAfterSave, platformManaged = false }) {
  const { refreshCapabilities, isSuperAdmin } = useAuth();
  const { settingsPath } = useSettingsApi();
  const afterSave = onAfterSave ?? (() => refreshCapabilities({ force: true }));
  const [form, setForm] = useState(distributionFormFromApi({}));
  const [alertForm, setAlertForm] = useState(notificationsFormFromApi({}));
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("routes");

  const visibleTabs = useMemo(
    () => [
      { id: "routes", label: "Drivers & routes" },
      { id: "trips", label: "Trips & loading" },
      { id: "delivery", label: "Delivery & cash" },
    ],
    [],
  );

  useSettingsSubTab(activeTab, setActiveTab, visibleTabs);

  useEffect(() => {
    setLoading(true);
    Promise.all([apiRequest(settingsPath("distribution")), apiRequest(settingsPath("notifications"))])
      .then(([distributionRes, notificationsRes]) => {
        setForm(distributionFormFromApi(distributionRes));
        setAlertForm(notificationsFormFromApi(notificationsRes));
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load distribution settings"))
      .finally(() => setLoading(false));
  }, [setError, settingsPath]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const [distributionRes, notificationsRes] = await Promise.all([
        apiRequest(settingsPath("distribution"), {
          method: "PATCH",
          body: distributionPayloadFromForm(form),
        }),
        apiRequest(settingsPath("notifications"), {
          method: "PATCH",
          body: distributionDeliveryAlertPayloadFromForm(alertForm),
        }),
      ]);
      setForm(distributionFormFromApi(distributionRes));
      setAlertForm(notificationsFormFromApi(notificationsRes));
      if (afterSave) await afterSave();
      setMessage("Distribution settings saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save distribution settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave}>
      <section className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 shadow-sm">
        <h2 className="theme-heading text-lg font-medium">Distribution settings</h2>
        <p className="theme-subtext mt-1 text-sm">
          Route planning, driver assignment, and proof of delivery for wholesale distributors.
        </p>
        {loading ? (
          <p className="theme-subtext mt-4 text-sm">Loading…</p>
        ) : (
          <div className="mt-5 space-y-5">
            <SettingsSubTabBar
              tabs={visibleTabs}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              ariaLabel="Distribution settings"
            />
            <Toggle
              label="Enable distribution operations"
              description="On by default when the platform administrator enables Distribution for this organization. Operational routing rules below apply when distribution is enabled."
              checked={form.enable_distribution_ops}
              onChange={() => {}}
              disabled
            />

            {activeTab === "routes" ? (
          <div className="space-y-3">
            <Toggle
              label="Inherit customer route at checkout"
              description="When a sale has a customer with a route but no explicit route on the cart, copy the customer route to the order."
              checked={form.inherit_customer_route}
              onChange={(v) => setForm((f) => ({ ...f, inherit_customer_route: v }))}
              disabled={!form.enable_distribution_ops}
            />
            <Toggle
              label="Auto-assign driver"
              description="Pick the active driver for the order route when advancing to the assignment step. You can still assign or change drivers manually from the dispatch board."
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
            <Toggle
              label="Only show processed orders on dispatch board"
              description="When enabled (default), the dispatch board lists orders in Processed status only. Turn off to include other active workflow statuses (paid, unpaid, pending, and so on)."
              checked={form.dispatch_board_processed_only !== false}
              onChange={(v) => setForm((f) => ({ ...f, dispatch_board_processed_only: v }))}
              disabled={!form.enable_distribution_ops}
            />
          </div>
            ) : null}

            {activeTab === "trips" ? (
          <div className="space-y-3">
            {isSuperAdmin?.() ? (
              <>
                <Toggle
                  label="Show fulfillment step guidance"
                  description="Platform-only. When enabled, dispatch staff see interactive next-step hints on trip pages (tooltips and ordered actions). Off by default."
                  checked={form.enable_fulfillment_guidance}
                  onChange={(v) => setForm((f) => ({ ...f, enable_fulfillment_guidance: v }))}
                  disabled={!form.enable_distribution_ops}
                />
                <Toggle
                  label="Warehouse shelf / bin on products"
                  description="Platform-only. For distribution setups: show shelf location on products and picking lists. Leave off for wholesale, retail, and small shops."
                  checked={form.enable_product_shelf_location}
                  onChange={(v) => setForm((f) => ({ ...f, enable_product_shelf_location: v }))}
                  disabled={!form.enable_distribution_ops}
                />
              </>
            ) : null}
            <Toggle
              label="Auto-create dispatch trips"
              description="When an order reaches the assignment status, add it to today's draft trip for its route (creating the trip if needed). Trips can still be created and managed manually on the dispatch board."
              checked={form.auto_create_trips}
              onChange={(v) => setForm((f) => ({ ...f, auto_create_trips: v }))}
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
              label="Enforce vehicle capacity"
              description="Block locking the loading list or starting a trip when load weight or volume exceeds the assigned vehicle limits."
              checked={form.enforce_vehicle_capacity}
              onChange={(v) => setForm((f) => ({ ...f, enforce_vehicle_capacity: v }))}
              disabled={!form.enable_distribution_ops}
            />
            <Toggle
              label="Require picking complete before lock"
              description="Warehouse must mark the picking list complete (with picked quantities recorded) before the loading list can be locked."
              checked={form.require_picking_before_lock}
              onChange={(v) => setForm((f) => ({ ...f, require_picking_before_lock: v }))}
              disabled={!form.enable_distribution_ops}
            />
            <Toggle
              label="Include normal backoffice orders"
              description="When enabled, backoffice orders for route customers appear in route orders, dispatch, and loading sheets. Enabled by default."
              checked={form.include_normal_orders_in_loading_list}
              onChange={(v) => setForm((f) => ({ ...f, include_normal_orders_in_loading_list: v }))}
              disabled={!form.enable_distribution_ops}
            />
            <div className="mt-4 space-y-3 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] p-4">
              <div>
                <h3 className="theme-heading text-sm font-medium">Loading list layout</h3>
                <p className="theme-subtext mt-1 text-xs">
                  Control which columns appear when printing or previewing loading lists from dispatch trips.
                </p>
              </div>
              <LoadingListPrintSettingsFields
                form={form}
                setForm={setForm}
                showFontNote
              />
            </div>
          </div>
            ) : null}

            {activeTab === "delivery" ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-4 py-3 text-sm">
              <p className="theme-heading font-medium">Driver mobile app & attendance</p>
              <p className="theme-subtext mt-1 text-xs">
                Whether drivers can use the mobile app and whether sign-in photo/GPS is required are
                configured by the platform administrator under Sales behaviour → Mobile application modules.
              </p>
            </div>
            <Toggle
              label="Require proof of delivery"
              description="Prompt for receiver name before marking an order as delivered."
              checked={form.require_pod_on_delivered}
              onChange={(v) => setForm((f) => ({ ...f, require_pod_on_delivered: v }))}
              disabled={!form.enable_distribution_ops}
            />
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
            <DistributionDeliveryAlerts form={alertForm} setForm={setAlertForm} />
          </div>
            ) : null}
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
