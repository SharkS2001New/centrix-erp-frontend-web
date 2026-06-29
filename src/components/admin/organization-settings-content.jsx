"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import {
  EMPTY_SALES_ORGANIZATION_FORM,
  salesOrganizationFormFromApi,
  salesOrganizationPayloadFromForm,
} from "@/lib/sales-settings";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { FinanceSettingsPanel } from "@/components/admin/finance-settings-panel";
import { AiSettingsPanel } from "@/components/admin/ai-settings-panel";
import { InventorySettingsPanel } from "@/components/admin/inventory-settings-panel";
import { DistributionSettingsPanel } from "@/components/admin/distribution-settings-panel";
import { MobileApplicationSettingsPanel } from "@/components/admin/mobile-application-settings-panel";
import { GeneralSettingsPanel } from "@/components/admin/general-settings-panel";
import { NotificationsSettingsPanel } from "@/components/admin/notifications-settings-panel";
import { ProcurementSettingsPanel } from "@/components/admin/procurement-settings-panel";
import { PrintoutsSettingsPanel } from "@/components/admin/printouts-settings-panel";
import { HrSettingsPanel } from "@/components/admin/hr-settings-panel";
import { SecuritySettingsPanel } from "@/components/admin/security-settings-panel";
import { LegacyArchiveSettingsPanel } from "@/components/admin/legacy-archive-settings-panel";
import { visibleOrgSettingsTabs } from "@/lib/org-settings-tabs";
import { ORG_SETTINGS_PLATFORM_MESSAGE, TENANT_ORG_SETTINGS_SUBTITLE } from "@/lib/org-settings-access";
import { PlatformConfiguredSalesSummary } from "@/components/admin/platform-configured-summary";
import { isPlatformMpesaStkEnabled } from "@/lib/platform-org-features";
import { useSettingsApi } from "@/contexts/settings-api-context";
import { notifyError, toastErrorSetter, toastMessageSetter } from "@/lib/notify";
import {
  CatalogPageShell,
  Field,
  PrimaryButton,
  inputClassName,
} from "@/components/catalog/catalog-shared";

const TABS = [
  { id: "general", label: "General" },
  { id: "printouts", label: "Printouts" },
  { id: "sales", label: "Sales" },
  { id: "mobile", label: "Mobile application" },
  { id: "distribution", label: "Distribution" },
  { id: "inventory", label: "Inventory" },
  { id: "procurement", label: "Procurement" },
  { id: "finance", label: "Finance" },
  { id: "ai", label: "AI" },
  { id: "hr", label: "HR & Payroll" },
  { id: "notifications", label: "Notifications" },
  { id: "security", label: "Security" },
  { id: "legacy-archive", label: "Legacy archive" },
];

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

function PlaceholderPanel({ title, description }) {
  return (
    <section className="theme-panel rounded-xl border p-6 shadow-sm">
      <h2 className="text-lg font-medium text-slate-900">{title}</h2>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </section>
  );
}

