"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import {
  Field,
  PrimaryButton,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { useAuth } from "@/contexts/auth-context";
import {
  LOCAL_PRINT_PROVIDERS,
  getLocalPrintProvider,
} from "@/lib/local-print-provider";
import {
  agentConfigFromLocalPrinting,
  fetchLocalPrintingSettings,
  localPrintingFromProviderForm,
  qzConfigFromLocalPrinting,
  saveLocalPrintingSettings,
  syncLocalPrintingFromCapabilities,
} from "@/lib/local-printing-settings";
import { applyLocalPrintProviderSelection } from "@/lib/print-dispatch";
import {
  checkPrintAgentHealth,
  normalizePrintAgentConfig,
  printViaAgent,
} from "@/lib/print-agent";
import {
  checkPrintAgentDotnetAvailable,
  checkPrintAgentSourceAvailable,
  downloadPrintAgentDotnet,
  downloadPrintAgentSource,
} from "@/lib/print-agent-installer-download";
import {
  checkQzTrayHealth,
  normalizeQzTrayConfig,
  printViaQzTray,
} from "@/lib/qz-tray-print";
import { LOCAL_PRINTING_ADMIN_LABEL } from "@/lib/local-printing";
import { notifyError, notifySuccess } from "@/lib/notify";
import { P } from "@/lib/permission-codes";

