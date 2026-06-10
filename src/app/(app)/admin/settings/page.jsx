"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { mergeSalesSettings, resolvePosOrderTypeMode } from "@/lib/sales-settings";
import { useAuth } from "@/contexts/auth-context";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  CatalogPageShell,
  Field,
  PrimaryButton,
  inputClassName,
} from "@/components/catalog/catalog-shared";

const TABS = [
  { id: "general", label: "General" },
  { id: "sales", label: "Sales" },
  { id: "inventory", label: "Inventory" },
  { id: "procurement", label: "Procurement" },
  { id: "finance", label: "Finance" },
  { id: "hr", label: "HR & Payroll" },
  { id: "notifications", label: "Notifications" },
  { id: "security", label: "Security" },
];

const EMPTY_SALES_FORM = {
  allow_sell_from_shop: true,
  allow_sell_from_store: false,
  enable_retail_pricing: false,
  allow_discounts: true,
  allow_edit_unit_price: true,
  allow_negative_stock: false,
  enable_barcode_scanner: false,
  default_tax_rate: "16",
  enable_mpesa_amount: true,
  enable_mpesa_code: true,
  enable_bank_select: false,
  enable_equity_bank: true,
  enable_kcb_bank: true,
  enable_other_bank: false,
  other_bank_name: "Other bank",
  enable_bank_amount: true,
  enable_cheque: true,
  enable_payment_date: true,
  enable_credit_payment: true,
  allow_credit_pay_now: false,
  show_checkout_on_create_order: true,
  enable_checkout_customer_name: false,
  retail_shop_wholesale_store_stock: false,
  add_route_markup_prices: false,
  pos_order_type_mode: "normal",
};

function salesFormFromApi(res) {
  const sales = mergeSalesSettings({ sales: res.sales });
  return {
    allow_sell_from_shop: Boolean(sales.allow_sell_from_shop),
    allow_sell_from_store: Boolean(sales.allow_sell_from_store),
    enable_retail_pricing: Boolean(sales.enable_retail_pricing),
    allow_discounts: Boolean(sales.allow_discounts),
    allow_edit_unit_price: Boolean(sales.allow_edit_unit_price),
    allow_negative_stock: Boolean(res.allow_negative_stock),
    enable_barcode_scanner: Boolean(sales.enable_barcode_scanner),
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
    enable_payment_date: Boolean(sales.enable_payment_date),
    enable_credit_payment: Boolean(sales.enable_credit_payment),
    allow_credit_pay_now: Boolean(sales.allow_credit_pay_now),
    show_checkout_on_create_order: Boolean(sales.show_checkout_on_create_order),
    enable_checkout_customer_name: Boolean(sales.enable_checkout_customer_name),
    retail_shop_wholesale_store_stock: Boolean(sales.retail_shop_wholesale_store_stock),
    add_route_markup_prices: Boolean(sales.add_route_markup_prices),
    pos_order_type_mode: resolvePosOrderTypeMode(sales),
  };
}

