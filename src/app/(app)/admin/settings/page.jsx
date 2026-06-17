"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { mergeSalesSettings, resolvePosOrderTypeMode } from "@/lib/sales-settings";
import { useAuth } from "@/contexts/auth-context";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { FinanceSettingsPanel } from "@/components/admin/finance-settings-panel";
import { AiSettingsPanel } from "@/components/admin/ai-settings-panel";
import { InventorySettingsPanel } from "@/components/admin/inventory-settings-panel";
import { DistributionSettingsPanel } from "@/components/admin/distribution-settings-panel";
import { GeneralSettingsPanel } from "@/components/admin/general-settings-panel";
import { NotificationsSettingsPanel } from "@/components/admin/notifications-settings-panel";
import { ProcurementSettingsPanel } from "@/components/admin/procurement-settings-panel";
import { HrSettingsPanel } from "@/components/admin/hr-settings-panel";
import { SecuritySettingsPanel } from "@/components/admin/security-settings-panel";
import { visibleOrgSettingsTabs } from "@/lib/org-settings-tabs";
import { PlatformConfiguredSalesSummary } from "@/components/admin/platform-configured-summary";
import {
  CatalogPageShell,
  Field,
  PrimaryButton,
  inputClassName,
} from "@/components/catalog/catalog-shared";

const TABS = [
  { id: "general", label: "General" },
  { id: "sales", label: "Sales" },
  { id: "distribution", label: "Distribution" },
  { id: "inventory", label: "Inventory" },
  { id: "procurement", label: "Procurement" },
  { id: "finance", label: "Finance" },
  { id: "ai", label: "AI" },
  { id: "hr", label: "HR & Payroll" },
  { id: "notifications", label: "Notifications" },
  { id: "security", label: "Security" },
];

const EMPTY_SALES_FORM = {
  allow_discounts: true,
  allow_edit_line_discount: false,
  enable_order_discount: false,
  enable_vouchers: false,
  enable_redeemable_points: false,
  point_cash_value: "1",
  points_earn_per_kes: "1000",
  allow_edit_unit_price: true,
  default_tax_rate: "16",
  enable_mpesa_amount: true,
  enable_mpesa_code: false,
  enable_bank_select: false,
  enable_equity_bank: true,
  enable_kcb_bank: true,
  enable_other_bank: false,
  other_bank_name: "Other bank",
  enable_bank_amount: true,
  enable_cheque: true,
  enable_cheque_number: false,
  enable_payment_date: false,
  enable_credit_payment: true,
  allow_credit_pay_now: false,
  show_checkout_on_create_order: true,
  enable_checkout_customer_name: false,
  add_route_markup_prices: false,
  pos_order_type_mode: "normal",
  enable_mobile_orders: false,
  enable_pos_orders: false,
  require_pos_till_float: false,
  blind_till_close: false,
  order_document_type: "receipt",
  invoice_valid_days: "7",
  show_branch_on_receipt: true,
  receipt_copies: "1",
  stock_deduct_on: "order_completed",
};

function salesFormFromApi(res) {
  const source = res?.sales ?? res;
  const sales = mergeSalesSettings({ sales: source });
  return {
    allow_discounts: Boolean(sales.allow_discounts),
    allow_edit_line_discount: Boolean(sales.allow_edit_line_discount),
    enable_order_discount: Boolean(sales.enable_order_discount),
    enable_vouchers: Boolean(sales.enable_vouchers),
    enable_redeemable_points: Boolean(sales.enable_redeemable_points),
    point_cash_value: String(sales.point_cash_value ?? 1),
    points_earn_per_kes: String(sales.points_earn_per_kes ?? 1000),
    allow_edit_unit_price: Boolean(sales.allow_edit_unit_price),
    default_tax_rate: String(sales.default_tax_rate ?? 16),
    enable_mpesa_amount: Boolean(sales.enable_mpesa_amount),
    enable_mpesa_code: Boolean(sales.enable_mpesa_code),
    enable_bank_select: Boolean(sales.enable_bank_select),
    enable_equity_bank: Boolean(sales.enable_equity_bank),
    enable_kcb_bank: Boolean(sales.enable_kcb_bank),
    enable_other_bank: Boolean(sales.enable_other_bank),
    other_bank_name: String(sales.other_bank_name ?? "Other bank"),
    enable_bank_amount: Boolean(sales.enable_bank_amount),
    enable_cheque: Boolean(sales.enable_cheque),
    enable_cheque_number: Boolean(sales.enable_cheque_number),
    enable_payment_date: Boolean(sales.enable_payment_date),
    enable_credit_payment: Boolean(sales.enable_credit_payment),
    allow_credit_pay_now: Boolean(sales.allow_credit_pay_now),
    show_checkout_on_create_order: Boolean(sales.show_checkout_on_create_order),
    enable_checkout_customer_name: Boolean(sales.enable_checkout_customer_name),
    add_route_markup_prices: Boolean(sales.add_route_markup_prices),
    pos_order_type_mode: resolvePosOrderTypeMode(sales),
    enable_mobile_orders: Boolean(sales.enable_mobile_orders),
    enable_pos_orders: Boolean(sales.enable_pos_orders),
    require_pos_till_float: Boolean(sales.require_pos_till_float),
    blind_till_close: Boolean(sales.blind_till_close),
    order_document_type: sales.order_document_type === "invoice" ? "invoice" : "receipt",
    invoice_valid_days: String(sales.invoice_valid_days ?? 7),
    show_branch_on_receipt: Boolean(sales.show_branch_on_receipt),
    receipt_copies: String(sales.receipt_copies ?? 1),
    stock_deduct_on: sales.stock_deduct_on || "order_completed",
  };
}

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