function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-4 py-3 ${disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
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

/** Organization local printing — browser, QZ Tray, or Centrix Print Agent. */
export function PrintAgentSettingsPanel({ compact = false }) {
  const { capabilities, refreshCapabilities, hasPermission } = useAuth();
  const canEdit = hasPermission?.(P.admin.till_printing.edit) ?? true;

  const [ready, setReady] = useState(false);
  const [provider, setProvider] = useState("browser");
  const [qzForm, setQzForm] = useState(() => normalizeQzTrayConfig());
  const [agentForm, setAgentForm] = useState(() => normalizePrintAgentConfig());
  const [health, setHealth] = useState(null);
  const [checking, setChecking] = useState(false);
  const [testPrinting, setTestPrinting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dotnetAvailable, setDotnetAvailable] = useState(false);
  const [sourceAvailable, setSourceAvailable] = useState(true);
  const [downloadingDotnet, setDownloadingDotnet] = useState(false);
  const [downloadingSource, setDownloadingSource] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        syncLocalPrintingFromCapabilities(capabilities);
        const settings = await fetchLocalPrintingSettings();
        if (cancelled) return;
        setProvider(settings.provider);
        setQzForm(qzConfigFromLocalPrinting(settings));
        setAgentForm(agentConfigFromLocalPrinting(settings));
        applyLocalPrintProviderSelection(settings.provider);
      } catch {
        if (cancelled) return;
        syncLocalPrintingFromCapabilities(capabilities);
        const providerFallback = getLocalPrintProvider();
        setProvider(providerFallback);
        setQzForm(qzConfigFromLocalPrinting());
        setAgentForm(agentConfigFromLocalPrinting());
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Load org settings once when opening this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only fetch
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([checkPrintAgentDotnetAvailable(), checkPrintAgentSourceAvailable()]).then(
      ([dotnet, source]) => {
        if (cancelled) return;
        setDotnetAvailable(Boolean(dotnet?.available));
        setSourceAvailable(Boolean(source?.available));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshHealth = useCallback(async () => {
    setChecking(true);
    try {
      if (provider === "qz") {
        const result = await checkQzTrayHealth({ ...qzForm, enabled: true });
        setHealth(result);
        return result;
      }
      if (provider === "agent") {
        const status = await checkPrintAgentHealth({ ...agentForm, enabled: true });
        if (!status) {
          const result = {
            ok: false,
            printers: [],
            error: "Print agent is not running. Install the Windows print service on this PC, then try again.",
          };
          setHealth(result);
          return result;
        }
        const result = { ...status, ok: Boolean(status.ok), error: undefined };
        setHealth(result);
        return result;
      }
      setHealth(null);
      return null;
    } finally {
      setChecking(false);
    }
  }, [provider, qzForm, agentForm]);

  useEffect(() => {
    if (!ready || (provider !== "qz" && provider !== "agent")) return undefined;
    const timer = window.setTimeout(() => {
      void refreshHealth();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [ready, provider, qzForm.printerName, qzForm.useSigning, agentForm.printerName, refreshHealth]);

  function selectProvider(next) {
    if (!canEdit) return;
    setSaved(false);
    setProvider(next);
    setHealth(null);
    applyLocalPrintProviderSelection(next);
    if (next === "qz") setQzForm((prev) => ({ ...prev, enabled: true }));
    if (next === "agent") setAgentForm((prev) => ({ ...prev, enabled: true }));
  }

  function updateQz(key, value) {
    if (!canEdit) return;
    setSaved(false);
    setQzForm((prev) => normalizeQzTrayConfig({ ...prev, [key]: value }));
  }

  function updateAgent(key, value) {
    if (!canEdit) return;
    setSaved(false);
    setAgentForm((prev) => normalizePrintAgentConfig({ ...prev, [key]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    try {
      const form =
        provider === "agent"
          ? { ...agentForm, enabled: true }
          : provider === "qz"
            ? { ...qzForm, enabled: true }
            : { printerName: "", copies: 1, useSigning: false };
      const payload = localPrintingFromProviderForm(provider, form);
      const savedSettings = await saveLocalPrintingSettings(payload);
      setProvider(savedSettings.provider);
      setQzForm(qzConfigFromLocalPrinting(savedSettings));
      setAgentForm(agentConfigFromLocalPrinting(savedSettings));
      applyLocalPrintProviderSelection(savedSettings.provider);
      await refreshCapabilities?.({ force: true });
      setSaved(true);
      notifySuccess("Local print settings saved for this organization.");
      if (savedSettings.provider === "qz" || savedSettings.provider === "agent") {
        await refreshHealth();
      }
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Could not save local print settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    const result = await refreshHealth();
    if (result?.ok) {
      notifySuccess(
        result.defaultPrinter
          ? `Connected. Printers available — default: ${result.defaultPrinter}`
          : "Connected.",
      );
    } else if (provider === "agent") {
      notifyError(
        result?.error ||
          "Print agent is not reachable. Install Centrix Print Agent on this PC and leave it running.",
      );
    } else {
      notifyError(
        result?.error ||
          "QZ Tray is not reachable. Install QZ Tray from qz.io, start it, then allow this site when prompted.",
      );
    }
  }

  async function handleTestPrint() {
    setTestPrinting(true);
    try {
      let status = health;
      if (!status?.ok) {
        status = await refreshHealth();
      }
      if (!status?.ok) {
        notifyError(
          provider === "agent"
            ? "Print agent is not running. Download and install the Windows print service on this PC, then try again."
            : "QZ Tray is not running. Install from https://qz.io/download/ and start it on this PC.",
        );
        return;
      }

      const [{ buildSaleReceiptHtml }, { sampleReceiptPreviewSale }] = await Promise.all([
        import("@/components/sales/sale-receipt-print"),
        import("@/lib/print-preview-samples"),
      ]);

      const html = buildSaleReceiptHtml(sampleReceiptPreviewSale(), {
        organizationName: DEFAULT_PRINT_ORG_NAME,
        customerNameEnabled: true,
        productDiscountsEnabled: true,
      });

      if (provider === "agent") {
        await printViaAgent({
          html,
          copies: 1,
          jobType: "receipt",
          config: { ...agentForm, enabled: true },
        });
        notifySuccess(
          `Test receipt sent via Centrix Print Agent${agentForm.printerName ? ` → ${agentForm.printerName}` : ""}.`,
        );
        return;
      }

      const result = await printViaQzTray({
        html,
        copies: 1,
        jobType: "receipt",
        config: { ...qzForm, enabled: true },
      });
      notifySuccess(`Test receipt sent via QZ Tray${result.printer ? ` → ${result.printer}` : ""}.`);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Test print failed.");
    } finally {
      setTestPrinting(false);
    }
  }

  async function handleDownloadDotnet() {
    setDownloadingDotnet(true);
    try {
      const result = await downloadPrintAgentDotnet();
      notifySuccess(
        `Downloaded ${result.filename}. Unzip on the till PC and run install-windows-service.ps1 as Administrator.`,
        { duration: 10000 },
      );
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Could not download Windows print service.");
    } finally {
      setDownloadingDotnet(false);
    }
  }

  async function handleDownloadSource() {
    setDownloadingSource(true);
    try {
      const result = await downloadPrintAgentSource();
      notifySuccess(
        `Downloaded ${result.filename}. Unzip it and open BUILD.md — follow the numbered steps on a Windows PC.`,
        { duration: 12000 },
      );
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Could not download build package.");
    } finally {
      setDownloadingSource(false);
    }
  }

  const shellClass = compact
    ? "theme-panel rounded-xl border p-4 shadow-sm"
    : "theme-panel rounded-xl border p-6 shadow-sm";

  if (!ready) {
    return (
      <div className={shellClass} aria-busy="true">
        <p className="theme-subtext text-sm">Loading local printing settings…</p>
      </div>
    );
  }

  const statusLabel = checking
    ? "Checking…"
    : provider === "browser"
      ? "Browser print"
      : provider === "agent"
        ? health?.ok
          ? "Print agent connected"
          : "Print agent offline"
        : health?.ok
          ? "QZ Tray connected"
          : "QZ Tray offline";

  const printerForm = provider === "agent" ? agentForm : qzForm;
  const updatePrinter =
    provider === "agent"
      ? (value) => updateAgent("printerName", value)
      : (value) => updateQz("printerName", value);

  return (
    <form onSubmit={handleSave} className={shellClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="theme-heading text-lg font-medium">{LOCAL_PRINTING_ADMIN_LABEL}</h2>
          <p className="theme-subtext mt-1 text-sm">
            Organization-wide print method for tills using this company. Choose browser print, QZ Tray, or the
            Centrix Print Agent MSI.
          </p>
        </div>
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
            health?.ok
              ? "bg-emerald-100 text-emerald-800"
              : provider === "qz" || provider === "agent"
                ? "bg-amber-100 text-amber-900"
                : "bg-slate-100 text-slate-600"
          }`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="mt-5 space-y-3">
        <p className="theme-heading text-sm font-medium">Print method</p>
        {LOCAL_PRINT_PROVIDERS.map((option) => (
          <label
            key={option.id}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 ${
              provider === option.id
                ? "border-[var(--theme-accent)] bg-[var(--theme-surface-muted)]"
                : "border-[var(--theme-border)] bg-white/40"
            } ${!canEdit ? "opacity-70" : ""}`}
          >
            <input
              type="radio"
              name="local-print-provider"
              className="mt-1"
              checked={provider === option.id}
              disabled={!canEdit}
              onChange={() => selectProvider(option.id)}
            />
            <span>
              <span className="theme-heading block text-sm font-medium">{option.label}</span>
              <span className="theme-subtext mt-0.5 block text-xs">{option.description}</span>
            </span>
          </label>
        ))}
      </div>

      {provider === "qz" ? (
        <div className="mt-5 space-y-4">
          <Field label="Preferred printer">
            <select
              className={inputClassName()}
              value={printerForm.printerName}
              disabled={!canEdit}
              onChange={(e) => updatePrinter(e.target.value)}
            >
              <option value="">System / first available</option>
              {(health?.printers ?? []).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          {!health?.printers?.length ? (
            <p className="theme-subtext text-xs">
              Click <strong>Test connection</strong> after starting QZ Tray to load installed printers.
            </p>
          ) : null}
          <p className="theme-subtext text-xs">
            If QZ Tray is not installed or offline on a till, Centrix automatically opens the browser print dialog
            instead.
          </p>
          <Toggle
            checked={qzForm.useSigning}
            onChange={(v) => updateQz("useSigning", v)}
            disabled={!canEdit}
            label="Use server certificate signing"
            description="Leave off while testing — QZ will ask you to trust this site. Turn on only for production silent print after QZ_CERTIFICATE and QZ_PRIVATE_KEY are set on the API (qz.io/docs/signing)."
          />
          <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-4 py-3 text-sm">
            <p className="theme-heading font-medium">Install QZ Tray</p>
            <ol className="theme-subtext mt-2 list-decimal space-y-1 pl-4 text-xs">
              <li>
                Download from{" "}
                <a href="https://qz.io/download/" target="_blank" rel="noreferrer" className="underline">
                  qz.io/download
                </a>{" "}
                (Windows or macOS).
              </li>
              <li>Install and leave QZ Tray running in the system tray.</li>
              <li>Open Centrix POS (PWA or browser) and allow this site when QZ asks.</li>
              <li>Select your receipt printer above and save for the organization.</li>
            </ol>
          </div>
        </div>
      ) : null}

      {provider === "agent" ? (
        <div className="mt-5 space-y-4">
          <Field label="Preferred printer">
            <select
              className={inputClassName()}
              value={agentForm.printerName}
              disabled={!canEdit}
              onChange={(e) => updateAgent("printerName", e.target.value)}
            >
              <option value="">System / first available</option>
              {(health?.printers ?? []).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          {!health?.printers?.length ? (
            <p className="theme-subtext text-xs">
              Click <strong>Test connection</strong> after installing the Print Agent to load printers.
            </p>
          ) : null}
          <p className="theme-subtext text-xs">
            The agent listens on <code className="text-[11px]">http://127.0.0.1:9247</code>. If it is offline,
            Centrix opens the browser print dialog instead.
          </p>
          <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-4 py-3 text-sm">
            <p className="theme-heading font-medium">Install Windows print service</p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleDownloadSource()}
                disabled={downloadingSource || !sourceAvailable}
                className="theme-primary-btn rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {downloadingSource ? "Downloading…" : "Download build package (source)"}
              </button>
              {dotnetAvailable ? (
                <button
                  type="button"
                  onClick={() => void handleDownloadDotnet()}
                  disabled={downloadingDotnet}
                  className="theme-btn-secondary rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  {downloadingDotnet ? "Downloading…" : "Download ready installer (zip)"}
                </button>
              ) : null}
            </div>

            {!sourceAvailable ? (
              <p className="theme-subtext mt-2 text-xs text-amber-800">
                Source package is missing from this deployment. Redeploy the frontend with the{" "}
                <code className="text-[11px]">print-agent-dotnet</code> folder included.
              </p>
            ) : (
                              <div className="theme-subtext mt-3 space-y-2 text-xs">
                <p className="theme-heading text-xs font-medium text-[var(--theme-heading)]">
                  How to build (Windows PC)
                </p>
                <ol className="list-decimal space-y-1.5 pl-4">
                  <li>
                    Click <strong>Download build package (source)</strong> and unzip it. Open the folder{" "}
                    <code className="text-[11px]">print-agent-dotnet</code>.
                  </li>
                  <li>
                    Install the{" "}
                    <a
                      href="https://dotnet.microsoft.com/download/dotnet/8.0"
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      .NET 8 SDK (Windows x64)
                    </a>{" "}
                    once, then close all terminals.
                  </li>
                  <li>
                    <strong>Double‑click <code className="text-[11px]">BUILD-AND-INSTALL.bat</code></strong> and
                    allow Administrator. Wait for <strong>SUCCESS</strong>.
                    <p className="mt-1">
                      Do <strong>not</strong> type <code className="text-[11px]">cd path\to\...</code> — that was
                      only a placeholder. The bat file runs from the unzipped folder.
                    </p>
                  </li>
                  <li>
                    SumatraPDF (silent printing) is configured automatically during install. If test print does not
                    reach the printer, run <code className="text-[11px]">scripts\configure-sumatra.ps1</code> as
                    Administrator on the till PC.
                  </li>
                  <li>Back here: Test connection → pick printer → Save.</li>
                </ol>
                <p>
                  Full rules are in <code className="text-[11px]">BUILD.md</code> inside the zip.
                </p>
                {!dotnetAvailable ? (
                  <p>
                    After you build once, put{" "}
                    <code className="text-[11px]">CentrixPrintAgent-win-x64.zip</code> on the server (
                    <code className="text-[11px]">PRINT_AGENT_DOTNET_URL</code> or{" "}
                    <code className="text-[11px]">print-agent-dotnet/publish/</code>) so other tills can use{" "}
                    <strong>Download ready installer</strong> without rebuilding.
                  </p>
                ) : (
                  <p>
                    A ready installer is already on this server — use{" "}
                    <strong>Download ready installer (zip)</strong> on other tills (no .NET SDK needed).
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        {canEdit ? (
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? "Saving…" : saved ? "Saved" : "Save settings"}
          </PrimaryButton>
        ) : null}
        {provider === "qz" || provider === "agent" ? (
          <>
            <button
              type="button"
              onClick={() => void handleTestConnection()}
              disabled={checking}
              className="theme-btn-secondary rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {checking ? "Checking…" : "Test connection"}
            </button>
            <button
              type="button"
              onClick={() => void handleTestPrint()}
              disabled={testPrinting || checking}
              className="theme-btn-secondary rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {testPrinting ? "Printing…" : "Test print"}
            </button>
          </>
        ) : null}
      </div>
    </form>
  );
}
