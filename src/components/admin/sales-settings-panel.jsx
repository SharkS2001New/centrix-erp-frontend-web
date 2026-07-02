"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import {
  EMPTY_SALES_ORGANIZATION_FORM,
  salesOrganizationFormFromApi,
  salesOrganizationPayloadFromForm,
  sanitizeSalesOrganizationFormForModules,
} from "@/lib/sales-settings";
import { PlatformConfiguredSalesSummary } from "@/components/admin/platform-configured-summary";
import { OrdersListDefaultsFields } from "@/components/admin/orders-list-defaults-fields";
import { SettingsSubTabBar, useSettingsSubTab } from "@/components/admin/settings-sub-tabs";
import {
  isPlatformCheckoutOnCreateEnabled,
  isPlatformMpesaStkEnabled,
} from "@/lib/platform-org-features";
import { useSettingsApi } from "@/contexts/settings-api-context";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";

const SALES_SETTINGS_TABS = [
  { id: "checkout", label: "Prices & discounts" },
  { id: "payment", label: "Recording payments" },
  { id: "pos", label: "Tills & checkout" },
];

function SalesSettingsTabBar({ tabs, activeTab, onTabChange }) {
  return (
    <SettingsSubTabBar
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={onTabChange}
      ariaLabel="Sales settings"
    />
  );
}

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

function CheckoutPricingTab({
  salesForm,
  setSalesForm,
  hasCustomers,
  hasPosSales,
}) {
  return (
    <div className="space-y-3">
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
          <legend className="theme-heading px-1 text-sm font-medium">Backoffice create order</legend>
          <p className="theme-subtext text-xs">
            Sales → Create new order and distribution backoffice order entry. Route orders appear in the
            Distribution workspace when a route is selected.
          </p>
          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
            <input
              type="radio"
              name="backoffice_order_type_mode"
              className="mt-1"
              value="normal"
              checked={salesForm.backoffice_order_type_mode === "normal"}
              onChange={() => setSalesForm((f) => ({ ...f, backoffice_order_type_mode: "normal" }))}
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
              onChange={() => setSalesForm((f) => ({ ...f, backoffice_order_type_mode: "route" }))}
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
              onChange={() => setSalesForm((f) => ({ ...f, backoffice_order_type_mode: "toggle" }))}
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
          <legend className="theme-heading px-1 text-sm font-medium">External POS cashier terminal</legend>
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
                  onChange={() => setSalesForm((f) => ({ ...f, pos_order_type_mode: "route" }))}
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
                  onChange={() => setSalesForm((f) => ({ ...f, pos_order_type_mode: "toggle" }))}
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
        label="Require manager approval for large discounts"
        description="When a line or order discount exceeds the threshold below, cashiers must submit a request. Managers with sales approval permission are notified in the bell icon."
        checked={salesForm.discount_approval_enabled}
        onChange={(v) => setSalesForm((f) => ({ ...f, discount_approval_enabled: v }))}
      />
      {salesForm.discount_approval_enabled ? (
        <Field label="Discount approval threshold (%)">
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            className={inputClassName}
            value={salesForm.discount_approval_threshold_percent}
            onChange={(e) =>
              setSalesForm((f) => ({ ...f, discount_approval_threshold_percent: e.target.value }))
            }
          />
        </Field>
      ) : null}
      <Toggle
        label="Require manager approval for order cancellations"
        description="Staff without sales manager access can request cancellation; approvers resolve it from notifications."
        checked={salesForm.order_cancellation_approval_enabled}
        onChange={(v) => setSalesForm((f) => ({ ...f, order_cancellation_approval_enabled: v }))}
      />
      <Toggle
        label="Enable vouchers"
        description="Allows payment vouchers at POS and voucher management. Create payment vouchers under Sales → Vouchers."
        checked={salesForm.enable_vouchers}
        onChange={(v) => setSalesForm((f) => ({ ...f, enable_vouchers: v }))}
      />
      {hasCustomers ? (
        <Toggle
          label="Enable redeemable points"
          description="Registered customers with a loyalty card earn points on completed orders and can redeem by mobile at POS."
          checked={salesForm.enable_redeemable_points}
          onChange={(v) => setSalesForm((f) => ({ ...f, enable_redeemable_points: v }))}
        />
      ) : null}
      {hasCustomers && salesForm.enable_redeemable_points ? (
        <>
          <Field label="KES spent per point earned">
            <input
              type="number"
              min="0"
              step="any"
              className={`${inputClassName()} w-32`}
              value={salesForm.points_earn_per_kes}
              onChange={(e) => setSalesForm((f) => ({ ...f, points_earn_per_kes: e.target.value }))}
            />
            <p className="mt-1 text-xs text-slate-500">e.g. 1000 means a 5,000 KES order earns 5 points.</p>
          </Field>
          <Field label="KES value per point when redeeming">
            <input
              type="number"
              min="0"
              step="any"
              className={`${inputClassName()} w-32`}
              value={salesForm.point_cash_value}
              onChange={(e) => setSalesForm((f) => ({ ...f, point_cash_value: e.target.value }))}
            />
            <p className="mt-1 text-xs text-slate-500">How much each point is worth as payment at checkout.</p>
          </Field>
        </>
      ) : null}
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
          onChange={(v) => setSalesForm((f) => ({ ...f, allow_pos_edit_unit_price: v }))}
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
          onChange={(e) => setSalesForm((f) => ({ ...f, default_tax_rate: e.target.value }))}
        />
      </Field>
    </div>
  );
}

