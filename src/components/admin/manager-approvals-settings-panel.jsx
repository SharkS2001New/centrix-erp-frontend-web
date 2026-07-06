"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { ApprovalAlertsFields } from "@/components/admin/approval-alerts-fields";
import { useSettingsApi } from "@/contexts/settings-api-context";
import {
  accountingManagerApprovalsPayload,
  hrManagerApprovalsPayload,
  inventoryManagerApprovalsPayload,
  managerApprovalsEmailPayload,
  managerApprovalsFormFromApiResponses,
  managerApprovalsNotificationsPayload,
  procurementManagerApprovalsPayload,
  salesManagerApprovalsPayload,
  visibleApprovalRequestEvents,
} from "@/lib/manager-approvals-settings";

function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 py-3 ${
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

function InfoEvent({ label, description }) {
  return (
    <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 py-3">
      <p className="theme-heading text-sm font-medium">{label}</p>
      <p className="theme-subtext mt-0.5 text-xs">{description}</p>
    </div>
  );
}

export function ManagerApprovalsSettingsPanel({
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
  const afterSave = onAfterSave ?? (() => refreshCapabilities({ force: true }));
  const [form, setForm] = useState(managerApprovalsFormFromApiResponses({}));
  const [loading, setLoading] = useState(true);

  const modules = capabilities?.modules ?? {};
  const showSales = Boolean(modules.sales);
  const showInventory = Boolean(modules.inventory);
  const showProcurement = Boolean(modules.customers_suppliers);
  const showHr = Boolean(modules.hr_payroll);
  const showAccounting = Boolean(modules.accounting);
  const showEmail = Boolean(modules.admin);
  const approvalRequestEvents = useMemo(() => visibleApprovalRequestEvents(capabilities), [capabilities]);

  const loadSections = useMemo(() => {
    const sections = [];
    if (showSales) sections.push("sales");
    if (showInventory) sections.push("inventory");
    if (showProcurement) sections.push("procurement");
    if (showHr) sections.push("hr");
    if (showAccounting) sections.push("accounting");
    if (showEmail) sections.push("notifications");
    return sections;
  }, [showSales, showInventory, showProcurement, showHr, showAccounting, showEmail]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const entries = await Promise.all(
        loadSections.map(async (section) => {
          const res =
            section === "accounting"
              ? await apiRequest("/accounting/settings")
              : await apiRequest(settingsPath(section));
          return [section, res];
        }),
      );
      setForm(managerApprovalsFormFromApiResponses(Object.fromEntries(entries)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load manager approval settings");
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
          apiRequest(settingsPath("sales"), { method: "PATCH", body: salesManagerApprovalsPayload(form) }),
        );
      }
      if (showInventory) {
        saves.push(
          apiRequest(settingsPath("inventory"), {
            method: "PATCH",
            body: inventoryManagerApprovalsPayload(form),
          }),
        );
      }
      if (showProcurement) {
        saves.push(
          apiRequest(settingsPath("procurement"), {
            method: "PATCH",
            body: procurementManagerApprovalsPayload(form),
          }),
        );
      }
      if (showHr) {
        saves.push(apiRequest(settingsPath("hr"), { method: "PATCH", body: hrManagerApprovalsPayload(form) }));
      }
      if (showAccounting) {
        saves.push(
          apiRequest("/accounting/settings", {
            method: "PATCH",
            body: accountingManagerApprovalsPayload(form),
          }),
        );
      }
      if (showEmail) {
        saves.push(
          apiRequest(settingsPath("notifications"), {
            method: "PATCH",
            body: managerApprovalsNotificationsPayload(form),
          }),
        );
      }

      await Promise.all(saves);
      await loadSettings();
      if (afterSave) await afterSave();
      setMessage("Manager approval settings saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save manager approval settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave}>
      <section className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 shadow-sm">
        <h2 className="theme-heading text-lg font-medium">Manager approvals</h2>
        <p className="theme-subtext mt-1 text-sm">
          Internal system notifications for managers — supplier returns, customer returns, discount requests,
          cancellations, stock adjustments, LPOs, payroll, and journal entries. Configure the in-app bell
          under Notifications → In-app alerts; optional email copies below.
        </p>

        {loading ? (
          <p className="theme-subtext mt-4 text-sm">Loading…</p>
        ) : (
          <div className="mt-5 space-y-6">
            {approvalRequestEvents.length ? (
              <div className="space-y-3">
                <div>
                  <h3 className="theme-heading text-sm font-semibold">Approval bell alerts</h3>
                  <p className="theme-subtext mt-1 text-xs">
                    Control whether managers and requesters receive in-app notifications for approval
                    workflows. More staff alerts (trips, inventory, accounting) are under Notifications →
                    In-app alerts.
                  </p>
                </div>
                <Toggle
                  label="Notify approvers on new requests"
                  description="Supplier returns, customer returns, leave, and other submitted approval requests."
                  checked={form.in_app_notify_on_approval_request}
                  onChange={(v) => setForm((f) => ({ ...f, in_app_notify_on_approval_request: v }))}
                />
                <Toggle
                  label="Notify requester on outcome"
                  description="When a manager approves or rejects a pending request."
                  checked={form.in_app_notify_on_approval_outcome}
                  onChange={(v) => setForm((f) => ({ ...f, in_app_notify_on_approval_outcome: v }))}
                />
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Includes</p>
                  {approvalRequestEvents.map((event) => (
                    <InfoEvent key={event.id} label={event.label} description={event.description} />
                  ))}
                </div>
              </div>
            ) : null}

            {(showSales || showInventory || showProcurement || showHr || showAccounting) ? (
              <div className="space-y-3">
                <div>
                  <h3 className="theme-heading text-sm font-semibold">Optional approval workflows</h3>
                  <p className="theme-subtext mt-1 text-xs">
                    When enabled, staff must request manager approval. Managers receive an in-app notification
                    when approval bell alerts are on (and email if configured below).
                  </p>
                </div>

                {showSales ? (
                  <div className="space-y-3 rounded-xl border border-[var(--theme-border)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sales</p>
                    <Toggle
                      label="Discount approval for staff"
                      description="When enabled, all staff can enter line and order discounts on backoffice and mobile sales. Non-approvers submit discounts for manager review — orders save under Pending approval, then Booked when approved or Editable when rejected. When disabled, normal discount settings apply with no approval step."
                      checked={form.discount_approval_enabled}
                      onChange={(v) => setForm((f) => ({ ...f, discount_approval_enabled: v }))}
                    />
                    {form.discount_approval_enabled ? (
                      <Field label="Reference threshold (%) — legacy">
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
                        <p className="mt-1 text-xs text-slate-500">
                          Reserved for reporting; staff discounts always require approval when this setting is on.
                        </p>
                      </Field>
                    ) : null}
                    <Toggle
                      label="Order cancellation approval"
                      description="Non-managers request cancellation; approvers resolve from notifications."
                      checked={form.order_cancellation_approval_enabled}
                      onChange={(v) => setForm((f) => ({ ...f, order_cancellation_approval_enabled: v }))}
                    />
                  </div>
                ) : null}

                {showInventory ? (
                  <div className="space-y-3 rounded-xl border border-[var(--theme-border)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Inventory</p>
                    <Toggle
                      label="Stock adjustment approval"
                      description="Stock adjustments by non-managers require approval before posting."
                      checked={form.stock_adjustment_approval_enabled}
                      onChange={(v) => setForm((f) => ({ ...f, stock_adjustment_approval_enabled: v }))}
                    />
                    <Toggle
                      label="Stock transfer approval"
                      description="Shop ↔ store and other transfers (except store to shop restock) require manager approval for non-managers."
                      checked={form.stock_transfer_approval_enabled}
                      onChange={(v) => setForm((f) => ({ ...f, stock_transfer_approval_enabled: v }))}
                    />
                    <Toggle
                      label="Damage / write-off approval"
                      description="Write-offs and damage records by non-managers require approval before stock is deducted."
                      checked={form.damage_write_off_approval_enabled}
                      onChange={(v) => setForm((f) => ({ ...f, damage_write_off_approval_enabled: v }))}
                    />
                  </div>
                ) : null}

                {showProcurement ? (
                  <div className="space-y-3 rounded-xl border border-[var(--theme-border)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Procurement</p>
                    <Toggle
                      label="LPO approval"
                      description="Purchase orders must be approved before sending to suppliers."
                      checked={form.require_lpo_approval}
                      onChange={(v) => setForm((f) => ({ ...f, require_lpo_approval: v }))}
                    />
                  </div>
                ) : null}

                {showHr ? (
                  <div className="space-y-3 rounded-xl border border-[var(--theme-border)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">HR & Payroll</p>
                    <Toggle
                      label="Payroll run approval"
                      description="New payroll runs require approval before processing and payment."
                      checked={form.require_payroll_approval}
                      onChange={(v) => setForm((f) => ({ ...f, require_payroll_approval: v }))}
                    />
                  </div>
                ) : null}

                {showAccounting ? (
                  <div className="space-y-3 rounded-xl border border-[var(--theme-border)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Accounting</p>
                    <Toggle
                      label="Manual journal entry approval"
                      description="Non-managers submit journal drafts for approval before posting."
                      checked={form.journal_entry_approval_enabled}
                      onChange={(v) => setForm((f) => ({ ...f, journal_entry_approval_enabled: v }))}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {showEmail ? (
              <div className="space-y-3">
                <div>
                  <h3 className="theme-heading text-sm font-semibold">Email copies</h3>
                  <p className="theme-subtext mt-1 text-xs">
                    Optional email alerts alongside the in-app bell. Configure SMTP under Notifications →
                    Email setup.
                  </p>
                </div>
                <ApprovalAlertsFields form={form} setForm={setForm} />
              </div>
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