const GENERAL_FORM = {
  currency: "KES",
  timezone: "Africa/Nairobi",
  date_format: "DD/MM/YYYY",
  language: "English",
};

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
  const { refreshCapabilities } = useAuth();
  const [tab, setTab] = useState("sales");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [salesForm, setSalesForm] = useState(EMPTY_SALES_FORM);
  const [generalForm] = useState(GENERAL_FORM);

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
      const body = {
        ...salesForm,
        default_tax_rate: Number(salesForm.default_tax_rate) || 0,
      };
      if (
        !body.allow_sell_from_shop &&
        !body.allow_sell_from_store &&
        !(body.enable_retail_pricing && body.retail_shop_wholesale_store_stock)
      ) {
        setError(
          "Enable shop stock, store stock, or retail-from-shop / wholesale-from-store routing.",
        );
        return;
      }
      if (body.allow_sell_from_shop && body.allow_sell_from_store) {
        setError("Enable only shop stock or store stock — not both at the same time.");
        return;
      }
      await apiRequest("/erp/settings/sales", { method: "PATCH", body });
      await refreshCapabilities();
      setMessage("Sales settings saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CatalogPageShell title="System settings" subtitle="Configure organization-wide preferences.">
      <AdminBreadcrumb
        items={[{ label: "Administration", href: "/admin" }, { label: "System settings" }]}
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
          {TABS.map((item) => (
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
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-medium text-slate-900">General settings</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Default currency">
                  <select className={inputClassName()} value={generalForm.currency} disabled>
                    <option value="KES">KES</option>
                  </select>
                </Field>
                <Field label="Timezone">
                  <select className={inputClassName()} value={generalForm.timezone} disabled>
                    <option value="Africa/Nairobi">Africa/Nairobi</option>
                  </select>
                </Field>
                <Field label="Date format">
                  <select className={inputClassName()} value={generalForm.date_format} disabled>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  </select>
                </Field>
                <Field label="Language">
                  <select className={inputClassName()} value={generalForm.language} disabled>
                    <option value="English">English</option>
                  </select>
                </Field>
              </div>
              <p className="mt-4 text-xs text-slate-500">
                General preferences will be editable in a future update.
              </p>
            </section>
          ) : null}

          {tab === "sales" ? (
            <form onSubmit={handleSaveSales}>
              <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-medium text-slate-900">Sales settings</h2>
                {loading ? (
                  <p className="mt-4 text-sm text-slate-500">Loading…</p>
                ) : (
                  <div className="mt-5 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stock source</p>
                    <Toggle
                      label="Sell from shop stock"
                      description="Sell from branch shop (POS) stock. Cannot be enabled together with store stock."
                      checked={salesForm.allow_sell_from_shop}
                      disabled={salesForm.retail_shop_wholesale_store_stock}
                      onChange={(v) =>
                        setSalesForm((f) => ({
                          ...f,
                          allow_sell_from_shop: v,
                          ...(v
                            ? {
                                allow_sell_from_store: false,
                                retail_shop_wholesale_store_stock: false,
                              }
                            : {}),
                        }))
                      }
                    />
                    <Toggle
                      label="Sell from store stock"
                      description="Sell from central store stock. Cannot be enabled together with shop stock."
                      checked={salesForm.allow_sell_from_store}
                      disabled={salesForm.retail_shop_wholesale_store_stock}
                      onChange={(v) =>
                        setSalesForm((f) => ({
                          ...f,
                          allow_sell_from_store: v,
                          ...(v
                            ? {
                                allow_sell_from_shop: false,
                                retail_shop_wholesale_store_stock: false,
                              }
                            : {}),
                        }))
                      }
                    />
                    <Toggle
                      label="Enable retail pricing"
                      description="Turns on retail pricing on POS (wholesale remains the default). Also enables per-line shop/store stock routing below."
                      checked={salesForm.enable_retail_pricing}
                      onChange={(v) =>
                        setSalesForm((f) => ({
                          ...f,
                          enable_retail_pricing: v,
                          retail_shop_wholesale_store_stock: v
                            ? f.retail_shop_wholesale_store_stock
                            : false,
                          ...(!v
                            ? {
                                allow_sell_from_shop: true,
                                allow_sell_from_store: false,
                              }
                            : {}),
                        }))
                      }
                    />
                    <Toggle
                      label="Retail from shop, wholesale from store"
                      description="Retail lines deduct shop stock; wholesale lines deduct store stock. Turns off global shop/store selection — neither stock source is selected by default."
                      checked={salesForm.retail_shop_wholesale_store_stock}
                      disabled={!salesForm.enable_retail_pricing}
                      onChange={(v) =>
                        setSalesForm((f) => ({
                          ...f,
                          retail_shop_wholesale_store_stock: v,
                          ...(v
                            ? {
                                allow_sell_from_shop: false,
                                allow_sell_from_store: false,
                              }
                            : {}),
                        }))
                      }
                    />
                    <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Checkout</p>
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
                    {salesForm.add_route_markup_prices ? (
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
                      label="Enable barcode scanner"
                      description="Scan SKU/barcode to add qty 1 directly to the cart (same product and pricing mode merges lines). If the code is not found, search manually."
                      checked={salesForm.enable_barcode_scanner}
                      onChange={(v) => setSalesForm((f) => ({ ...f, enable_barcode_scanner: v }))}
                    />
                    <Toggle
                      label="Allow negative stock"
                      description="Allow selling products even if stock is negative."
                      checked={salesForm.allow_negative_stock}
                      onChange={(v) => setSalesForm((f) => ({ ...f, allow_negative_stock: v }))}
                    />
                    <Toggle
                      label="Allow discounts"
                      description="Shows discount fields on products and POS. Product discount settings are applied automatically at checkout."
                      checked={salesForm.allow_discounts}
                      onChange={(v) => setSalesForm((f) => ({ ...f, allow_discounts: v }))}
                    />
                    <Toggle
                      label="Editable unit price on POS"
                      description="When off, unit price is fixed and Enter on quantity adds the line to the cart."
                      checked={salesForm.allow_edit_unit_price}
                      onChange={(v) => setSalesForm((f) => ({ ...f, allow_edit_unit_price: v }))}
                    />
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

                    <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Payment fields (POS checkout)
                    </p>
                    <Toggle
                      label="Show checkout on create order"
                      description="When off, POS shows Save Order instead of opening checkout."
                      checked={salesForm.show_checkout_on_create_order}
                      onChange={(v) => setSalesForm((f) => ({ ...f, show_checkout_on_create_order: v }))}
                    />
                    <Toggle
                      label="Request customer name on checkout"
                      description="When direct checkout is enabled, show a customer name popup after payment confirmation (before the order is saved). Skipped for credit sales with a selected customer."
                      checked={salesForm.enable_checkout_customer_name}
                      disabled={!salesForm.show_checkout_on_create_order}
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
                      description="Cheque number field is shown automatically; required when a cheque amount is entered."
                      checked={salesForm.enable_cheque}
                      onChange={(v) => setSalesForm((f) => ({ ...f, enable_cheque: v }))}
                    />
                  </div>
                )}
                <div className="mt-6">
                  <PrimaryButton type="submit" disabled={loading || saving} showIcon={false}>
                    {saving ? "Saving…" : "Save"}
                  </PrimaryButton>
                </div>
              </section>
            </form>
          ) : null}

          {tab === "inventory" ? (
            <PlaceholderPanel
              title="Inventory settings"
              description="Stock alerts, default receive location, and stock-take options will be configured here."
            />
          ) : null}
          {tab === "procurement" ? (
            <PlaceholderPanel
              title="Procurement settings"
              description="LPO defaults and supplier workflow settings will be configured here."
            />
          ) : null}
          {tab === "finance" ? (
            <PlaceholderPanel
              title="Finance settings"
              description="Accounting integration and payment defaults will be configured here."
            />
          ) : null}
          {tab === "hr" ? (
            <PlaceholderPanel
              title="HR & Payroll settings"
              description="Leave policies, payroll cycles, and attendance rules will be configured here."
            />
          ) : null}
          {tab === "notifications" ? (
            <PlaceholderPanel
              title="Notifications"
              description="Email and SMS notification preferences will be configured here."
            />
          ) : null}
          {tab === "security" ? (
            <PlaceholderPanel
              title="Security"
              description="Password policies and session settings will be configured here."
            />
          ) : null}
        </div>
      </div>
    </CatalogPageShell>
  );
}
