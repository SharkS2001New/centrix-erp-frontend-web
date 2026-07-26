"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import {
  Field,
  PrimaryButton,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import {
  PRINT_AGENT_DEFAULTS,
  checkPrintAgentHealth,
  getPrintAgentConfig,
  normalizePrintAgentConfig,
  printViaAgent,
  savePrintAgentConfig,
} from "@/lib/print-agent";
import {
  checkPrintAgentMsiAvailable,
  downloadPrintAgentInstaller,
  downloadPrintAgentMsi,
  printAgentInstallerHelp,
} from "@/lib/print-agent-installer-download";
import {
  LOCAL_PRINT_PROVIDERS,
  getLocalPrintProvider,
} from "@/lib/local-print-provider";
import { applyLocalPrintProviderSelection } from "@/lib/print-dispatch";
import {
  checkQzTrayHealth,
  getQzTrayConfig,
  normalizeQzTrayConfig,
  printViaQzTray,
  saveQzTrayConfig,
} from "@/lib/qz-tray-print";
import { LOCAL_PRINTING_ADMIN_LABEL } from "@/lib/local-printing";
import { notifyError, notifySuccess } from "@/lib/notify";

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

/** Per-device local printing — QZ Tray or Centrix Print Agent. */
export function PrintAgentSettingsPanel({ compact = false }) {
  const [ready, setReady] = useState(false);
  const [provider, setProvider] = useState("browser");
  const [qzForm, setQzForm] = useState(() => normalizeQzTrayConfig());
  const [agentForm, setAgentForm] = useState(() => normalizePrintAgentConfig());
  const [installerHelp, setInstallerHelp] = useState(
    "Open the downloaded centrix-install-print-agent.bat file (double-click). Node.js 20+ is installed automatically if needed. Run once on each till PC.",
  );
  const [health, setHealth] = useState(null);
  const [checking, setChecking] = useState(false);
  const [testPrinting, setTestPrinting] = useState(false);
  const [downloadingInstaller, setDownloadingInstaller] = useState(false);
  const [downloadingMsi, setDownloadingMsi] = useState(false);
  const [msiAvailable, setMsiAvailable] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setProvider(getLocalPrintProvider());
    setQzForm(getQzTrayConfig());
    setAgentForm(getPrintAgentConfig());
    setInstallerHelp(printAgentInstallerHelp());
    setReady(true);
    void import("@/components/sales/sale-receipt-print");
    void import("@/lib/print-preview-samples");
    void checkPrintAgentMsiAvailable().then((result) => setMsiAvailable(result.available));
  }, []);

  const refreshHealth = useCallback(
    async ({ quick = false } = {}) => {
      setChecking(true);
      try {
        if (provider === "qz") {
          const result = await checkQzTrayHealth(qzForm);
          setHealth(result);
          return result;
        }
        if (provider === "centrix") {
          const result = await checkPrintAgentHealth(agentForm, { quick });
          setHealth(result);
          return result;
        }
        setHealth(null);
        return null;
      } finally {
        setChecking(false);
      }
    },
    [provider, qzForm, agentForm],
  );

  useEffect(() => {
    if (!ready || provider === "browser") return undefined;
    const timer = window.setTimeout(() => {
      void refreshHealth({ quick: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [ready, provider, qzForm.printerName, qzForm.useSigning, agentForm.baseUrl, refreshHealth]);

  function selectProvider(next) {
    setSaved(false);
    setProvider(next);
    setHealth(null);
    applyLocalPrintProviderSelection(next);
    if (next === "qz") setQzForm((prev) => ({ ...prev, enabled: true }));
    if (next === "centrix") setAgentForm((prev) => ({ ...prev, enabled: true }));
  }

  function updateQz(key, value) {
    setSaved(false);
    setQzForm((prev) => normalizeQzTrayConfig({ ...prev, [key]: value }));
  }

  function updateAgent(key, value) {
    setSaved(false);
    setAgentForm((prev) => normalizePrintAgentConfig({ ...prev, [key]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    applyLocalPrintProviderSelection(provider);
    if (provider === "qz") {
      const next = saveQzTrayConfig({ ...qzForm, enabled: true });
      setQzForm(next);
    } else if (provider === "centrix") {
      const next = savePrintAgentConfig({ ...agentForm, enabled: true });
      setAgentForm(next);
    }
    setSaved(true);
    notifySuccess("Local print settings saved on this device.");
    if (provider !== "browser") {
      await refreshHealth();
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
    } else {
      notifyError(
        provider === "qz"
          ? result?.error ||
              "QZ Tray is not reachable. Install QZ Tray from qz.io, start it, then allow this site when prompted."
          : "Print agent is not reachable. Install Centrix Print Agent on this PC, then try again.",
      );
    }
  }

  async function handleDownloadMsi() {
    setDownloadingMsi(true);
    try {
      const { filename } = await downloadPrintAgentMsi();
      notifySuccess(`Downloaded ${filename}. Run it on each till PC (admin). Includes Node.js — no extra setup.`, {
        duration: 9000,
      });
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "MSI download failed.");
    } finally {
      setDownloadingMsi(false);
    }
  }

  async function handleDownloadInstaller() {
    setDownloadingInstaller(true);
    try {
      const { filename } = await downloadPrintAgentInstaller();
      notifySuccess(`Downloaded ${filename}. Open it on this till PC to install the print agent.`, {
        duration: 8000,
      });
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Installer download failed.");
    } finally {
      setDownloadingInstaller(false);
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
          provider === "qz"
            ? "QZ Tray is not running. Install from https://qz.io/download/ and start it on this PC."
            : "Print agent is not running on this PC. Run the till installer once, then try again.",
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

      if (provider === "qz") {
        const result = await printViaQzTray({
          html,
          copies: 1,
          jobType: "receipt",
          config: { ...qzForm, enabled: true },
        });
        notifySuccess(`Test receipt sent via QZ Tray${result.printer ? ` → ${result.printer}` : ""}.`);
      } else {
        await printViaAgent({
          html,
          copies: 1,
          jobType: "receipt",
          documentId: "test",
          config: { ...agentForm, enabled: true },
        });
        notifySuccess("Test receipt sent to the printer.");
      }
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Test print failed.");
    } finally {
      setTestPrinting(false);
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
      : health?.ok
        ? provider === "qz"
          ? "QZ Tray connected"
          : "Agent connected"
        : provider === "qz"
          ? "QZ Tray offline"
          : "Agent offline";

  return (
    <form onSubmit={handleSave} className={shellClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="theme-heading text-lg font-medium">{LOCAL_PRINTING_ADMIN_LABEL}</h2>
          <p className="theme-subtext mt-1 text-sm">
            Print from this computer to a local USB or network printer. Settings apply to this browser / PWA only.
          </p>
          <p className="theme-subtext mt-2 text-xs">
            Install{" "}
            <a
              href="https://qz.io/download/"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-[var(--theme-accent)] underline"
            >
              QZ Tray
            </a>{" "}
            or Centrix Print Agent on each till (Chrome / Edge PWA). Receipt HTML is built in Centrix; the
            chosen bridge sends it to the local printer.
          </p>
        </div>
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
            health?.ok
              ? "bg-emerald-100 text-emerald-800"
              : provider !== "browser"
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
            }`}
          >
            <input
              type="radio"
              name="local-print-provider"
              className="mt-1"
              checked={provider === option.id}
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
              value={qzForm.printerName}
              onChange={(e) => updateQz("printerName", e.target.value)}
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
          <Toggle
            checked={qzForm.fallbackToBrowser}
            onChange={(v) => updateQz("fallbackToBrowser", v)}
            label="Fallback to browser print dialog"
            description="If QZ Tray is offline, open the normal print dialog instead of blocking checkout."
          />
          <Toggle
            checked={qzForm.requireQz}
            onChange={(v) => updateQz("requireQz", v)}
            label="Require QZ Tray (strict mode)"
            description="Block print when QZ Tray is unavailable — use when every sale must print silently."
          />
          <Toggle
            checked={qzForm.useSigning}
            onChange={(v) => updateQz("useSigning", v)}
            label="Use server certificate signing"
            description="Production silent print without recurring trust prompts. Requires QZ_CERTIFICATE and QZ_PRIVATE_KEY on the API."
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
              <li>Select your receipt printer above and save.</li>
            </ol>
          </div>
        </div>
      ) : null}

      {provider === "centrix" ? (
        <div className="mt-5 space-y-4">
          <Field label="Agent URL">
            <input
              type="url"
              value={agentForm.baseUrl}
              onChange={(e) => updateAgent("baseUrl", e.target.value)}
              className={inputClassName()}
              placeholder={PRINT_AGENT_DEFAULTS.baseUrl}
            />
          </Field>
          <Field label="Printer name (optional)">
            <input
              type="text"
              value={agentForm.printerName}
              onChange={(e) => updateAgent("printerName", e.target.value)}
              className={inputClassName()}
              placeholder={health?.defaultPrinter ?? "System default printer"}
            />
          </Field>
          <Toggle
            checked={agentForm.fallbackToBrowser}
            onChange={(v) => updateAgent("fallbackToBrowser", v)}
            label="Fallback to browser print dialog"
            description="If the agent is offline, open the normal print dialog instead of blocking checkout."
          />
          <Toggle
            checked={agentForm.requireAgent}
            onChange={(v) => updateAgent("requireAgent", v)}
            label="Require agent (strict mode)"
            description="Block silent print when the agent is unavailable."
          />
          {health?.printers?.length ? (
            <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-3 py-2 text-xs">
              <p className="theme-heading font-medium">Printers reported by agent</p>
              <ul className="theme-subtext mt-1 list-disc pl-4">
                {health.printers.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-4 py-3 text-sm">
            <p className="theme-heading font-medium">Install Centrix Print Agent</p>
            <ol className="theme-subtext mt-2 list-decimal space-y-1 pl-4 text-xs">
              <li>Download the Windows MSI (or script installer) below.</li>
              <li>Install and leave the agent running on this PC.</li>
              <li>Open Centrix POS (PWA or browser) on the same machine.</li>
              <li>Select your receipt printer above and save.</li>
            </ol>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleDownloadMsi()}
                disabled={downloadingMsi || downloadingInstaller || msiAvailable === false}
                className="theme-primary-btn rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {downloadingMsi
                  ? "Downloading MSI…"
                  : msiAvailable === false
                    ? "Windows MSI (not packaged yet)"
                    : "Download Windows MSI installer"}
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadInstaller()}
                disabled={downloadingInstaller || downloadingMsi}
                className="theme-btn-secondary rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {downloadingInstaller ? "Preparing…" : "Download script installer"}
              </button>
            </div>
            <p className="theme-subtext mt-2 text-xs">{installerHelp}</p>
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        <PrimaryButton type="submit">{saved ? "Saved" : "Save settings"}</PrimaryButton>
        {provider !== "browser" ? (
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
