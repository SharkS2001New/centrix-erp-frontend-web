"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  financeFormFromApi,
  financePayloadFromForm,
  isPlatformKraIntegrationEnabled,
  isPlatformMpesaStkEnabled,
  kraDeviceOpsPayloadFromForm,
} from "@/lib/finance-settings";
import { Field, PrimaryButton, SECONDARY_BTN_CLASS, inputClassName, SearchableSelect } from "@/components/catalog/catalog-shared";
import { SettingsSubTabBar, useSettingsSubTab } from "@/components/admin/settings-sub-tabs";
import { useSettingsApi, useSettingsAfterSave, useSettingsGet } from "@/contexts/settings-api-context";
import { notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";
import { MpesaPaybillAccountsPanel } from "@/components/admin/mpesa-paybill-accounts-panel";
import { EquityBankAccountsPanel } from "@/components/admin/equity-bank-accounts-panel";
import { fetchBranchesCached, fetchRoutesCached } from "@/lib/reference-data-cache";

/** @typedef {"all" | "kra" | "mpesa" | "paybills" | "equity"} FinanceSettingsMode */

function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-4 py-3">
      <input type="checkbox" className="mt-1" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} />
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

/**
 * @param {{
 *   saving: boolean,
 *   setSaving: (v: boolean) => void,
 *   setError: (msg: string | null) => void,
 *   setMessage?: (msg: string | null) => void,
 *   capabilities?: object,
 *   onAfterSave?: () => void | Promise<void>,
 *   mode?: FinanceSettingsMode,
 *   title?: string,
 *   subtitle?: string,
 * }} props
 */
