"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { financeFormFromApi, financePayloadFromForm, isPlatformKraIntegrationEnabled, isPlatformMpesaStkEnabled, kraDeviceOpsPayloadFromForm } from "@/lib/finance-settings";
import { Field, PrimaryButton, SECONDARY_BTN_CLASS, inputClassName } from "@/components/catalog/catalog-shared";
import { SettingsSubTabBar, useSettingsSubTab } from "@/components/admin/settings-sub-tabs";
import { FinanceDebtorPaymentAlerts } from "@/components/admin/customer-notification-fields";
import {
  financeDebtorAlertPayloadFromForm,
  notificationsFormFromApi,
} from "@/lib/notifications-settings";
import { useSettingsApi } from "@/contexts/settings-api-context";
import { notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";

function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-4 py-3">
      <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="theme-heading block text-sm font-medium">{label}</span>
        {description ? <span className="theme-subtext mt-0.5 block text-xs">{description}</span> : null}
      </span>
    </label>
  );
}

function UrlField({ label, value, onChange, placeholder }) {
  return (
    <Field label={label}>
      <input
        className={inputClassName()}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </Field>
  );
}

export function FinanceSettingsPanel({ saving, setSaving, setError, setMessage, capabilities: capabilitiesProp, onAfterSave }) {
  const confirm = useConfirm();
  const { refreshCapabilities, capabilities: authCapabilities } = useAuth();
  const capabilities = capabilitiesProp ?? authCapabilities;
  const { settingsPath } = useSettingsApi();
  const afterSave = onAfterSave ?? (() => refreshCapabilities({ force: true }));
  const [form, setForm] = useState(financeFormFromApi({}));
  const [alertForm, setAlertForm] = useState(notificationsFormFromApi({}));
  const [loading, setLoading] = useState(true);
  const [kraHealthTesting, setKraHealthTesting] = useState(false);
  const [kraInitTesting, setKraInitTesting] = useState(false);
  const [kraRestartTesting, setKraRestartTesting] = useState(false);
  const [kraHealthResult, setKraHealthResult] = useState(null);
  const [activeTab, setActiveTab] = useState("kra");

  useEffect(() => {
    setLoading(true);
    apiRequest(settingsPath("finance"))
      .then((res) => setForm(financeFormFromApi(res)))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load finance settings"))
      .finally(() => setLoading(false));
  }, [setError, settingsPath]);

  useEffect(() => {
    apiRequest(settingsPath("notifications"))
      .then((res) => setAlertForm(notificationsFormFromApi(res)))
      .catch(() => {});
  }, [settingsPath]);

  function setMpesa(field, value) {
    setForm((f) => ({ ...f, mpesa: { ...f.mpesa, [field]: value } }));
  }

  const kraAllowed = isPlatformKraIntegrationEnabled({ finance: form }, capabilities);
  const mpesaAllowed = isPlatformMpesaStkEnabled({ finance: form }, capabilities);
  const visibleTabs = useMemo(() => {
    const tabs = [];
    if (kraAllowed) tabs.push({ id: "kra", label: "Tax receipts (KRA)" });
    if (mpesaAllowed) tabs.push({ id: "mpesa", label: "M-Pesa payments" });
    tabs.push({ id: "alerts", label: "Customer alerts" });
    return tabs;
  }, [kraAllowed, mpesaAllowed]);

  const hasFinanceContent = visibleTabs.length > 0;

  useSettingsSubTab(activeTab, setActiveTab, visibleTabs);

  async function runKraDeviceAction(path, setLoading) {
    setLoading(true);
    setKraHealthResult(null);
    setError(null);
    try {
      const res = await apiRequest(path, {
        method: "POST",
        body: kraDeviceOpsPayloadFromForm(form),
      });
      setKraHealthResult({
        ok: Boolean(res.success),
        message: res.message ?? (res.success ? "Request completed." : "KRA device request failed."),
        httpStatus: res.http_status,
        url: res.url,
        deviceConnection: res.device_connection,
        apiService: res.api_service,
      });
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "KRA device request failed.";
      setKraHealthResult({ ok: false, message });
    } finally {
      setLoading(false);
    }
  }

  async function testKraDeviceHealth() {
    await runKraDeviceAction("/kra/device-health", setKraHealthTesting);
  }

  async function initializeKraDevice() {
    await runKraDeviceAction("/kra/device-init", setKraInitTesting);
  }

  async function restartKraDevice() {
    const ok = await confirm({
      title: "Restart fiscal device",
      message: "Restart the on-prem fiscal device? Sales will be interrupted briefly.",
      confirmLabel: "Restart",
      destructive: true,
    });
    if (!ok) return;
    await runKraDeviceAction("/kra/device-restart", setKraRestartTesting);
  }

  async function saveFinanceSettings() {
    setSaving(true);
    setError(null);
    try {
      const res = await apiRequest(settingsPath("finance"), {
        method: "PATCH",
        body: financePayloadFromForm(form, { includeMpesa: mpesaAllowed, includeAccounting: false }),
      });
      setForm(financeFormFromApi(res));

      await apiRequest(settingsPath("notifications"), {
        method: "PATCH",
        body: financeDebtorAlertPayloadFromForm(alertForm),
      });
      const notificationsRes = await apiRequest(settingsPath("notifications"));
      setAlertForm(notificationsFormFromApi(notificationsRes));

      if (afterSave) await afterSave();
      notifySuccess("Finance settings saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save finance settings");
    } finally {
      setSaving(false);
    }
  }

  const mpesaStatus = form.mpesa_status;
  const mpesa = form.mpesa ?? {};

  return (
    <section className="theme-panel rounded-xl border p-6 shadow-sm">
      <h2 className="theme-heading text-lg font-medium">Finance settings</h2>
      <p className="theme-subtext mt-1 text-sm">Organization-level payment and fiscal configuration.</p>
      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : !hasFinanceContent ? (
        <p className="mt-4 text-sm text-slate-500">No finance settings are available for this organization.</p>
      ) : (
        <div className="mt-5 space-y-5">
          <SettingsSubTabBar
            tabs={visibleTabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            ariaLabel="Finance settings"
          />

          {activeTab === "kra" && kraAllowed ? (
          <div>
            <p className="theme-subtext text-sm">
              Connect your on-prem KRA fiscal device and choose when completed sales are signed through it.
            </p>
            <div className="mt-3 space-y-3">
              <Toggle
                label="KRA device configured"
                description="Stores device IP, serial number, and shop PIN. Required before connection checks or PLU registration."
                checked={Boolean(form.enable_kra_device)}
                onChange={(v) => setForm((f) => ({ ...f, enable_kra_device: v }))}
              />
              {form.enable_kra_device ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Device IP / URL">
                    <input
                      className={inputClassName()}
                      value={form.kra_device_ip}
                      onChange={(e) => setForm((f) => ({ ...f, kra_device_ip: e.target.value }))}
                      placeholder="192.168.1.50:8010 or https://kramoonstores.example.com"
                    />
                  </Field>
                  <Field label="Fiscal hardware IP (Smart VSCU)">
                    <input
                      className={inputClassName()}
                      value={form.kra_device_hardware_ip}
                      onChange={(e) => setForm((f) => ({ ...f, kra_device_hardware_ip: e.target.value }))}
                      placeholder="192.168.1.39"
                    />
                    <p className="theme-subtext mt-1 text-xs">
                      LAN address of the fiscal device. Required for Initialize / Restart when the API URL above is a
                      hostname, not an IP.
                    </p>
                  </Field>
                  <Field label="Device serial number (SN)">
                    <input
                      className={inputClassName()}
                      value={form.kra_serial_number}
                      onChange={(e) => setForm((f) => ({ ...f, kra_serial_number: e.target.value }))}
                    />
                  </Field>
                  <Field label="Shop KRA PIN">
                    <input
                      className={inputClassName()}
                      value={form.kra_pin_number}
                      onChange={(e) => setForm((f) => ({ ...f, kra_pin_number: e.target.value.toUpperCase() }))}
                    />
                  </Field>
                  <Field label="PLU register path">
                    <input
                      className={inputClassName()}
                      value={form.kra_plu_register_path}
                      onChange={(e) => setForm((f) => ({ ...f, kra_plu_register_path: e.target.value }))}
                      placeholder="/api/upload-plu-data"
                    />
                  </Field>
                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-[220px] flex-1">
                        <Toggle
                          label="Test mode on device"
                          checked={Boolean(form.kra_device_test_mode)}
                          onChange={(v) => setForm((f) => ({ ...f, kra_device_test_mode: v }))}
                        />
                      </div>
                      <button
                        type="button"
                        disabled={kraHealthTesting || !form.kra_device_ip.trim()}
                        onClick={() => void testKraDeviceHealth()}
                        className={`${SECONDARY_BTN_CLASS} px-3.5 py-2 disabled:opacity-50`}
                      >
                        {kraHealthTesting ? "Testing…" : "Test connection"}
                      </button>
                      <button
                        type="button"
                        disabled={kraInitTesting || !form.kra_device_ip.trim() || !form.kra_serial_number.trim()}
                        onClick={() => void initializeKraDevice()}
                        className={`${SECONDARY_BTN_CLASS} px-3.5 py-2 disabled:opacity-50`}
                      >
                        {kraInitTesting ? "Initializing…" : "Initialize device"}
                      </button>
                      <button
                        type="button"
                        disabled={kraRestartTesting || !form.kra_device_ip.trim()}
                        onClick={() => void restartKraDevice()}
                        className={`${SECONDARY_BTN_CLASS} px-3.5 py-2 disabled:opacity-50`}
                      >
                        {kraRestartTesting ? "Restarting…" : "Restart device"}
                      </button>
                    </div>
                    {kraHealthResult ? (
                      <div
                        className={`text-sm ${kraHealthResult.ok ? "text-emerald-700" : "text-red-700"}`}
                      >
                        <p>
                          {kraHealthResult.message}
                          {kraHealthResult.httpStatus ? ` (HTTP ${kraHealthResult.httpStatus})` : ""}
                        </p>
                        {kraHealthResult.deviceConnection ? (
                          <p className="theme-subtext mt-1 text-xs">
                            Device connection: {kraHealthResult.deviceConnection}
                            {kraHealthResult.apiService ? ` · API: ${kraHealthResult.apiService}` : ""}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="theme-subtext text-xs">
                        <strong>Test connection</strong> calls{" "}
                        <code className="rounded bg-slate-100 px-1 py-0.5">GET /api/health</code>.{" "}
                        <strong>Initialize</strong> calls{" "}
                        <code className="rounded bg-slate-100 px-1 py-0.5">POST /api/init</code> (serial + hardware IP).{" "}
                        <strong>Restart</strong> calls{" "}
                        <code className="rounded bg-slate-100 px-1 py-0.5">POST /api/restart-device</code>.
                      </p>
                    )}
                  </div>
                </div>
              ) : null}
              {form.enable_kra_device ? (
                <>
                  <Toggle
                    label="Use KRA device for sales"
                    description="When on, completed sales are signed through the device (unless bypassed below). When off, sales use normal VAT calculations without calling the device."
                    checked={Boolean(form.default_submit_kra)}
                    onChange={(v) => setForm((f) => ({ ...f, default_submit_kra: v }))}
                  />
                  <Field label="Bypass KRA for orders at or above (KES)">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className={inputClassName()}
                      value={form.kra_bypass_above_amount ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, kra_bypass_above_amount: e.target.value }))
                      }
                      placeholder="e.g. 50000"
                    />
                    <p className="theme-subtext mt-1 text-xs">
                      Leave blank to always fiscalize eligible sales. Example: 50000 skips KRA when the order total
                      is KES 50,000 or more.
                    </p>
                  </Field>
                </>
              ) : null}
            </div>
          </div>
          ) : null}

          {activeTab === "mpesa" && mpesaAllowed ? (
          <div>
            <p className="theme-subtext text-sm">
              Set up Safaricom Daraja for paybill, till, and STK push at checkout.
            </p>

            {mpesaStatus ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium uppercase">
                  {mpesaStatus.env ?? "sandbox"}
                </span>
                {mpesaStatus.shortcode ? (
                  <span>
                    Shortcode / till: <strong>{mpesaStatus.shortcode}</strong>
                  </span>
                ) : null}
                <span
                  className={
                    mpesaStatus.ready
                      ? "rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800"
                      : "rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800"
                  }
                >
                  {mpesaStatus.ready ? "Configured" : "Incomplete"}
                </span>
              </div>
            ) : null}

            <div className="mt-4">
              <Toggle
                label="Enable STK push at POS"
                description="When enabled, cashiers can send Lipa na M-Pesa STK prompts from the POS payment dialog. When disabled, only manual paybill / check payment is available."
                checked={mpesa.enable_stk_push !== false}
                onChange={(v) => setMpesa("enable_stk_push", v)}
              />
            </div>

            <div className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <Toggle
                label="Enable paybill / till reconciliation"
                description="Match incoming C2B M-Pesa payments to sales orders using the account reference customers enter at paybill or till. Unmatched payments appear on Accounting → M-Pesa reconciliation."
                checked={Boolean(mpesa.enable_c2b_reconciliation)}
                onChange={(v) => setMpesa("enable_c2b_reconciliation", v)}
              />
              {mpesa.enable_c2b_reconciliation ? (
                <>
                  <Toggle
                    label="Auto-apply when order reference matches"
                    description="When a customer pays with their order number (e.g. S12) and the amount matches the balance, apply the payment automatically. Lower-confidence matches stay in the reconciliation queue."
                    checked={mpesa.auto_apply_order_reference !== false}
                    onChange={(v) => setMpesa("auto_apply_order_reference", v)}
                  />
                  <Field label="Customer account reference hint">
                    <input
                      className={inputClassName()}
                      value={mpesa.payment_account_hint ?? ""}
                      onChange={(e) => setMpesa("payment_account_hint", e.target.value)}
                      placeholder="Enter your order number (e.g. S12)"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Tell customers what to enter in the paybill account number field. Use your order number format, e.g. S12 for order #12.
                    </p>
                  </Field>
                </>
              ) : null}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Environment">
                <select
                  className={inputClassName()}
                  value={mpesa.env ?? "sandbox"}
                  onChange={(e) => setMpesa("env", e.target.value)}
                >
                  <option value="sandbox">Sandbox</option>
                  <option value="live">Live</option>
                </select>
              </Field>
              <Field label="Consumer key">
                <input
                  className={inputClassName()}
                  value={mpesa.consumer_key ?? ""}
                  onChange={(e) => setMpesa("consumer_key", e.target.value)}
                />
              </Field>
              <Field label="Consumer secret">
                <input
                  type="password"
                  className={inputClassName()}
                  value={mpesa.consumer_secret ?? ""}
                  onChange={(e) => setMpesa("consumer_secret", e.target.value)}
                  placeholder="Leave blank to keep existing"
                />
              </Field>
              <Field label="Passkey (Lipa na M-Pesa)">
                <input
                  type="password"
                  className={inputClassName()}
                  value={mpesa.passkey ?? ""}
                  onChange={(e) => setMpesa("passkey", e.target.value)}
                  placeholder="Leave blank to keep existing"
                />
              </Field>
              <Field label="Paybill shortcode (STK)">
                <input
                  className={inputClassName()}
                  value={mpesa.shortcode ?? ""}
                  onChange={(e) => setMpesa("shortcode", e.target.value)}
                />
              </Field>
              <Field label="Till number (PartyB)">
                <input
                  className={inputClassName()}
                  value={mpesa.till_number ?? ""}
                  onChange={(e) => setMpesa("till_number", e.target.value)}
                />
              </Field>
              <Field label="C2B paybill / till shortcode">
                <input
                  className={inputClassName()}
                  value={mpesa.child_storecode ?? ""}
                  onChange={(e) => setMpesa("child_storecode", e.target.value)}
                  placeholder="Same as registered on Daraja"
                />
              </Field>
            </div>

            <div className="mt-4 space-y-3">
              <UrlField
                label="C2B confirmation URL (register on Daraja)"
                value={mpesa.c2b_confirmation_url ?? ""}
                onChange={(v) => setMpesa("c2b_confirmation_url", v)}
                placeholder="https://your-api.example.com/api/v1/payments/c2b/confirmation"
              />
              <UrlField
                label="C2B validation URL (register on Daraja)"
                value={mpesa.c2b_validation_url ?? ""}
                onChange={(v) => setMpesa("c2b_validation_url", v)}
                placeholder="https://your-api.example.com/api/v1/payments/c2b/validation"
              />
              <UrlField
                label="STK push callback URL"
                value={mpesa.stk_callback_url ?? ""}
                onChange={(v) => setMpesa("stk_callback_url", v)}
                placeholder="https://your-api.example.com/api/v1/payments/stk/callback"
              />
            </div>

            {mpesaStatus?.issues?.length ? (
              <ul className="mt-3 list-disc space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {mpesaStatus.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : null}

            <p className="mt-3 text-xs text-slate-500">
              Branches can override till / shortcode under Admin → Branches. Incoming C2B payments are matched to this
              organization by paybill or till number.
            </p>
          </div>
          ) : null}

          {activeTab === "alerts" ? (
            <FinanceDebtorPaymentAlerts form={alertForm} setForm={setAlertForm} />
          ) : null}

          <PrimaryButton type="button" showIcon={false} disabled={saving} onClick={() => void saveFinanceSettings()}>
            {saving ? "Saving…" : "Save finance settings"}
          </PrimaryButton>
        </div>
      )}
    </section>
  );
}