function PaymentFieldsTab({
  salesForm,
  setSalesForm,
  hasPosSales,
  hasCustomers,
  mpesaPlatformEnabled,
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Used when recording payment on a saved order (Sales → Orders → Make payment).
        {hasPosSales ? " External POS checkout also uses these payment method fields." : ""}
      </p>
      {!salesForm.enable_credit_payment || !hasPosSales ? (
        <Toggle
          label="Allow split payment on saved orders"
          description="Payment can be full or partial and split across cash, M-Pesa, banks, and other methods. Turn off to require full payment in one go. Cannot be used with POS credit customer checkout."
          checked={salesForm.allow_credit_pay_now}
          onChange={(v) =>
            setSalesForm((f) => ({
              ...f,
              allow_credit_pay_now: v,
              enable_credit_payment: v ? false : f.enable_credit_payment,
            }))
          }
        />
      ) : (
        <p className="text-xs text-amber-700">
          Split payment on saved orders is unavailable while POS credit customer checkout is enabled.
          Disable credit customer on the Tills & checkout tab to use split payment here.
        </p>
      )}
      <Toggle
        label="Payment date field"
        description="When off, payment uses today's date automatically."
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
            : "Separate Equity amount field when recording payment."
        }
        checked={salesForm.enable_equity_bank}
        onChange={(v) => setSalesForm((f) => ({ ...f, enable_equity_bank: v }))}
      />
      <Toggle
        label={salesForm.enable_bank_select ? "KCB (in dropdown)" : "KCB amount"}
        description={
          salesForm.enable_bank_select
            ? "Include KCB in the bank dropdown."
            : "Separate KCB amount field when recording payment."
        }
        checked={salesForm.enable_kcb_bank}
        onChange={(v) => setSalesForm((f) => ({ ...f, enable_kcb_bank: v }))}
      />
      <Toggle
        label={salesForm.enable_bank_select ? "Other bank (in dropdown)" : "Other bank amount"}
        description={
          salesForm.enable_bank_select
            ? "Include a configurable third bank in the dropdown."
            : "Separate other-bank amount field when recording payment."
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
            onChange={(e) => setSalesForm((f) => ({ ...f, other_bank_name: e.target.value }))}
            placeholder="e.g. Co-operative Bank"
          />
        </Field>
      ) : null}
      <Toggle
        label="Bank amount field"
        description="Bank type, amount, and reference number (dropdown mode only)."
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
      {hasPosSales && !hasCustomers ? (
        <p className="text-xs text-slate-500">
          Enable the Customers module to configure POS credit customer checkout.
        </p>
      ) : null}
    </div>
  );
}