export function FinanceSettingsPanel({
  saving,
  setSaving,
  setError,
  setMessage,
  capabilities: capabilitiesProp,
  onAfterSave,
  mode = "all",
  title = "Finance settings",
  subtitle = "Organization-level payment and fiscal configuration. Customer payment SMS/email alerts are under Messaging → Customer alerts.",
}) {
  const confirm = useConfirm();
  const { capabilities: authCapabilities } = useAuth();
  const capabilities = capabilitiesProp ?? authCapabilities;
  const { settingsPath, bumpSettingsSaveGen } = useSettingsApi();
  const afterSave = useSettingsAfterSave(onAfterSave);
  const getSettings = useSettingsGet();
  const [form, setForm] = useState(financeFormFromApi({}));
  const [loading, setLoading] = useState(true);
  const [kraHealthTesting, setKraHealthTesting] = useState(false);
  const [kraInitTesting, setKraInitTesting] = useState(false);
  const [kraRestartTesting, setKraRestartTesting] = useState(false);
  const [kraHealthResult, setKraHealthResult] = useState(null);
  const [activeTab, setActiveTab] = useState(
    mode === "mpesa" || mode === "paybills" ? "mpesa" : mode === "equity" ? "equity" : "kra",
  );
  const [paybillBranches, setPaybillBranches] = useState([]);
  const [paybillRoutes, setPaybillRoutes] = useState([]);
  const [paybillTills, setPaybillTills] = useState([]);
  const [accountsRefreshKey, setAccountsRefreshKey] = useState(0);

  const needsFinanceForm = mode !== "paybills";
  const needsPaybillRefs = mode === "all" || mode === "mpesa" || mode === "paybills" || mode === "equity";

  useEffect(() => {
    if (!needsFinanceForm) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getSettings("finance")
      .then((res) => {
        if (cancelled || !res) return;
        setForm(financeFormFromApi(res));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Failed to load finance settings");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getSettings, setError, needsFinanceForm]);

  useEffect(() => {
    if (!needsPaybillRefs) return;
    let cancelled = false;
    Promise.all([
      fetchBranchesCached().catch(() => []),
      fetchRoutesCached().catch(() => []),
      apiRequest("/tills", { loading: false, searchParams: { per_page: 200 } }).catch(() => null),
    ]).then(([branches, routes, tillsRes]) => {
      if (cancelled) return;
      setPaybillBranches(Array.isArray(branches) ? branches : []);
      setPaybillRoutes(Array.isArray(routes) ? routes : []);
      const tillRows = tillsRes?.data ?? tillsRes ?? [];
      setPaybillTills(Array.isArray(tillRows) ? tillRows : []);
    });
    return () => {
      cancelled = true;
    };
  }, [needsPaybillRefs]);

  function setMpesa(field, value) {
    setForm((f) => ({ ...f, mpesa: { ...f.mpesa, [field]: value } }));
  }

  function setEquity(field, value) {
    setForm((f) => ({ ...f, equity: { ...(f.equity ?? {}), [field]: value } }));
  }

  const kraAllowed = isPlatformKraIntegrationEnabled({ finance: form }, capabilities);
  const mpesaAllowed = isPlatformMpesaStkEnabled({ finance: form }, capabilities);
  const showKra = (mode === "all" || mode === "kra") && kraAllowed;
  const showMpesa = (mode === "all" || mode === "mpesa") && mpesaAllowed;
  const showEquity = mode === "all" || mode === "equity";
  const showPaybills = (mode === "all" || mode === "mpesa" || mode === "paybills") && mpesaAllowed;
  const useSubTabs = mode === "all";

  const visibleTabs = useMemo(() => {
    if (!useSubTabs) return [];
    const tabs = [];
    if (kraAllowed) tabs.push({ id: "kra", label: "Tax receipts (KRA)" });
    if (mpesaAllowed) tabs.push({ id: "mpesa", label: "M-Pesa payments" });
    tabs.push({ id: "equity", label: "Equity Bank" });
    return tabs;
  }, [kraAllowed, mpesaAllowed, useSubTabs]);

  const hasFinanceContent =
    mode === "paybills"
      ? showPaybills
      : mode === "kra"
        ? showKra
        : mode === "mpesa"
          ? showMpesa
          : mode === "equity"
            ? showEquity
            : visibleTabs.length > 0;

  useSettingsSubTab(activeTab, setActiveTab, useSubTabs ? visibleTabs : []);

  async function runKraDeviceAction(path, setBusy) {
    setBusy(true);
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
      setBusy(false);
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
    bumpSettingsSaveGen?.();
    try {
      const includeMpesa = mode === "all" || mode === "mpesa";
      const includeEquity = mode === "all" || mode === "equity";
      const payload = financePayloadFromForm(form, {
        includeMpesa: includeMpesa && mpesaAllowed,
        includeEquity,
        includeAccounting: false,
      });
      const res = await apiRequest(settingsPath("finance"), {
        method: "PATCH",
        body: payload,
      });
      const saved = financeFormFromApi(res);
      setForm({
        ...saved,
        enable_kra_device: Boolean(payload.enable_kra_device),
        default_submit_kra: Boolean(payload.default_submit_kra),
        kra_device_test_mode: Boolean(payload.kra_device_test_mode),
        kra_bypass_above_amount:
          payload.kra_bypass_above_amount == null ? "" : String(payload.kra_bypass_above_amount),
        kra_device_ip: payload.kra_device_ip,
        kra_device_hardware_ip: payload.kra_device_hardware_ip,
        kra_serial_number: payload.kra_serial_number,
        kra_plu_register_path: payload.kra_plu_register_path,
      });

      if (afterSave) await afterSave();
      setAccountsRefreshKey((k) => k + 1);
      const successLabel =
        mode === "kra"
          ? "KRA settings saved."
          : mode === "mpesa"
            ? "M-Pesa settings saved. Open a paybill below to set per-paybill Daraja keys."
            : mode === "equity"
              ? "Equity settings saved. Open an account below to set per-account callback details."
              : "Finance settings saved.";
      notifySuccess(successLabel);
      setMessage?.(successLabel);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save finance settings");
    } finally {
      setSaving(false);
    }
  }

  const mpesaStatus = form.mpesa_status;
  const mpesa = form.mpesa ?? {};
  const equity = form.equity ?? {};
  const renderKra = showKra && (!useSubTabs || activeTab === "kra");
  const renderMpesa = showMpesa && (!useSubTabs || activeTab === "mpesa");
  const renderEquity = showEquity && (!useSubTabs || activeTab === "equity");
  const renderPaybillsInline = showPaybills && mode !== "paybills" && renderMpesa;

  return (
    <section className="theme-panel rounded-xl border p-6 shadow-sm">
      <h2 className="theme-heading text-lg font-medium">{title}</h2>
      <p className="theme-subtext mt-1 text-sm">{subtitle}</p>
      {loading && needsFinanceForm ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : !hasFinanceContent ? (
        <p className="mt-4 text-sm text-slate-500">No finance settings are available for this organization.</p>
      ) : (
        <div className="mt-5 space-y-5">
          {useSubTabs ? (
            <SettingsSubTabBar
              tabs={visibleTabs}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              ariaLabel="Finance settings"
            />
          ) : null}

          {renderKra ? (
            <div>
              {mode === "all" ? (
                <p className="theme-subtext text-sm">
                  Connect your on-prem KRA fiscal device and choose when completed sales are signed through it.
                </p>
              ) : null}
              <div className={`${mode === "all" ? "mt-3" : ""} space-y-3`}>
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
                        <div className={`text-sm ${kraHealthResult.ok ? "text-emerald-700" : "text-red-700"}`}>
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
                          <code className="rounded bg-slate-100 px-1 py-0.5">POST /api/init</code> (serial + hardware
                          IP). <strong>Restart</strong> calls{" "}
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
                        onChange={(e) => setForm((f) => ({ ...f, kra_bypass_above_amount: e.target.value }))}
                        placeholder="e.g. 50000"
                      />
                      <p className="theme-subtext mt-1 text-xs">
                        Leave blank to always fiscalize eligible sales. Example: 50000 skips KRA when the order total is
                        KES 50,000 or more.
                      </p>
                    </Field>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

          {renderMpesa ? (
            <div>
              {mode === "all" ? (
                <p className="theme-subtext text-sm">
                  Set up Safaricom Daraja for paybill, till, and STK push at checkout.
                </p>
              ) : null}

              {mpesaStatus ? (
                <div className={`${mode === "all" ? "mt-3" : ""} flex flex-wrap items-center gap-2 text-xs text-slate-600`}>
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
                        Tell customers what to enter in the paybill account number field. Use your order number format,
                        e.g. S12 for order #12.
                      </p>
                    </Field>
                  </>
                ) : null}
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2 rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2 text-xs text-sky-950">
                  <strong>Organization default Daraja app.</strong> These credentials apply to every paybill
                  that does not set its own keys. To use a different Safaricom app per paybill, select that
                  paybill in <em>Saved paybills</em> below and fill its Daraja section.
                </div>
                <Field label="Environment">
                  <SearchableSelect
                    className={inputClassName()}
                    value={mpesa.env ?? "sandbox"}
                    nativeEvent
                    onChange={(e) => setMpesa("env", e.target.value)}
                    options={[
                      { value: "sandbox", label: "Sandbox" },
                      { value: "live", label: "Live" },
                    ]}
                  />
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
                <Field label="Default paybill shortcode (STK)">
                  <input
                    className={inputClassName()}
                    value={mpesa.shortcode ?? ""}
                    onChange={(e) => setMpesa("shortcode", e.target.value)}
                  />
                </Field>
                <Field label="Default till number (PartyB)">
                  <input
                    className={inputClassName()}
                    value={mpesa.till_number ?? ""}
                    onChange={(e) => setMpesa("till_number", e.target.value)}
                  />
                </Field>
                <Field label="Default C2B paybill / till shortcode">
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
                  label="Default C2B confirmation URL (register on Daraja)"
                  value={mpesa.c2b_confirmation_url ?? ""}
                  onChange={(v) => setMpesa("c2b_confirmation_url", v)}
                  placeholder="https://your-api.example.com/api/v1/payments/c2b/confirmation"
                />
                <UrlField
                  label="Default C2B validation URL (register on Daraja)"
                  value={mpesa.c2b_validation_url ?? ""}
                  onChange={(v) => setMpesa("c2b_validation_url", v)}
                  placeholder="https://your-api.example.com/api/v1/payments/c2b/validation"
                />
                <UrlField
                  label="Default STK push callback URL"
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

              {renderPaybillsInline ? (
                <>
                  <p className="mt-3 text-xs text-slate-500">
                    Saved paybills appear in the list below. Select one to set its own Daraja consumer key and
                    callback URLs, or leave those blank to use the organization defaults above.
                  </p>
                  <MpesaPaybillAccountsPanel
                    branches={paybillBranches}
                    routes={paybillRoutes}
                    tills={paybillTills}
                    setError={setError}
                    refreshKey={accountsRefreshKey}
                  />
                </>
              ) : mode === "mpesa" ? (
                <p className="mt-3 text-xs text-slate-500">
                  Manage route and shop paybills (including per-paybill Daraja keys) under{" "}
                  <a href="/admin/mpesa-paybills" className="font-medium text-[var(--theme-primary)] underline">
                    M-Pesa Paybills
                  </a>
                  .
                </p>
              ) : null}
            </div>
          ) : null}

          {mode === "paybills" && showPaybills ? (
            <div>
              <p className="theme-subtext text-sm">
                Saved paybills are listed below after you add them. Organization-wide Daraja defaults live under{" "}
                <a href="/admin/mpesa-settings" className="font-medium text-[var(--theme-primary)] underline">
                  M-Pesa settings
                </a>
                ; select a paybill here to override keys and callback URLs for that shortcode only.
              </p>
              <div className="mt-4">
                <MpesaPaybillAccountsPanel
                  branches={paybillBranches}
                  routes={paybillRoutes}
                  tills={paybillTills}
                  setError={setError}
                  refreshKey={accountsRefreshKey}
                />
              </div>
            </div>
          ) : null}

          {renderEquity ? (
            <div className="space-y-4">
              <Toggle
                label="Enable Equity paybill reconciliation"
                description="Store Equity callback payments and match them to open orders (Accounting → Equity reconciliation)."
                checked={Boolean(equity.enable_paybill_reconciliation)}
                onChange={(v) => setEquity("enable_paybill_reconciliation", v)}
              />
              {equity.enable_paybill_reconciliation ? (
                <>
                  <Toggle
                    label="Auto-apply high-confidence order references"
                    description="When BillRef is an order number (e.g. S12) and the amount fits, apply as Equity automatically."
                    checked={equity.auto_apply_order_reference !== false}
                    onChange={(v) => setEquity("auto_apply_order_reference", v)}
                  />
                  <Field label="Customer account / BillRef hint">
                    <input
                      className={inputClassName()}
                      value={equity.payment_account_hint ?? ""}
                      onChange={(e) => setEquity("payment_account_hint", e.target.value)}
                      placeholder="Enter your order number (e.g. S12)"
                    />
                  </Field>
                </>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="md:col-span-2 rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2 text-xs text-sky-950">
                  <strong>Organization default Equity callback.</strong> Per-account callback URL / secret are
                  set by selecting an account in <em>Saved Equity accounts</em> below.
                </div>
                <Field label="Default primary account / paybill">
                  <input
                    className={inputClassName()}
                    value={equity.primary_account_number ?? ""}
                    onChange={(e) => setEquity("primary_account_number", e.target.value)}
                  />
                </Field>
                <Field label="Paybill number (alias)">
                  <input
                    className={inputClassName()}
                    value={equity.paybill_number ?? ""}
                    onChange={(e) => setEquity("paybill_number", e.target.value)}
                  />
                </Field>
                <Field label="Account number (alias)">
                  <input
                    className={inputClassName()}
                    value={equity.account_number ?? ""}
                    onChange={(e) => setEquity("account_number", e.target.value)}
                  />
                </Field>
                <UrlField
                  label="Default callback URL (documented for Equity)"
                  value={equity.callback_url ?? ""}
                  onChange={(v) => setEquity("callback_url", v)}
                  placeholder="https://…/api/v1/payments/equity/confirmation"
                />
                <Field label="Default callback shared secret (optional)">
                  <input
                    className={inputClassName()}
                    type="password"
                    value={equity.callback_shared_secret ?? ""}
                    onChange={(e) => setEquity("callback_shared_secret", e.target.value)}
                    placeholder="X-Equity-Secret header"
                  />
                </Field>
              </div>
              <EquityBankAccountsPanel
                branches={paybillBranches}
                routes={paybillRoutes}
                setError={setError}
                refreshKey={accountsRefreshKey}
              />
            </div>
          ) : null}

          {needsFinanceForm && hasFinanceContent ? (
            <PrimaryButton type="button" showIcon={false} disabled={saving} onClick={() => void saveFinanceSettings()}>
              {saving
                ? "Saving…"
                : mode === "kra"
                  ? "Save KRA settings"
                  : mode === "mpesa"
                    ? "Save M-Pesa settings"
                    : mode === "equity"
                      ? "Save Equity settings"
                      : "Save finance settings"}
            </PrimaryButton>
          ) : null}
        </div>
      )}
    </section>
  );
}