export function OrganizationSettingsContent({
  capabilities,
  platformManaged = false,
  tenantSelfService = false,
  onAfterSave,
  breadcrumbItems,
  showShell = true,
  title = "Organization settings",
  subtitle = tenantSelfService
    ? TENANT_ORG_SETTINGS_SUBTITLE
    : "Platform configuration for module provisioning, workflows, integration gates, and legacy archive. Tenants manage day-to-day module preferences under Administration → Organization settings.",
}) {
  const { settingsPath } = useSettingsApi();
  const [tab, setTab] = useState(tenantSelfService ? "general" : "sales");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const setMessage = toastMessageSetter;
  const setError = toastErrorSetter;
  const [salesForm, setSalesForm] = useState(EMPTY_SALES_ORGANIZATION_FORM);

  const modules = capabilities?.modules ?? {};
  const hasPosSales = Boolean(modules["sales.pos"]);
  const hasCustomers = Boolean(modules.customers_suppliers);
  const mpesaPlatformEnabled = isPlatformMpesaStkEnabled(capabilities);

  const visibleTabs = useMemo(
    () => visibleOrgSettingsTabs(TABS, capabilities, { platformManaged, tenantSelfService }),
    [capabilities, platformManaged, tenantSelfService],
  );

  useEffect(() => {
    if (visibleTabs.length === 0) return;
    if (!visibleTabs.some((item) => item.id === tab)) {
      setTab(visibleTabs[0].id);
    }
  }, [visibleTabs, tab]);

  const loadSalesSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest(settingsPath("sales"));
      setSalesForm(salesOrganizationFormFromApi(res));
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [settingsPath]);

  useEffect(() => {
    if (!visibleTabs.some((item) => item.id === "sales")) return;
    loadSalesSettings();
  }, [loadSalesSettings, visibleTabs]);

  async function handleSaveSales(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest(settingsPath("sales"), {
        method: "PATCH",
        body: salesOrganizationPayloadFromForm(salesForm),
      });
      const res = await apiRequest(settingsPath("sales"));
      setSalesForm(salesOrganizationFormFromApi(res));
      if (onAfterSave) await onAfterSave();
      setMessage("Sales settings saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  const panelProps = {
    saving,
    setSaving,
    setError,
    setMessage,
    onAfterSave,
    capabilities,
  };

  const body = (
    <>
      {breadcrumbItems ? <AdminBreadcrumb items={breadcrumbItems} /> : null}

      {tenantSelfService ? (
        <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
          <p className="font-medium text-slate-900">Your organization preferences</p>
          <p className="mt-1 text-xs text-slate-600">
            Configure sales, inventory, finance, HR, and other module preferences for your company.{" "}
            {ORG_SETTINGS_PLATFORM_MESSAGE}
          </p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        {visibleTabs.length === 0 ? (
          <p className="col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-950">
            No organization settings are available for this company. Your platform administrator manages
            preferences because the Administration module is not enabled.
          </p>
        ) : (
          <>
        <nav className="theme-panel rounded-xl border p-2 shadow-sm">
          {visibleTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                tab === item.id
                  ? "bg-[#E6F1FB] font-medium text-[#185FA5]"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div>
          {tab === "general" ? <GeneralSettingsPanel {...panelProps} /> : null}

          {tab === "printouts" ? <PrintoutsSettingsPanel {...panelProps} /> : null}

          {tab === "sales" ? (
            <form onSubmit={handleSaveSales}>
              <section className="theme-panel rounded-xl border p-6 shadow-sm">
                <h2 className="text-lg font-medium text-slate-900">Sales settings</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Day-to-day POS and checkout preferences. Module access and order workflow are platform-controlled.
                </p>
                {loading ? (
                  <p className="mt-4 text-sm text-slate-500">Loading…</p>
                ) : (
                  <div className="mt-5 space-y-3">
                    <PlatformConfiguredSalesSummary capabilities={capabilities} />
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Checkout & pricing</p>
                    {hasCustomers ? (
                      <Toggle
                        label="Add route markup prices"
                        description="Applies route markup on backoffice create order (Sales → Create new order) by default. External POS cashiers only get route markup when enabled below."
                        checked={salesForm.add_route_markup_prices}
                        onChange={(v) =>
                          setSalesForm((f) => ({
                            ...f,
                            add_route_markup_prices: v,
                            backoffice_order_type_mode: v
                              ? f.backoffice_order_type_mode === "normal"
                                ? "toggle"
                                : f.backoffice_order_type_mode
                              : "normal",
                            pos_order_type_mode: v ? f.pos_order_type_mode : "normal",
                          }))
                        }
                      />
                    ) : null}
                    {salesForm.add_route_markup_prices ? (
                      <fieldset className="space-y-2 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-4 py-3">
                        <legend className="theme-heading px-1 text-sm font-medium">
                          Backoffice create order
                        </legend>
                        <p className="theme-subtext text-xs">
                          Sales → Create new order and distribution backoffice order entry. Route orders
                          appear in the Distribution workspace when a route is selected.
                        </p>
                        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                          <input
                            type="radio"
                            name="backoffice_order_type_mode"
                            className="mt-1"
                            value="normal"
                            checked={salesForm.backoffice_order_type_mode === "normal"}
                            onChange={() =>
                              setSalesForm((f) => ({ ...f, backoffice_order_type_mode: "normal" }))
                            }
                          />
                          <span>
                            <span className="font-medium">Normal orders only</span>
                            <span className="mt-0.5 block text-xs text-slate-500">
                              Shop/counter pricing only — no route markup on backoffice orders.
                            </span>
                          </span>
                        </label>
                        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                          <input
                            type="radio"
                            name="backoffice_order_type_mode"
                            className="mt-1"
                            value="route"
                            checked={salesForm.backoffice_order_type_mode === "route"}
                            onChange={() =>
                              setSalesForm((f) => ({ ...f, backoffice_order_type_mode: "route" }))
                            }
                          />
                          <span>
                            <span className="font-medium">Route orders only</span>
                            <span className="mt-0.5 block text-xs text-slate-500">
                              Staff always select a route. Markup applies on every backoffice order.
                            </span>
                          </span>
                        </label>
                        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                          <input
                            type="radio"
                            name="backoffice_order_type_mode"
                            className="mt-1"
                            value="toggle"
                            checked={salesForm.backoffice_order_type_mode === "toggle"}
                            onChange={() =>
                              setSalesForm((f) => ({ ...f, backoffice_order_type_mode: "toggle" }))
                            }
                          />
                          <span>
                            <span className="font-medium">Allow normal or route order toggle</span>
                            <span className="mt-0.5 block text-xs text-slate-500">
                              Staff choose normal shop sale or route order with markup per transaction.
                            </span>
                          </span>
                        </label>
                      </fieldset>
                    ) : null}
                    {hasPosSales && salesForm.add_route_markup_prices ? (
                      <fieldset className="space-y-2 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-4 py-3">
                        <legend className="theme-heading px-1 text-sm font-medium">
                          External POS cashier terminal
                        </legend>
                        <Toggle
                          label="Also enable route markup on external POS"
                          description="When off, the external POS workspace (/pos) sells at normal pricing only. Backoffice create order settings above still apply."
                          checked={salesForm.pos_order_type_mode !== "normal"}
                          onChange={(v) =>
                            setSalesForm((f) => ({
                              ...f,
                              pos_order_type_mode: v
                                ? f.pos_order_type_mode === "normal"
                                  ? "toggle"
                                  : f.pos_order_type_mode
                                : "normal",
                            }))
                          }
                        />
                        {salesForm.pos_order_type_mode !== "normal" ? (
                          <>
                            <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                              <input
                                type="radio"
                                name="pos_order_type_mode"
                                className="mt-1"
                                value="route"
                                checked={salesForm.pos_order_type_mode === "route"}
                                onChange={() =>
                                  setSalesForm((f) => ({ ...f, pos_order_type_mode: "route" }))
                                }
                              />
                              <span>
                                <span className="font-medium">Route orders only</span>
                                <span className="mt-0.5 block text-xs text-slate-500">
                                  Cashiers always select a route on the external POS terminal.
                                </span>
                              </span>
                            </label>
                            <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                              <input
                                type="radio"
                                name="pos_order_type_mode"
                                className="mt-1"
                                value="toggle"
                                checked={salesForm.pos_order_type_mode === "toggle"}
                                onChange={() =>
                                  setSalesForm((f) => ({ ...f, pos_order_type_mode: "toggle" }))
                                }
                              />
                              <span>
                                <span className="font-medium">Allow normal or route order toggle</span>
                                <span className="mt-0.5 block text-xs text-slate-500">
                                  Cashier chooses normal shop sale or route order with markup per sale.
                                </span>
                              </span>
                            </label>
                          </>
                        ) : null}
                      </fieldset>
                    ) : null}
                    <Toggle
                      label="Allow product discounts"
                      description="Applies product discount rules on POS lines automatically. The discount field is read-only unless manual entry is enabled below."
                      checked={salesForm.allow_discounts}
                      onChange={(v) =>
                        setSalesForm((f) => ({
                          ...f,
                          allow_discounts: v,
                          allow_edit_line_discount: v ? f.allow_edit_line_discount : false,
                        }))
                      }
                    />
                    {hasPosSales ? (
                      <Toggle
                        label="Allow manual line discount at POS"
                        description="Lets cashiers type a discount when adding a line instead of relying only on product discount settings."
                        checked={salesForm.allow_edit_line_discount}
                        disabled={!salesForm.allow_discounts}
                        onChange={(v) => setSalesForm((f) => ({ ...f, allow_edit_line_discount: v }))}
                      />
                    ) : null}
                    <Toggle
                      label="Enable full order discount"
                      description="Shows a discount field on the cart total so cashiers can reduce the whole order before checkout."
                      checked={salesForm.enable_order_discount}
                      onChange={(v) => setSalesForm((f) => ({ ...f, enable_order_discount: v }))}
                    />
                    <Toggle
                      label="Enable vouchers"
                      description="Allows payment vouchers at POS and voucher management. Create payment vouchers under Sales → Vouchers."
                      checked={salesForm.enable_vouchers}
                      onChange={(v) => setSalesForm((f) => ({ ...f, enable_vouchers: v }))}
                    />
                    <Toggle
                      label="Enable redeemable points"
                      description="Registered customers with a loyalty card earn points on completed orders and can redeem by mobile at POS."
                      checked={salesForm.enable_redeemable_points}
                      onChange={(v) => setSalesForm((f) => ({ ...f, enable_redeemable_points: v }))}
                    />
                    <Field label="KES spent per point earned">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        disabled={!salesForm.enable_redeemable_points}
                        className={`${inputClassName()} w-32`}
                        value={salesForm.points_earn_per_kes}
                        onChange={(e) =>
                          setSalesForm((f) => ({ ...f, points_earn_per_kes: e.target.value }))
                        }
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        e.g. 1000 means a 5,000 KES order earns 5 points.
                      </p>
                    </Field>
                    <Field label="KES value per point when redeeming">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        disabled={!salesForm.enable_redeemable_points}
                        className={`${inputClassName()} w-32`}
                        value={salesForm.point_cash_value}
                        onChange={(e) =>
                          setSalesForm((f) => ({ ...f, point_cash_value: e.target.value }))
                        }
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        How much each point is worth as payment at checkout.
                      </p>
                    </Field>
                    <Toggle
                      label="Editable unit price on create order"
                      description="Backoffice create order (Sales → Create new order). When off, unit price is fixed and Enter on quantity adds the line to the cart."
                      checked={salesForm.allow_edit_unit_price}
                      onChange={(v) =>
                        setSalesForm((f) => ({
                          ...f,
                          allow_edit_unit_price: v,
                          allow_pos_edit_unit_price: v ? f.allow_pos_edit_unit_price : false,
                        }))
                      }
                    />
                    {hasPosSales && salesForm.allow_edit_unit_price ? (
                      <Toggle
                        label="Also allow editable unit price on external POS"
                        description="When off, external POS cashiers use catalogue prices only. Backoffice create order setting above still applies."
                        checked={salesForm.allow_pos_edit_unit_price}
                        onChange={(v) =>
                          setSalesForm((f) => ({ ...f, allow_pos_edit_unit_price: v }))
                        }
                      />
                    ) : null}
                    <Field label="Default tax rate (%)">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        className={`${inputClassName()} w-32`}
                        value={salesForm.default_tax_rate}
                        onChange={(e) =>
                          setSalesForm((f) => ({ ...f, default_tax_rate: e.target.value }))
                        }
                      />
                    </Field>

                    {hasPosSales ? (
                      <>
                    <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Payment fields (POS checkout)
                    </p>
                    <Toggle
                      label="Request customer name on checkout"
                      description="When enabled, POS prompts for a customer on save order, hold order, and checkout (skipped for credit sales with a selected customer). When off, orders save immediately with no name prompt."
                      checked={salesForm.enable_checkout_customer_name}
                      onChange={(v) =>
                        setSalesForm((f) => ({ ...f, enable_checkout_customer_name: v }))
                      }
                    />
                    <Toggle
                      label="Allow pay-now on credit"
                      description="Allows partial payment across cash, M-Pesa, banks, and other methods. Turning this on disables credit payment."
                      checked={salesForm.allow_credit_pay_now}
                      onChange={(v) =>
                        setSalesForm((f) => ({
                          ...f,
                          allow_credit_pay_now: v,
                          enable_credit_payment: v ? false : f.enable_credit_payment,
                        }))
                      }
                    />
                    <Toggle
                      label="Enable credit payment"
                      description="Shows the credit customer field after payment methods for accounts receivable. Turning this on disables pay-now on credit."
                      checked={salesForm.enable_credit_payment}
                      onChange={(v) =>
                        setSalesForm((f) => ({
                          ...f,
                          enable_credit_payment: v,
                          allow_credit_pay_now: v ? false : f.allow_credit_pay_now,
                        }))
                      }
                    />
                    <Toggle
                      label="Payment date field"
                      description="When off, checkout uses today's date automatically."
                      checked={salesForm.enable_payment_date}
                      onChange={(v) => setSalesForm((f) => ({ ...f, enable_payment_date: v }))}
                    />
                    {mpesaPlatformEnabled ? (
                      <>
                    <Toggle
                      label="M-Pesa amount field"
                      checked={salesForm.enable_mpesa_amount}
                      onChange={(v) => setSalesForm((f) => ({ ...f, enable_mpesa_amount: v }))}
                    />
                    <Toggle
                      label="M-Pesa code field"
                      description="Transaction code; required when an M-Pesa amount is entered."
                      checked={salesForm.enable_mpesa_code}
                      onChange={(v) => setSalesForm((f) => ({ ...f, enable_mpesa_code: v }))}
                    />
                      </>
                    ) : null}
                    <Toggle
                      label="Bank type dropdown"
                      description="Use a bank select list with amount and reference fields instead of separate bank amount inputs."
                      checked={salesForm.enable_bank_select}
                      onChange={(v) => setSalesForm((f) => ({ ...f, enable_bank_select: v }))}
                    />
                    <Toggle
                      label={salesForm.enable_bank_select ? "Equity Bank (in dropdown)" : "Equity Bank amount"}
                      description={
                        salesForm.enable_bank_select
                          ? "Include Equity Bank in the bank dropdown."
                          : "Separate Equity amount field on checkout."
                      }
                      checked={salesForm.enable_equity_bank}
                      onChange={(v) => setSalesForm((f) => ({ ...f, enable_equity_bank: v }))}
                    />
                    <Toggle
                      label={salesForm.enable_bank_select ? "KCB (in dropdown)" : "KCB amount"}
                      description={
                        salesForm.enable_bank_select
                          ? "Include KCB in the bank dropdown."
                          : "Separate KCB amount field on checkout."
                      }
                      checked={salesForm.enable_kcb_bank}
                      onChange={(v) => setSalesForm((f) => ({ ...f, enable_kcb_bank: v }))}
                    />
                    <Toggle
                      label={
                        salesForm.enable_bank_select ? "Other bank (in dropdown)" : "Other bank amount"
                      }
                      description={
                        salesForm.enable_bank_select
                          ? "Include a configurable third bank in the dropdown."
                          : "Separate other-bank amount field on checkout."
                      }
                      checked={salesForm.enable_other_bank}
                      onChange={(v) => setSalesForm((f) => ({ ...f, enable_other_bank: v }))}
                    />
                    {salesForm.enable_other_bank ? (
                      <Field label="Other bank name">
                        <input
                          type="text"
                          className={inputClassName()}
                          value={salesForm.other_bank_name}
                          onChange={(e) =>
                            setSalesForm((f) => ({ ...f, other_bank_name: e.target.value }))
                          }
                          placeholder="e.g. Co-operative Bank"
                        />
                      </Field>
                    ) : null}
                    <Toggle
                      label="Bank amount field"
                      description="Bank type, amount, and reference number on checkout (dropdown mode only)."
                      checked={salesForm.enable_bank_amount}
                      disabled={!salesForm.enable_bank_select}
                      onChange={(v) => setSalesForm((f) => ({ ...f, enable_bank_amount: v }))}
                    />
                    <Toggle
                      label="Cheque amount field"
                      checked={salesForm.enable_cheque}
                      onChange={(v) => setSalesForm((f) => ({ ...f, enable_cheque: v }))}
                    />
                    <Toggle
                      label="Cheque number field"
                      description="Required when a cheque amount is entered."
                      checked={salesForm.enable_cheque_number}
                      disabled={!salesForm.enable_cheque}
                      onChange={(v) => setSalesForm((f) => ({ ...f, enable_cheque_number: v }))}
                    />
                      </>
                    ) : null}
                  </div>
                )}
                {hasPosSales ? (
                <div className="mt-4 space-y-3">
                  <Toggle
                    label="Require till float on backoffice create order"
                    description="When on, staff using Sales → Create order must open a till session and declare operating float before checkout — same X/Z cash reconciliation as external POS. When off (default), backoffice orders never require a till session."
                    checked={salesForm.require_backoffice_till_float}
                    onChange={(v) => setSalesForm((f) => ({ ...f, require_backoffice_till_float: v }))}
                  />
                  <Toggle
                    label="Blind till close"
                    description="When on, cashiers count cash without seeing expected cash or variance during close. Variance appears on the Z report after closing."
                    checked={salesForm.blind_till_close}
                    onChange={(v) => setSalesForm((f) => ({ ...f, blind_till_close: v }))}
                  />
                </div>
                ) : null}
                <div className="mt-6">
                  <PrimaryButton type="submit" disabled={loading || saving} showIcon={false}>
                    {saving ? "Saving…" : "Save"}
                  </PrimaryButton>
                </div>
              </section>
            </form>
          ) : null}

          {tab === "mobile" ? <MobileApplicationSettingsPanel {...panelProps} /> : null}
          {tab === "distribution" ? <DistributionSettingsPanel {...panelProps} /> : null}
          {tab === "inventory" ? <InventorySettingsPanel {...panelProps} /> : null}
          {tab === "procurement" ? <ProcurementSettingsPanel {...panelProps} /> : null}
          {tab === "finance" ? <FinanceSettingsPanel {...panelProps} /> : null}
          {tab === "ai" ? <AiSettingsPanel {...panelProps} /> : null}
          {tab === "hr" ? <HrSettingsPanel {...panelProps} /> : null}
          {tab === "notifications" ? <NotificationsSettingsPanel {...panelProps} /> : null}
          {tab === "security" ? <SecuritySettingsPanel {...panelProps} /> : null}
          {tab === "legacy-archive" ? <LegacyArchiveSettingsPanel {...panelProps} /> : null}
        </div>
          </>
        )}
      </div>
    </>
  );

  if (!showShell) {
    return body;
  }

  return (
    <CatalogPageShell title={title} subtitle={subtitle}>
      {body}
    </CatalogPageShell>
  );
}