function TillsCheckoutSettingsTab({
  salesForm,
  setSalesForm,
  hasCustomers,
  hasPosSales,
  posCheckoutEnabled,
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="theme-heading text-sm font-medium">Cash tills</h3>
        <Toggle
          label="Require till float on backoffice create order"
          description="When on, staff using Sales → Create order must open a till session and declare operating float before checkout — same X/Z cash reconciliation as external POS. When off (default), backoffice orders never require a till session."
          checked={salesForm.require_backoffice_till_float}
          onChange={(v) => setSalesForm((f) => ({ ...f, require_backoffice_till_float: v }))}
        />
        {hasPosSales ? (
          <Toggle
            label="Hide expected cash at till close"
            description="When a till session is closed, staff enter the cash they counted without seeing the system's expected drawer balance or any over/short while counting. After close, variance appears on the Z report (and in session history)."
            checked={salesForm.blind_till_close}
            onChange={(v) => setSalesForm((f) => ({ ...f, blind_till_close: v }))}
          />
        ) : (
          <p className="theme-subtext text-xs">
            Hide expected cash at till close applies when closing external POS till sessions. Enable the POS
            sales module to configure it.
          </p>
        )}
      </div>

      {hasPosSales ? (
        <div className="space-y-3">
          <h3 className="theme-heading text-sm font-medium">Checkout</h3>
          {!posCheckoutEnabled ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Your platform administrator has configured external POS for <strong>save order</strong> (no
              checkout on create). These checkout options apply only when checkout-on-create is enabled for
              external POS.
            </p>
          ) : (
            <>
              <p className="theme-subtext text-xs">
                Applies at external POS checkout (/pos) when checkout-on-create is enabled. Save-then-pay on
                backoffice and distribution orders use the Recording payments tab instead.
              </p>
              <Toggle
                label="Enable barcode scanner"
                description="Scan SKU/barcode to add qty 1 directly to the cart on POS."
                checked={salesForm.enable_barcode_scanner}
                onChange={(v) => setSalesForm((f) => ({ ...f, enable_barcode_scanner: v }))}
              />
              <Toggle
                label="Request customer name on checkout"
                description="When enabled, POS prompts for a customer on save order, hold order, and checkout (skipped for credit sales with a selected customer). When off, orders save immediately with no name prompt."
                checked={salesForm.enable_checkout_customer_name}
                onChange={(v) => setSalesForm((f) => ({ ...f, enable_checkout_customer_name: v }))}
              />
              {!hasCustomers ? (
                <p className="theme-subtext text-xs">
                  Enable the Customers module to show a credit customer search field at POS checkout.
                </p>
              ) : !salesForm.allow_credit_pay_now ? (
                <Toggle
                  label="Credit customer field at POS checkout"
                  description="Shows a searchable credit customer field at checkout. Unpaid balance posts to the customer's account. Cash, M-Pesa, and bank lines must be entered in full — not split-partial mode. Cannot be used with split payment on saved orders."
                  checked={salesForm.enable_credit_payment}
                  onChange={(v) =>
                    setSalesForm((f) => ({
                      ...f,
                      enable_credit_payment: v,
                      allow_credit_pay_now: v ? false : f.allow_credit_pay_now,
                    }))
                  }
                />
              ) : (
                <p className="text-xs text-amber-700">
                  Credit customer at POS checkout is unavailable while split payment on saved orders is enabled.
                  Turn off split payment on the Recording payments tab to configure POS credit checkout.
                </p>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function SalesSettingsPanel({
  capabilities,
  saving,
  setSaving,
  setError,
  setMessage,
  onAfterSave,
  platformManaged = false,
}) {
  const { settingsPath } = useSettingsApi();
  const [salesForm, setSalesForm] = useState(EMPTY_SALES_ORGANIZATION_FORM);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("checkout");

  const modules = capabilities?.modules ?? {};
  const hasPosSales = Boolean(modules["sales.pos"]);
  const hasCustomers = Boolean(modules.customers_suppliers);
  const posCheckoutEnabled = isPlatformCheckoutOnCreateEnabled(capabilities);
  const mpesaPlatformEnabled = isPlatformMpesaStkEnabled(capabilities);

  const visibleTabs = useMemo(
    () => SALES_SETTINGS_TABS.filter((tab) => !tab.requiresPosSales || hasPosSales),
    [hasPosSales],
  );

  useSettingsSubTab(activeTab, setActiveTab, visibleTabs);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest(settingsPath("sales"));
      setSalesForm(
        sanitizeSalesOrganizationFormForModules(salesOrganizationFormFromApi(res), capabilities),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [capabilities, setError, settingsPath]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest(settingsPath("sales"), {
        method: "PATCH",
        body: salesOrganizationPayloadFromForm(salesForm, capabilities),
      });
      const res = await apiRequest(settingsPath("sales"));
      setSalesForm(
        sanitizeSalesOrganizationFormForModules(salesOrganizationFormFromApi(res), capabilities),
      );
      if (onAfterSave) await onAfterSave();
      setMessage("Sales settings saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave}>
      <section className="theme-panel rounded-xl border p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Sales settings</h2>
        <p className="mt-1 text-sm text-slate-500">
          Day-to-day pricing, payment recording, and checkout/till preferences for backoffice create order and
          external POS. Module access and order workflow are platform-controlled.
        </p>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="mt-5 space-y-5">
            <PlatformConfiguredSalesSummary capabilities={capabilities} />
            {platformManaged ? (
              <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-semibold text-slate-900">Orders list defaults</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Platform-only: initial date range and sort when staff open Sales → Orders and workflow
                  queues.
                </p>
                <div className="mt-4">
                  <OrdersListDefaultsFields
                    value={salesForm}
                    onChange={setSalesForm}
                    idPrefix="settings-orders-list"
                  />
                </div>
              </section>
            ) : null}
            <SalesSettingsTabBar tabs={visibleTabs} activeTab={activeTab} onTabChange={setActiveTab} />

            {activeTab === "checkout" ? (
              <CheckoutPricingTab
                salesForm={salesForm}
                setSalesForm={setSalesForm}
                hasCustomers={hasCustomers}
                hasPosSales={hasPosSales}
              />
            ) : null}

            {activeTab === "payment" ? (
              <PaymentFieldsTab
                salesForm={salesForm}
                setSalesForm={setSalesForm}
                hasPosSales={hasPosSales}
                hasCustomers={hasCustomers}
                mpesaPlatformEnabled={mpesaPlatformEnabled}
              />
            ) : null}

            {activeTab === "pos" ? (
              <TillsCheckoutSettingsTab
                salesForm={salesForm}
                setSalesForm={setSalesForm}
                hasCustomers={hasCustomers}
                hasPosSales={hasPosSales}
                posCheckoutEnabled={posCheckoutEnabled}
              />
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