function PlaceholderPanel({ title, description }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-medium text-slate-900">{title}</h2>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </section>
  );
}

export default function AdminSettingsPage() {
  const { refreshCapabilities, capabilities } = useAuth();
  const [tab, setTab] = useState("sales");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [salesForm, setSalesForm] = useState(EMPTY_SALES_FORM);

  const modules = capabilities?.modules ?? {};
  const hasPosSales = Boolean(modules["sales.pos"]);
  const hasCustomers = Boolean(modules.customers_suppliers);

  const visibleTabs = useMemo(() => visibleOrgSettingsTabs(TABS, capabilities), [capabilities]);

  useEffect(() => {
    if (visibleTabs.length === 0) return;
    if (!visibleTabs.some((item) => item.id === tab)) {
      setTab(visibleTabs[0].id);
    }
  }, [visibleTabs, tab]);

  const loadSalesSettings = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest("/erp/settings/sales");
      setSalesForm(salesFormFromApi(res));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSalesSettings();
  }, [loadSalesSettings]);

  async function handleSaveSales(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const salesPayload = {
        ...salesForm,
        default_tax_rate: Number(salesForm.default_tax_rate) || 0,
        point_cash_value: Number(salesForm.point_cash_value) || 0,
        points_earn_per_kes: Number(salesForm.points_earn_per_kes) || 0,
        invoice_valid_days: Number(salesForm.invoice_valid_days) || 0,
      };
      await apiRequest("/erp/settings/sales", {
        method: "PATCH",
        body: salesPayload,
      });
      const res = await apiRequest("/erp/settings/sales");
      setSalesForm(salesFormFromApi(res));
      await refreshCapabilities();
      setMessage("Sales settings saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CatalogPageShell
      title="Organization settings"
      subtitle="Operational preferences for this company (checkout, finance, HR, inventory). Module access is set by the platform administrator at registration."
    >
      <AdminBreadcrumb
        items={[{ label: "Administration", href: "/admin" }, { label: "Organization settings" }]}
      />

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}
      {message ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <nav className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
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
          {tab === "general" ? (
            <GeneralSettingsPanel
              saving={saving}
              setSaving={setSaving}
              setError={setError}
              setMessage={setMessage}
            />
          ) : null}

          {tab === "sales" ? (
            <form onSubmit={handleSaveSales}>
              <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-medium text-slate-900">Sales settings</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Day-to-day POS and checkout preferences. Module access and order workflow are platform-controlled.
                </p>
                {loading ? (
                  <p className="mt-4 text-sm text-slate-500">Loading…</p>
                ) : (
                  <div className="mt-5 space-y-3">
                    <PlatformConfiguredSalesSummary />
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Checkout & pricing</p>
                    {hasCustomers ? (
                      <Toggle
                        label="Add route markup prices"
                        description="Enables route markup on sales. Choose whether cashiers always use normal pricing, always select a route for markup, or can toggle below."
                        checked={salesForm.add_route_markup_prices}
                        onChange={(v) =>
                          setSalesForm((f) => ({
                            ...f,
                            add_route_markup_prices: v,
                            pos_order_type_mode: v ? f.pos_order_type_mode : "normal",
                          }))
                        }
                      />
                    ) : null}
                    {hasPosSales && salesForm.add_route_markup_prices ? (
                      <fieldset className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                        <legend className="px-1 text-sm font-medium text-slate-900">
                          POS order type
                        </legend>
                        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                          <input
                            type="radio"
                            name="pos_order_type_mode"
                            className="mt-1"
                            value="normal"
                            checked={salesForm.pos_order_type_mode === "normal"}
                            onChange={() =>
                              setSalesForm((f) => ({ ...f, pos_order_type_mode: "normal" }))
                            }
                          />
                          <span>
                            <span className="font-medium">Lock to Normal order</span>
                            <span className="mt-0.5 block text-xs text-slate-500">
                              Hide the order-type choice; all sales use normal pricing without route markup.
                            </span>
                          </span>
                        </label>
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
                            <span className="font-medium">Lock to route markup selection</span>
                            <span className="mt-0.5 block text-xs text-slate-500">
                              Cashiers always select a route to apply markup; the Normal / route choice is hidden.
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
                            <span className="font-medium">Allow Normal / route markup toggle</span>
                            <span className="mt-0.5 block text-xs text-slate-500">
                              Cashiers can choose Normal order or select a route to apply markup on each sale.
                            </span>
                          </span>
                        </label>
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
                    {hasPosSales ? (
                      <Toggle
                        label="Editable unit price on POS"
                        description="When off, unit price is fixed and Enter on quantity adds the line to the cart."
                        checked={salesForm.allow_edit_unit_price}
                        onChange={(v) => setSalesForm((f) => ({ ...f, allow_edit_unit_price: v }))}
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
                <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Receipt Type Printer Selection
                </p>
                <div className="mt-3 space-y-3">
                  <Field label="Order print format">
                  <select
                    className={inputClassName()}
                    value={salesForm.order_document_type}
                    onChange={(e) =>
                      setSalesForm((f) => ({ ...f, order_document_type: e.target.value }))
                    }
                  >
                    <option value="receipt">Receipt — compact thermal-style layout</option>
                    <option value="invoice">Invoice — A4 tax invoice (detailed)</option>
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    Applies to Print and Download on order summary and the orders list.
                  </p>
                </Field>
                <Field label="Receipt copies">
                  <select
                    className={inputClassName()}
                    value={salesForm.receipt_copies}
                    onChange={(e) => setSalesForm((f) => ({ ...f, receipt_copies: e.target.value }))}
                  >
                    <option value="1">Single receipt</option>
                    <option value="2">Double receipt (customer + merchant)</option>
                  </select>
                  <p className="mt-1 text-xs text-slate-500">Controls how many copies are printed on checkout.</p>
                </Field>
                <Toggle
                  label="Show branch details on receipt"
                  description="When enabled and a branch is selected, receipt will show branch name, address and phone."
                  checked={salesForm.show_branch_on_receipt}
                  onChange={(v) => setSalesForm((f) => ({ ...f, show_branch_on_receipt: v }))}
                />
                </div>
                {salesForm.order_document_type === "invoice" ? (
                  <Field label="Invoice valid for (days)">
                    <input
                      type="number"
                      min={0}
                      max={365}
                      className={inputClassName()}
                      value={salesForm.invoice_valid_days}
                      onChange={(e) =>
                        setSalesForm((f) => ({ ...f, invoice_valid_days: e.target.value }))
                      }
                    />
                  </Field>
                ) : null}
                {hasPosSales ? (
                <div className="mt-4 space-y-3">
                  <Toggle
                    label="Require operating till float at POS"
                    description="When on, cashiers must open a till session and declare the operating float (any amount) before POS sales. X reports, Z reports, and end-of-day sales include the float breakdown. When off, POS sells without a session; reports still run but omit float."
                    checked={salesForm.require_pos_till_float}
                    onChange={(v) => setSalesForm((f) => ({ ...f, require_pos_till_float: v }))}
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

          {tab === "distribution" ? (
            <DistributionSettingsPanel
              saving={saving}
              setSaving={setSaving}
              setError={setError}
              setMessage={setMessage}
            />
          ) : null}

          {tab === "inventory" ? (
            <InventorySettingsPanel
              saving={saving}
              setSaving={setSaving}
              setError={setError}
              setMessage={setMessage}
            />
          ) : null}
          {tab === "procurement" ? (
            <ProcurementSettingsPanel
              saving={saving}
              setSaving={setSaving}
              setError={setError}
              setMessage={setMessage}
            />
          ) : null}
          {tab === "finance" ? (
            <FinanceSettingsPanel
              saving={saving}
              setSaving={setSaving}
              setError={setError}
              setMessage={setMessage}
            />
          ) : null}
          {tab === "ai" ? (
            <AiSettingsPanel
              saving={saving}
              setSaving={setSaving}
              setError={setError}
              setMessage={setMessage}
            />
          ) : null}
          {tab === "hr" ? (
            <HrSettingsPanel
              saving={saving}
              setSaving={setSaving}
              setError={setError}
              setMessage={setMessage}
            />
          ) : null}
          {tab === "notifications" ? (
            <NotificationsSettingsPanel
              saving={saving}
              setSaving={setSaving}
              setError={setError}
              setMessage={setMessage}
            />
          ) : null}
          {tab === "security" ? (
            <SecuritySettingsPanel
              saving={saving}
              setSaving={setSaving}
              setError={setError}
              setMessage={setMessage}
            />
          ) : null}
        </div>
      </div>
    </CatalogPageShell>
  );
}
