"use client";

import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  INVENTORY_LOCATION_OPTIONS,
  STOCK_ALERT_MODE_OPTIONS,
  inventoryFormFromApi,
  inventoryPayloadFromForm,
} from "@/lib/inventory-settings";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { useSettingsApi } from "@/contexts/settings-api-context";

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

export function InventorySettingsPanel({ saving, setSaving, setError, setMessage, onAfterSave }) {
  const { refreshCapabilities } = useAuth();
  const { settingsPath } = useSettingsApi();
  const afterSave = onAfterSave ?? refreshCapabilities;
  const [form, setForm] = useState(inventoryFormFromApi({}));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiRequest(settingsPath("inventory"))
      .then((res) => setForm(inventoryFormFromApi(res)))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load inventory settings"))
      .finally(() => setLoading(false));
  }, [setError, settingsPath]);

  async function handleSave(e) {
    e.preventDefault();
    const payload = inventoryPayloadFromForm(form);
    if (
      !payload.allow_sell_from_shop &&
      !payload.allow_sell_from_store &&
      !(payload.enable_retail_pricing && payload.retail_shop_wholesale_store_stock)
    ) {
      setError("Enable shop stock, store stock, or retail-from-shop / wholesale-from-store routing.");
      return;
    }
    if (payload.allow_sell_from_shop && payload.allow_sell_from_store) {
      setError("Enable only shop stock or store stock — not both at the same time.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiRequest(settingsPath("inventory"), {
        method: "PATCH",
        body: payload,
      });
      setForm(inventoryFormFromApi(res));
      if (afterSave) await afterSave();
      setMessage("Inventory settings saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save inventory settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave}>
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Inventory settings</h2>
        <p className="mt-1 text-sm text-slate-500">Stock sources, locations, alerts, and POS scanning.</p>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="mt-5 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stock source</p>
            <Toggle
              label="Sell from shop stock"
              description="Sell from branch shop (POS) stock. Cannot be enabled together with store stock."
              checked={form.allow_sell_from_shop}
              disabled={form.retail_shop_wholesale_store_stock}
              onChange={(v) =>
                setForm((f) => ({
                  ...f,
                  allow_sell_from_shop: v,
                  ...(v
                    ? { allow_sell_from_store: false, retail_shop_wholesale_store_stock: false }
                    : {}),
                }))
              }
            />
            <Toggle
              label="Sell from store stock"
              description="Sell from central store stock. Cannot be enabled together with shop stock."
              checked={form.allow_sell_from_store}
              disabled={form.retail_shop_wholesale_store_stock}
              onChange={(v) =>
                setForm((f) => ({
                  ...f,
                  allow_sell_from_store: v,
                  ...(v
                    ? { allow_sell_from_shop: false, retail_shop_wholesale_store_stock: false }
                    : {}),
                }))
              }
            />
            <Toggle
              label="Enable retail pricing"
              description="Turns on retail pricing on POS. Also enables per-line shop/store stock routing below."
              checked={form.enable_retail_pricing}
              onChange={(v) =>
                setForm((f) => ({
                  ...f,
                  enable_retail_pricing: v,
                  retail_shop_wholesale_store_stock: v ? f.retail_shop_wholesale_store_stock : false,
                  ...(!v ? { allow_sell_from_shop: true, allow_sell_from_store: false } : {}),
                }))
              }
            />
            <Toggle
              label="Retail from shop, wholesale from store"
              description="Retail lines deduct shop stock; wholesale lines deduct store stock."
              checked={form.retail_shop_wholesale_store_stock}
              disabled={!form.enable_retail_pricing}
              onChange={(v) =>
                setForm((f) => ({
                  ...f,
                  retail_shop_wholesale_store_stock: v,
                  ...(v ? { allow_sell_from_shop: false, allow_sell_from_store: false } : {}),
                }))
              }
            />
            <Toggle
              label="Allow negative stock"
              description="Allow selling products even if stock goes below zero."
              checked={form.allow_negative_stock}
              onChange={(v) => setForm((f) => ({ ...f, allow_negative_stock: v }))}
            />
            <Toggle
              label="Reserve stock when added to cart"
              description="Hold stock while a cart is open so other tills cannot oversell the same quantity."
              checked={form.reserve_stock_on_cart}
              onChange={(v) => setForm((f) => ({ ...f, reserve_stock_on_cart: v }))}
            />
            {form.reserve_stock_on_cart ? (
              <Field label="Cart reservation time (minutes)">
                <input
                  type="number"
                  min="0"
                  max="15"
                  step="1"
                  className={`${inputClassName()} w-32`}
                  value={form.cart_reservation_ttl_minutes}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") {
                      setForm((f) => ({ ...f, cart_reservation_ttl_minutes: "" }));
                      return;
                    }
                    const parsed = Math.min(15, Math.max(0, Number(raw) || 0));
                    setForm((f) => ({
                      ...f,
                      cart_reservation_ttl_minutes: String(parsed),
                    }));
                  }}
                  placeholder="15"
                />
                <p className="mt-1 text-xs text-slate-500">
                  How long stock stays held on an open cart (max 15 minutes). Use 0 to disable expiry.
                </p>
              </Field>
            ) : null}
            <Toggle
              label="Enable barcode scanner"
              description="Scan SKU/barcode to add qty 1 directly to the cart on POS."
              checked={form.enable_barcode_scanner}
              onChange={(v) => setForm((f) => ({ ...f, enable_barcode_scanner: v }))}
            />

            <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Default locations
            </p>
            <Field label="Default receive location">
              <select
                className={inputClassName()}
                value={form.default_receive_location}
                onChange={(e) => setForm((f) => ({ ...f, default_receive_location: e.target.value }))}
              >
                {INVENTORY_LOCATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Default POS sale location">
              <select
                className={inputClassName()}
                value={form.default_pos_sale_location}
                onChange={(e) => setForm((f) => ({ ...f, default_pos_sale_location: e.target.value }))}
              >
                {INVENTORY_LOCATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Default distribution sale location">
              <select
                className={inputClassName()}
                value={form.default_distribution_sale_location}
                onChange={(e) =>
                  setForm((f) => ({ ...f, default_distribution_sale_location: e.target.value }))
                }
              >
                {INVENTORY_LOCATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>

            <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Low stock alerts
            </p>
            <Field label="Alert mode">
              <select
                className={inputClassName()}
                value={form.stock_alert_mode}
                onChange={(e) => setForm((f) => ({ ...f, stock_alert_mode: e.target.value }))}
              >
                {STOCK_ALERT_MODE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>
            {form.stock_alert_mode !== "per_product" ? (
              <Field label="Global low stock threshold">
                <input
                  type="number"
                  min="0"
                  step="any"
                  className={`${inputClassName()} w-32`}
                  value={form.global_low_stock_threshold}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, global_low_stock_threshold: e.target.value }))
                  }
                  placeholder="e.g. 5"
                />
              </Field>
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
