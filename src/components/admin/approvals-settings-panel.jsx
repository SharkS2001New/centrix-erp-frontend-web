"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { ApprovalAlertsFields } from "@/components/admin/approval-alerts-fields";
import { useSettingsApi } from "@/contexts/settings-api-context";
import {
  accountingApprovalsPayload,
  approvalsFormFromApiResponses,
  hrApprovalsPayload,
  inventoryApprovalsPayload,
  notificationsApprovalsPayload,
  procurementApprovalsPayload,
  salesApprovalsPayload,
} from "@/lib/approvals-settings";

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

function SettingsSection({ title, description, children }) {
  if (!children) return null;
  return (
    <section className="space-y-3 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] p-4">
      <div>
        <h3 className="theme-heading text-sm font-semibold">{title}</h3>
        {description ? <p className="theme-subtext mt-1 text-xs">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function ApprovalsSettingsPanel({
  saving,
  setSaving,
  setError,
  setMessage,
  onAfterSave,
  capabilities: capabilitiesProp,
}) {
  const { refreshCapabilities, capabilities: authCapabilities } = useAuth();
  const capabilities = capabilitiesProp ?? authCapabilities;
  const { settingsPath } = useSettingsApi();
  const afterSave = onAfterSave ?? refreshCapabilities;
  const [form, setForm] = useState(approvalsFormFromApiResponses({}));
  const [loading, setLoading] = useState(true);

  const modules = capabilities?.modules ?? {};
  const showSales = Boolean(modules.sales);
  const showInventory = Boolean(modules.inventory);
  const showProcurement = Boolean(modules.customers_suppliers);
  const showHr = Boolean(modules.hr_payroll);
  const showAccounting = Boolean(modules.accounting);
  const showNotifications = Boolean(modules.admin);

  const loadSections = useMemo(() => {
    const sections = [];
    if (showSales) sections.push("sales");
    if (showInventory) sections.push("inventory");
    if (showProcurement) sections.push("procurement");
    if (showHr) sections.push("hr");
    if (showAccounting) sections.push("accounting");
    if (showNotifications) sections.push("notifications");
    return sections;
  }, [showSales, showInventory, showProcurement, showHr, showAccounting, showNotifications]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const entries = await Promise.all(
        loadSections.map(async (section) => {
          const res = await apiRequest(settingsPath(section));
          return [section, res];
        }),
      );
      setForm(approvalsFormFromApiResponses(Object.fromEntries(entries)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load approval settings");
    } finally {
      setLoading(false);
    }
  }, [loadSections, setError, settingsPath]);

  useEffect(() => {
    if (loadSections.length === 0) {
      setLoading(false);
      return;
    }
    void loadSettings();
  }, [loadSections.length, loadSettings]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const saves = [];
      if (showSales) {
        saves.push(
          apiRequest(settingsPath("sales"), {
            method: "PATCH",
            body: salesApprovalsPayload(form),
          }),
        );
      }
      if (showInventory) {
        saves.push(
          apiRequest(settingsPath("inventory"), {
            method: "PATCH",
            body: inventoryApprovalsPayload(form),
          }),
        );
      }
      if (showProcurement) {
        saves.push(
          apiRequest(settingsPath("procurement"), {
            method: "PATCH",
            body: procurementApprovalsPayload(form),
          }),
        );
      }
      if (showHr) {
        saves.push(
          apiRequest(settingsPath("hr"), {
            method: "PATCH",
            body: hrApprovalsPayload(form),
          }),
        );
      }
      if (showAccounting) {
        saves.push(
          apiRequest(settingsPath("accounting"), {
            method: "PATCH",
            body: accountingApprovalsPayload(form),
          }),
        );
      }
      if (showNotifications) {
        saves.push(
          apiRequest(settingsPath("notifications"), {
            method: "PATCH",
            body: notificationsApprovalsPayload(form),
          }),
        );
      }

      await Promise.all(saves);
      await loadSettings();
      if (afterSave) await afterSave();
      setMessage("Manager approval settings saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save approval settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave}>
      <section className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 shadow-sm">
        <h2 className="theme-heading text-lg font-medium">Manager approvals</h2>
        <p className="theme-subtext mt-1 text-sm">
          Control when staff must request manager approval before discounts, cancellations, stock changes,
          purchases, payroll, and journal entries. Approvers are notified in the bell icon.
        </p>

        {loading ? (
          <p className="theme-subtext mt-4 text-sm">Loading…</p>
        ) : loadSections.length === 0 ? (
          <p className="theme-subtext mt-4 text-sm">No approval settings are available for this organization.</p>
        ) : (
          <div className="mt-5 space-y-4">
            {showSales ? (
              <SettingsSection title="Sales" description="POS and backoffice sales workflows.">
                <Toggle
                  label="Require manager approval for large discounts"
                  description="When a line or order discount exceeds the threshold, cashiers submit a request for manager approval."
                  checked={form.discount_approval_enabled}
                  onChange={(v) => setForm((f) => ({ ...f, discount_approval_enabled: v }))}
                />
                {form.discount_approval_enabled ? (
                  <Field label="Discount approval threshold (%)">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      className={`${inputClassName()} w-32`}
                      value={form.discount_approval_threshold_percent}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, discount_approval_threshold_percent: e.target.value }))
                      }
                    />
                  </Field>
                ) : null}
                <Toggle
                  label="Require manager approval for order cancellations"
                  description="Staff without sales manager access can request cancellation; approvers resolve it from notifications."
                  checked={form.order_cancellation_approval_enabled}
                  onChange={(v) => setForm((f) => ({ ...f, order_cancellation_approval_enabled: v }))}
                />
              </SettingsSection>
            ) : null}

            {showInventory ? (
              <SettingsSection title="Inventory" description="Stock adjustment controls.">
                <Toggle
                  label="Require manager approval for stock adjustments"
                  description="Staff without inventory manager access submit adjustments for approval."
                  checked={form.stock_adjustment_approval_enabled}
                  onChange={(v) => setForm((f) => ({ ...f, stock_adjustment_approval_enabled: v }))}
                />
              </SettingsSection>
            ) : null}

            {showProcurement ? (
              <SettingsSection title="Procurement" description="Supplier purchase orders.">
                <Toggle
                  label="Require LPO approval"
                  description="Purchase orders must be approved before sending to suppliers."
                  checked={form.require_lpo_approval}
                  onChange={(v) => setForm((f) => ({ ...f, require_lpo_approval: v }))}
                />
              </SettingsSection>
            ) : null}

            {showHr ? (
              <SettingsSection title="HR & Payroll" description="Payroll run controls.">
                <Toggle
                  label="Require payroll approval"
                  description="New payroll runs require approval before processing and payment."
                  checked={form.require_payroll_approval}
                  onChange={(v) => setForm((f) => ({ ...f, require_payroll_approval: v }))}
                />
              </SettingsSection>
            ) : null}

            {showAccounting ? (
              <SettingsSection title="Accounting" description="General ledger posting controls.">
                <Toggle
                  label="Require approval to post manual journal entries"
                  description="Users without accounting manager access must submit drafts for approval before posting."
                  checked={form.journal_entry_approval_enabled}
                  onChange={(v) => setForm((f) => ({ ...f, journal_entry_approval_enabled: v }))}
                />
              </SettingsSection>
            ) : null}

            {showNotifications ? (
              <SettingsSection
                title="Approval email alerts"
                description="Optional email copies when in-app approval notifications are created or resolved."
              >
                <ApprovalAlertsFields form={form} setForm={setForm} />
              </SettingsSection>
            ) : null}
          </div>
        )}

        <div className="mt-6">
          <PrimaryButton type="submit" disabled={loading || saving || loadSections.length === 0} showIcon={false}>
            {saving ? "Saving…" : "Save"}
          </PrimaryButton>
        </div>
      </section>
    </form>
  );
}
