"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  financeFormFromApi,
  financePayloadFromForm,
  ensureKraAgentMode,
  kraAgentSettingsFingerprint,
  canDownloadKraAgent,
  isPlatformKraIntegrationEnabled,
  isPlatformMpesaStkEnabled,
  isPlatformEquityBankEnabled,
  kraDeviceOpsPayloadFromForm,
} from "@/lib/finance-settings";
import { Field, PrimaryButton, SECONDARY_BTN_CLASS, inputClassName, SearchableSelect } from "@/components/catalog/catalog-shared";
import { SettingsSubTabBar, useSettingsSubTab, useSettingsSectionUrl } from "@/components/admin/settings-sub-tabs";
import { useSettingsApi, useSettingsAfterSave, useSettingsGet } from "@/contexts/settings-api-context";
import { notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";
import { MpesaPaybillAccountsPanel } from "@/components/admin/mpesa-paybill-accounts-panel";
import { EquityBankAccountsPanel } from "@/components/admin/equity-bank-accounts-panel";
import { resolveMpesaSettingsHref } from "@/lib/centrix-payments-routes";
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
  const mpesaSettingsHref = resolveMpesaSettingsHref();
  const { settingsPath, bumpSettingsSaveGen } = useSettingsApi();
  const afterSave = useSettingsAfterSave(onAfterSave);
  const getSettings = useSettingsGet();
  const [form, setForm] = useState(financeFormFromApi({}));
  const [loading, setLoading] = useState(true);
  const [kraHealthTesting, setKraHealthTesting] = useState(false);
  const [kraInitTesting, setKraInitTesting] = useState(false);
  const [kraRestartTesting, setKraRestartTesting] = useState(false);
  const [kraAgentDownloading, setKraAgentDownloading] = useState(false);
  const [kraAgentStatus, setKraAgentStatus] = useState(null);
  const [kraSavedFingerprint, setKraSavedFingerprint] = useState(null);
  const [kraHealthResult, setKraHealthResult] = useState(null);
  const [activeTab, setActiveTab] = useState(() => {
    if (mode === "paybills") return "paybills";
    if (mode === "mpesa") return "mpesa";
    if (mode === "equity") return "equity";
    if (mode === "kra") return "kra";
    return "kra";
  });
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
        const next = financeFormFromApi(res);
        setForm(next);
        setKraSavedFingerprint(kraAgentSettingsFingerprint(next));
        if (next.enable_kra_device) {
          void refreshKraAgentStatus();
        }
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
  const equityAllowed = isPlatformEquityBankEnabled({ finance: form }, capabilities);
  const showKra = (mode === "all" || mode === "kra") && kraAllowed;
  const showMpesa = (mode === "all" || mode === "mpesa") && mpesaAllowed;
  const showEquity = (mode === "all" || mode === "equity") && equityAllowed;
  const showPaybills = (mode === "all" || mode === "mpesa" || mode === "paybills") && mpesaAllowed;
  const showEquityAccounts = (mode === "all" || mode === "equity") && equityAllowed;
  const useSubTabs = mode === "all" || mode === "mpesa" || mode === "equity";

  const visibleTabs = useMemo(() => {
    if (mode === "mpesa") {
      if (!mpesaAllowed) return [];
      return [
        { id: "mpesa", label: "Daraja defaults" },
        { id: "paybills", label: "Saved M-Pesa accounts" },
      ];
    }
    if (mode === "equity") {
      if (!equityAllowed) return [];
      return [
        { id: "equity", label: "Equity defaults" },
        { id: "equity_accounts", label: "Saved Equity accounts" },
      ];
    }
    if (mode !== "all") return [];
    const tabs = [];
    if (kraAllowed) tabs.push({ id: "kra", label: "Tax receipts (KRA)" });
    if (mpesaAllowed) {
      tabs.push({ id: "mpesa", label: "M-Pesa defaults" });
      tabs.push({ id: "paybills", label: "Saved M-Pesa accounts" });
    }
    if (equityAllowed) {
      tabs.push({ id: "equity", label: "Equity defaults" });
      tabs.push({ id: "equity_accounts", label: "Saved Equity accounts" });
    }
    return tabs;
  }, [kraAllowed, mpesaAllowed, equityAllowed, mode]);

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
  const onSubTabChange = useSettingsSectionUrl(activeTab, setActiveTab, useSubTabs ? visibleTabs : []);

  async function runKraDeviceAction(path, setBusy) {
    setBusy(true);
    setKraHealthResult(null);
    setError(null);
    try {
      const res = await apiRequest(path, {
        method: "POST",
        body: kraDeviceOpsPayloadFromForm(form),
        loading: false,
        reportIssues: false,
      });
      const message = String(
        res.message ||
          res.detail ||
          res.device_status_message ||
          (res.success ? "Request completed." : "KRA device request failed."),
      ).trim();
      setKraHealthResult({
        ok: Boolean(res.success),
        message,
        detail: typeof res.detail === "string" ? res.detail : null,
        httpStatus: res.http_status,
        url: res.url,
        deviceConnection: res.device_connection,
        apiService: res.api_service,
        viaAgent: Boolean(res.via_agent),
        manualStartRequired: Boolean(res.manual_start_required),
        comstoreOk: res.comstore_ok,
        deviceOk: res.device_ok,
        deviceHardwareIp: res.device_hardware_ip || form.kra_device_hardware_ip || null,
        devicePingOk: res.device_ping_ok,
        deviceStatusMessage: res.device_status_message || null,
      });
      void refreshKraAgentStatus();
    } catch (e) {
      const body = e instanceof ApiError && e.body && typeof e.body === "object" ? e.body : null;
      const fromBody =
        (body && typeof body.message === "string" && body.message.trim()) ||
        (body && typeof body.detail === "string" && body.detail.trim()) ||
        "";
      // Never show the generic Centrix-cloud DNS toast as if it were a Comstore error.
      const isCloudNetwork =
        (e instanceof ApiError && e.body?.code === "network_unavailable") ||
        /please check your internet connection/i.test(String(e?.message ?? ""));
      const message = fromBody
        ? fromBody
        : isCloudNetwork
          ? "Could not reach the Centrix API (network/DNS). This is not a Comstore error — check internet on this computer, then retry Test connection."
          : e instanceof ApiError
            ? e.message
            : "KRA device request failed.";
      setKraHealthResult({
        ok: false,
        message,
        detail: typeof body?.detail === "string" ? body.detail : null,
        httpStatus: body?.http_status ?? (e instanceof ApiError ? e.status : undefined),
        url: body?.url,
        deviceConnection: body?.device_connection,
        apiService: body?.api_service,
        viaAgent: Boolean(body?.via_agent),
        manualStartRequired: Boolean(body?.manual_start_required),
        comstoreOk: body?.comstore_ok,
        deviceOk: body?.device_ok,
        deviceHardwareIp: body?.device_hardware_ip || form.kra_device_hardware_ip || null,
        devicePingOk: body?.device_ping_ok,
        deviceStatusMessage: body?.device_status_message || null,
      });
      void refreshKraAgentStatus();
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

  async function refreshKraAgentStatus() {
    try {
      const res = await apiRequest("/kra/agent/status", { loading: false, reportIssues: false });
      setKraAgentStatus(res);
    } catch {
      setKraAgentStatus(null);
    }
  }

  async function downloadKraAgent() {
    if (!canDownloadKraAgent(form, kraSavedFingerprint)) {
      setError("Save KRA settings first (Comstore URL, serial, and PIN), then download the agent.");
      return;
    }
    setKraAgentDownloading(true);
    setError(null);
    try {
      const issued = await apiRequest("/kra/agent-package", { method: "POST" });
      const zipRes = await fetch("/api/kra-agent/package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: issued.config }),
      });
      if (!zipRes.ok) {
        const err = await zipRes.json().catch(() => ({}));
        throw new Error(err.message || "Could not package KRA agent zip.");
      }
      const blob = await zipRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "CentrixKraAgent.zip";
      a.click();
      URL.revokeObjectURL(url);
      notifySuccess("Centrix KRA Agent downloaded. Unzip on the shop PC and run BUILD-AND-INSTALL.bat as Administrator.");
      await refreshKraAgentStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "KRA agent download failed.");
    } finally {
      setKraAgentDownloading(false);
    }
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
      const nextForm = {
        ...saved,
        enable_kra_device: Boolean(payload.enable_kra_device),
        enable_kra_agent: true,
        default_submit_kra: Boolean(payload.default_submit_kra),
        kra_device_test_mode: Boolean(payload.kra_device_test_mode),
        kra_bypass_above_amount:
          payload.kra_bypass_above_amount == null ? "" : String(payload.kra_bypass_above_amount),
        kra_device_ip: payload.kra_device_ip,
        kra_direct_device_ip: payload.kra_direct_device_ip ?? saved.kra_direct_device_ip ?? "",
        kra_agent_comstore_url:
          payload.kra_agent_comstore_url ?? saved.kra_agent_comstore_url ?? "",
        kra_device_hardware_ip: payload.kra_device_hardware_ip,
        kra_serial_number: payload.kra_serial_number,
        kra_plu_register_path: payload.kra_plu_register_path,
      };
      setForm(nextForm);
      setKraSavedFingerprint(kraAgentSettingsFingerprint(nextForm));
      if (nextForm.enable_kra_device) {
        void refreshKraAgentStatus();
      }

      if (afterSave) await afterSave();
      setAccountsRefreshKey((k) => k + 1);
      const successLabel =
        mode === "kra"
          ? "KRA settings saved."
          : mode === "mpesa"
            ? "M-Pesa settings saved. Open the Saved M-Pesa accounts tab to set per-paybill Daraja keys."
            : mode === "equity"
              ? "Equity settings saved. Open the Saved Equity accounts tab for per-account callbacks."
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
  const renderKra = showKra && (mode === "all" || mode === "kra") && (!useSubTabs || activeTab === "kra");
  const renderMpesa =
    showMpesa && (mode === "all" || mode === "mpesa") && (!useSubTabs || activeTab === "mpesa");
  const renderEquity =
    showEquity && (mode === "all" || mode === "equity") && (!useSubTabs || activeTab === "equity");
  const renderPaybillsTab =
    showPaybills && (mode === "paybills" || (useSubTabs && activeTab === "paybills"));
  const renderEquityAccountsTab =
    showEquityAccounts && (useSubTabs ? activeTab === "equity_accounts" : false);
  const showOrgSaveButton =
    needsFinanceForm &&
    hasFinanceContent &&
    (activeTab === "kra" ||
      activeTab === "mpesa" ||
      activeTab === "equity" ||
      (!useSubTabs && mode !== "paybills"));

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
              onTabChange={onSubTabChange}
              ariaLabel={
                mode === "mpesa"
                  ? "M-Pesa sections"
                  : mode === "equity"
                    ? "Equity sections"
                    : "Finance settings"
              }
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
                description="Stores Centrix KRA Agent settings (Comstore URL, serial, and shop PIN). Required before connection checks or PLU registration."
                checked={Boolean(form.enable_kra_device)}
                onChange={(v) => {
                  setForm((f) => {
                    if (!v) return { ...f, enable_kra_device: false };
                    return ensureKraAgentMode({ ...f, enable_kra_device: true });
                  });
                  if (v) void refreshKraAgentStatus();
                  else setKraAgentStatus(null);
                }}
              />
              {form.enable_kra_device ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2 space-y-3">
                    <div>
                      <p className="theme-heading text-sm font-medium">Centrix KRA Agent</p>
                      <p className="theme-subtext mt-0.5 text-xs">
                        Download the agent package and run BUILD-AND-INSTALL.bat on the PC where Comstore
                        runs. That PC must stay awake (install sets Sleep = Never). Centrix cloud talks to
                        the agent, which calls local Comstore / Smart VSCU.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={kraAgentDownloading || !canDownloadKraAgent(form, kraSavedFingerprint)}
                        onClick={() => void downloadKraAgent()}
                        className={`${SECONDARY_BTN_CLASS} px-3.5 py-2 disabled:opacity-50`}
                        title={
                          canDownloadKraAgent(form, kraSavedFingerprint)
                            ? "Download Centrix KRA Agent"
                            : "Save KRA settings first, then download"
                        }
                      >
                        {kraAgentDownloading ? "Preparing…" : "Download Centrix KRA Agent"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void refreshKraAgentStatus()}
                        className={`${SECONDARY_BTN_CLASS} px-3.5 py-2`}
                      >
                        Refresh agent status
                      </button>
                      {!canDownloadKraAgent(form, kraSavedFingerprint) ? (
                        <p className="theme-subtext w-full text-xs">
                          Save KRA settings (Comstore URL, serial, and PIN) before downloading Centrix KRA
                          Agent.
                        </p>
                      ) : null}
                      {kraAgentStatus ? (
                          <div className="w-full space-y-1">
                            <p className="text-xs">
                              <span
                                className={
                                  kraAgentStatus.online
                                    ? "font-medium text-emerald-700"
                                    : "font-medium text-red-700"
                                }
                              >
                                Agent service {kraAgentStatus.online ? "online" : "offline"}
                              </span>
                              <span className="theme-subtext">
                                {kraAgentStatus.last_seen_at
                                  ? ` · last seen ${kraAgentStatus.last_seen_at}`
                                  : ""}
                                {kraAgentStatus.version ? ` · v${kraAgentStatus.version}` : ""}
                                {kraAgentStatus.comstore_reachable === true
                                  ? " · Comstore reachable"
                                  : kraAgentStatus.comstore_reachable === false
                                    ? " · Comstore needs manual start"
                                    : ""}
                                {kraAgentStatus.device_reachable === true
                                  ? " · Device online"
                                  : kraAgentStatus.device_reachable === false
                                    ? " · Device network error"
                                    : ""}
                              </span>
                            </p>
                            {kraAgentStatus.manual_start_required ||
                            kraAgentStatus.comstore_reachable === false ? (
                              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                                <p className="font-medium">
                                  Agent is still running — start Comstore manually
                                </p>
                                <p className="mt-1 text-xs leading-relaxed">
                                  {kraAgentStatus.message ||
                                    kraAgentStatus.comstore_status_message ||
                                    "CentrixKraAgent keeps running as a Windows service. Start Comstore via Windows startup or its own service (usually http://localhost:4000). The agent keeps pinging Centrix and the fiscal device until Comstore is up — then click Test connection again."}
                                </p>
                              </div>
                            ) : kraAgentStatus.device_network_error ||
                              kraAgentStatus.device_reachable === false ? (
                              <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-950">
                                <p className="font-medium">Fiscal device network error</p>
                                <p className="mt-1 text-xs leading-relaxed">
                                  {kraAgentStatus.device_status_message ||
                                    kraAgentStatus.message ||
                                    `Agent is online but cannot reach the Smart VSCU${
                                      kraAgentStatus.device_hardware_ip
                                        ? ` at ${kraAgentStatus.device_hardware_ip}`
                                        : ""
                                    }. Check power, LAN, and Fiscal hardware IP below.`}
                                </p>
                                {kraAgentStatus.device_connection ? (
                                  <p className="mt-1 text-xs text-rose-900/80">
                                    Comstore deviceConnection: {kraAgentStatus.device_connection}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                    </div>
                  </div>
                  <Field label="Agent Comstore URL">
                      <input
                        className={inputClassName()}
                        value={form.kra_device_ip}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            kra_device_ip: e.target.value,
                            kra_agent_comstore_url: e.target.value,
                          }))
                        }
                        placeholder="http://localhost:4000 or http://127.0.0.1:4000"
                      />
                      <p className="theme-subtext mt-1 text-xs">
                        Written into the agent config as the local Comstore address on the shop PC.
                        Usually <code className="text-[11px]">http://localhost:4000</code> — both{" "}
                        <code className="text-[11px]">localhost</code> and{" "}
                        <code className="text-[11px]">127.0.0.1</code> work.
                      </p>
                    </Field>
                  <Field label="Fiscal hardware IP (for agent)">
                    <input
                      className={inputClassName()}
                      value={form.kra_device_hardware_ip}
                      onChange={(e) => setForm((f) => ({ ...f, kra_device_hardware_ip: e.target.value }))}
                      placeholder="192.168.1.39"
                    />
                    <p className="theme-subtext mt-1 text-xs">
                      LAN address of the Smart VSCU. Centrix KRA Agent pings this IP on each heartbeat and
                      shows a device network error in Centrix when it is unreachable. Also used for
                      Initialize / Restart.
                    </p>
                  </Field>
                  <Field label="Device serial (agent / Comstore)">
                    <input
                      className={inputClassName()}
                      value={form.kra_serial_number}
                      onChange={(e) => setForm((f) => ({ ...f, kra_serial_number: e.target.value }))}
                    />
                    <p className="theme-subtext mt-1 text-xs">
                      Fiscal device serial used when Centrix KRA Agent runs Initialize through Comstore.
                    </p>
                  </Field>
                  <Field label="Shop KRA PIN (agent)">
                    <input
                      className={inputClassName()}
                      value={form.kra_pin_number}
                      onChange={(e) => setForm((f) => ({ ...f, kra_pin_number: e.target.value.toUpperCase() }))}
                    />
                    <p className="theme-subtext mt-1 text-xs">
                      Taxpayer PIN for fiscalization. Sent with sales Centrix KRA Agent submits to Comstore.
                    </p>
                  </Field>
                  <Field label="PLU path (via agent)">
                    <input
                      className={inputClassName()}
                      value={form.kra_plu_register_path}
                      onChange={(e) => setForm((f) => ({ ...f, kra_plu_register_path: e.target.value }))}
                      placeholder="/api/upload-plu-data"
                    />
                    <p className="theme-subtext mt-1 text-xs">
                      Comstore API path Centrix KRA Agent uses when uploading / registering products.
                    </p>
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
                        className={`text-sm ${
                          kraHealthResult.ok
                            ? "text-emerald-700"
                            : kraHealthResult.manualStartRequired
                              ? "text-amber-950"
                              : "text-red-700"
                        }`}
                      >
                        {kraHealthResult.manualStartRequired ? (
                          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
                            <p className="font-medium">
                              Agent is still running — start Comstore manually
                            </p>
                            <p className="mt-1 text-xs leading-relaxed">
                              {kraHealthResult.message}
                            </p>
                            <p className="mt-2 text-xs text-amber-900/80">
                              CentrixKraAgent keeps running as a service and will keep signalling until
                              Comstore is up (start Comstore with Windows). After Comstore is running, click{" "}
                              <strong>Test connection</strong> again.
                            </p>
                          </div>
                        ) : (
                          <>
                            <p>
                              {kraHealthResult.message}
                              {kraHealthResult.httpStatus ? ` (HTTP ${kraHealthResult.httpStatus})` : ""}
                              {kraHealthResult.viaAgent ? " · via Centrix KRA Agent" : ""}
                            </p>
                            {kraHealthResult.detail &&
                            kraHealthResult.detail !== kraHealthResult.message ? (
                              <p className="theme-subtext mt-1 text-xs whitespace-pre-wrap">
                                Technical detail: {kraHealthResult.detail}
                              </p>
                            ) : null}
                            {kraHealthResult.deviceConnection ? (
                              <p className="theme-subtext mt-1 text-xs">
                                Device connection: {kraHealthResult.deviceConnection}
                                {kraHealthResult.apiService ? ` · API: ${kraHealthResult.apiService}` : ""}
                              </p>
                            ) : null}
                            {kraHealthResult.deviceHardwareIp ||
                            kraHealthResult.deviceStatusMessage ||
                            kraHealthResult.devicePingOk != null ? (
                              <p className="theme-subtext mt-1 text-xs">
                                Fiscal hardware
                                {kraHealthResult.deviceHardwareIp
                                  ? ` (${kraHealthResult.deviceHardwareIp})`
                                  : ""}
                                {kraHealthResult.devicePingOk === true
                                  ? " · ping OK"
                                  : kraHealthResult.devicePingOk === false
                                    ? " · ping failed"
                                    : ""}
                                {kraHealthResult.deviceOk === false
                                  ? " · not reachable"
                                  : kraHealthResult.deviceOk === true
                                    ? " · reachable"
                                    : ""}
                                {kraHealthResult.deviceStatusMessage
                                  ? ` — ${kraHealthResult.deviceStatusMessage}`
                                  : ""}
                              </p>
                            ) : null}
                          </>
                        )}
                      </div>
                    ) : (
                      <p className="theme-subtext text-xs">
                        <strong>Test connection</strong> runs via Centrix KRA Agent: Comstore{" "}
                        <code className="rounded bg-slate-100 px-1 py-0.5">GET /api/health</code>
                        {form.kra_device_hardware_ip?.trim()
                          ? " plus a LAN ping of Fiscal hardware IP"
                          : " (set Fiscal hardware IP to also ping the Smart VSCU)"}
                        . <strong>Initialize</strong> calls{" "}
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
                  description="Match incoming C2B M-Pesa payments to sales. STK is linked to the order automatically; direct paybill payments (account name only) match by amount. Unmatched items appear on Accounting → M-Pesa reconciliation."
                  checked={Boolean(mpesa.enable_c2b_reconciliation)}
                  onChange={(v) => setMpesa("enable_c2b_reconciliation", v)}
                />
                {mpesa.enable_c2b_reconciliation ? (
                  <>
                    <Toggle
                      label="Auto-apply matching payments"
                      description="STK push already links to the open order. For direct paybill payments (customers only enter the account name, e.g. moon), auto-apply to the latest unpaid order with the same amount."
                      checked={mpesa.auto_apply_order_reference !== false}
                      onChange={(v) => setMpesa("auto_apply_order_reference", v)}
                    />
                    <Field label="Paybill account name (Safaricom)">
                      <input
                        className={inputClassName()}
                        value={mpesa.payment_account_name ?? ""}
                        onChange={(e) => setMpesa("payment_account_name", e.target.value)}
                        placeholder="e.g. moon"
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        What customers type in the M-Pesa <em>Account number</em> field — only this, nothing else
                        (e.g. paybill <strong>4036507</strong>, account <strong>moon</strong>). Also put the same
                        value as Account no. on Printouts.
                      </p>
                    </Field>
                    <Field label="Customer account reference hint">
                      <input
                        className={inputClassName()}
                        value={mpesa.payment_account_hint ?? ""}
                        onChange={(e) => setMpesa("payment_account_hint", e.target.value)}
                        placeholder={
                          mpesa.payment_account_name?.trim()
                            ? `Enter ${mpesa.payment_account_name.trim()}`
                            : "Enter moon"
                        }
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        Shown on reconciliation screens. Tell customers to enter only the account name (e.g.{" "}
                        {mpesa.payment_account_name?.trim() || "moon"}) — not an order number.
                      </p>
                    </Field>
                  </>
                ) : null}
              </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2 rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2 text-xs text-sky-950">
                  <strong>Organization default Daraja app.</strong> These credentials apply to every paybill
                  that does not set its own keys. Open the <em>Saved M-Pesa accounts</em> tab to attach a different
                  Safaricom app to a specific shortcode.
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
            </div>
          ) : null}

          {renderPaybillsTab ? (
            <div>
              <p className="theme-subtext text-sm">
                Saved accounts appear in the table below. Select one to edit shortcodes, route/till mapping, and
                optional Daraja keys. Blank credential fields inherit{" "}
                {mode === "paybills" ? (
                  <>
                    organization defaults under{" "}
                    <a href={mpesaSettingsHref} className="font-medium text-[var(--theme-primary)] underline">
                      M-Pesa settings
                    </a>
                  </>
                ) : (
                  <>the <em>Daraja defaults</em> tab</>
                )}
                .
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
                    label="Auto-apply matching payments"
                    description="When BillRef is only the fixed account name, auto-apply to the latest unpaid order with the same amount. Order-number refs still auto-apply when present."
                    checked={equity.auto_apply_order_reference !== false}
                    onChange={(v) => setEquity("auto_apply_order_reference", v)}
                  />
                  <Field label="Paybill account name">
                    <input
                      className={inputClassName()}
                      value={equity.payment_account_name ?? ""}
                      onChange={(e) => setEquity("payment_account_name", e.target.value)}
                      placeholder="e.g. moon"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Fixed account name customers enter (e.g. moon). No order number required.
                    </p>
                  </Field>
                  <Field label="Customer account / BillRef hint">
                    <input
                      className={inputClassName()}
                      value={equity.payment_account_hint ?? ""}
                      onChange={(e) => setEquity("payment_account_hint", e.target.value)}
                      placeholder={
                        equity.payment_account_name?.trim()
                          ? `Enter ${equity.payment_account_name.trim()}`
                          : "Enter moon"
                      }
                    />
                  </Field>
                </>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="md:col-span-2 rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2 text-xs text-sky-950">
                  <strong>Organization default Equity callback.</strong> Open the{" "}
                  <em>Saved Equity accounts</em> tab to set a callback URL / secret on a specific account.
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
          </div>
          ) : null}

          {renderEquityAccountsTab ? (
            <div>
              <p className="theme-subtext text-sm">
                Saved Equity accounts appear in the list below. Select one to edit account numbers, route
                mapping, and optional callback credentials. Blank callback fields inherit the{" "}
                <em>Equity defaults</em> tab.
              </p>
              <div className="mt-4">
                <EquityBankAccountsPanel
                  branches={paybillBranches}
                  routes={paybillRoutes}
                  setError={setError}
                  refreshKey={accountsRefreshKey}
                />
              </div>
            </div>
          ) : null}

          {showOrgSaveButton ? (
          <PrimaryButton type="button" showIcon={false} disabled={saving} onClick={() => void saveFinanceSettings()}>
              {saving
                ? "Saving…"
                : activeTab === "kra" || mode === "kra"
                  ? "Save KRA settings"
                  : activeTab === "mpesa" || mode === "mpesa"
                    ? "Save M-Pesa settings"
                    : activeTab === "equity" || mode === "equity"
                      ? "Save Equity settings"
                      : "Save finance settings"}
          </PrimaryButton>
          ) : null}
        </div>
      )}
    </section>
  );
}
