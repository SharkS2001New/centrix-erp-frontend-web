"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import {
  INVENTORY_LOCATION_OPTIONS,
  STOCK_ALERT_MODE_OPTIONS,
  inventoryFormFromApi,
  inventoryPayloadFromForm,
} from "@/lib/inventory-settings";
import { Field, PrimaryButton, inputClassName, SearchableSelect } from "@/components/catalog/catalog-shared";
import { SettingsSubTabBar, useSettingsSubTab } from "@/components/admin/settings-sub-tabs";
import { useSettingsApi, useSettingsAfterSave, useSettingsGet } from "@/contexts/settings-api-context";
import { useAuth } from "@/contexts/auth-context";
import { isHospitalityIndustry } from "@/lib/org-settings-tabs";

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
        checked={Boolean(checked)}
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
  const { capabilities } = useAuth();
  const hospitality = isHospitalityIndustry(capabilities);
  const { settingsPath } = useSettingsApi();
  const afterSave = useSettingsAfterSave(onAfterSave);
  const getSettings = useSettingsGet();
  const [form, setForm] = useState(inventoryFormFromApi({}));
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(hospitality ? "alerts" : "selling");

  const visibleTabs = useMemo(() => {
    if (hospitality) {
      return [
        { id: "alerts", label: "Stock alerts" },
        { id: "locations", label: "Receive location" },
      ];
    }
    return [
      { id: "selling", label: "How you sell" },
      { id: "locations", label: "Stock locations" },
    ];
  }, [hospitality]);

  useSettingsSubTab(activeTab, setActiveTab, visibleTabs);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSettings("inventory")
      .then((res) => {
        if (!cancelled && res) setForm(inventoryFormFromApi(res));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Failed to load inventory settings");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getSettings, setError]);

  async function handleSave(e) {
    e.preventDefault();
    const payload = inventoryPayloadFromForm(form);
    if (!hospitality) {
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
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      // Hotels control sell-location via Hotel F&B → stock_location; do not rewrite retail sell toggles.
      const body = hospitality
        ? {
            allow_negative_stock: payload.allow_negative_stock,
            stock_alert_mode: payload.stock_alert_mode,
            global_low_stock_threshold: payload.global_low_stock_threshold,
            default_receive_location: payload.default_receive_location,
          }
        : payload;
      const res = await apiRequest(settingsPath("inventory"), {
        method: "PATCH",
        body,
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
      <section className="theme-panel rounded-xl border p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Inventory settings</h2>
        <p className="mt-1 text-sm text-slate-500">
          {hospitality
            ? "Stock alerts and receive location. Hotel POS deducts from the location set under Hotel F&B settings."
            : "Stock sources, locations, and low-stock alerts."}
        </p>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="mt-5 space-y-5">
            <SettingsSubTabBar
              tabs={visibleTabs}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              ariaLabel="Inventory settings"
            />

            {activeTab === "selling" && !hospitality ? (
          <div className="space-y-3">
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
            <Field label="Alert mode">
              <SearchableSelect
  className={inputClassName()}
  value={form.stock_alert_mode}
  nativeEvent
  onChange={((e) => setForm((f) => ({ ...f, stock_alert_mode: e.target.value })))}
  options={STOCK_ALERT_MODE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
/>
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
            ) : null}

            {activeTab === "alerts" && hospitality ? (
              <div className="space-y-3">
                <Toggle
                  label="Allow negative stock"
                  description="Allow Hotel POS settle even if stock would go below zero (also controlled by Hotel F&B → Block settle if insufficient)."
                  checked={form.allow_negative_stock}
                  onChange={(v) => setForm((f) => ({ ...f, allow_negative_stock: v }))}
                />
                <Field label="Alert mode">
                  <SearchableSelect
  className={inputClassName()}
  value={form.stock_alert_mode}
  nativeEvent
  onChange={((e) => setForm((f) => ({ ...f, stock_alert_mode: e.target.value })))}
  options={STOCK_ALERT_MODE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
/>
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
                <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                  Where Hotel POS deducts stock (shop/outlet vs kitchen store) is set under{" "}
                  <strong>Hotel F&amp;B settings → Stock balancing → Deduct from location</strong>
                  — not here.
                </p>
              </div>
            ) : null}

            {activeTab === "locations" ? (
          <div className="space-y-3">
            <Field label="Default receive location">
              <SearchableSelect
  className={inputClassName()}
  value={form.default_receive_location}
  nativeEvent
  onChange={((e) => setForm((f) => ({ ...f, default_receive_location: e.target.value })))}
  options={INVENTORY_LOCATION_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
/>
            </Field>
            {!hospitality ? (
              <>
                <Field label="Default POS sale location">
                  <SearchableSelect
  className={inputClassName()}
  value={form.default_pos_sale_location}
  nativeEvent
  onChange={((e) => setForm((f) => ({ ...f, default_pos_sale_location: e.target.value })))}
  options={INVENTORY_LOCATION_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
/>
                </Field>
                <Field label="Default distribution sale location">
                  <SearchableSelect
                    className={inputClassName()}
                    value={form.default_distribution_sale_location}
                    nativeEvent
                    onChange={(e) =>
                      setForm((f) => ({ ...f, default_distribution_sale_location: e.target.value }))
                    }
                    options={INVENTORY_LOCATION_OPTIONS.map((opt) => ({
                      value: opt.value,
                      label: opt.label,
                    }))}
                  />
                </Field>
              </>
            ) : (
              <p className="text-xs text-slate-500">
                Used when receiving stock into shop or store. Hotel POS sale deduct location is under Hotel
                F&amp;B settings.
              </p>
            )}
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
