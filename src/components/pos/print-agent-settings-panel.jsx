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
  downloadPrintAgentInstaller,
  downloadPrintAgentMsi,
  printAgentInstallerHelp,
} from "@/lib/print-agent-installer-download";
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

/** Per-till print agent settings — stored on this device only. */
export function PrintAgentSettingsPanel({ compact = false }) {
  const [form, setForm] = useState(() => getPrintAgentConfig());
  const [health, setHealth] = useState(null);
  const [checking, setChecking] = useState(false);
  const [testPrinting, setTestPrinting] = useState(false);
  const [downloadingInstaller, setDownloadingInstaller] = useState(false);
  const [downloadingMsi, setDownloadingMsi] = useState(false);
  const [saved, setSaved] = useState(false);

  const refreshHealth = useCallback(async (config = form, { quick = false } = {}) => {
    setChecking(true);
    try {
      const result = await checkPrintAgentHealth(config, { quick });
      setHealth(result);
      return result;
    } finally {
      setChecking(false);
    }
  }, [form]);

  useEffect(() => {
    if (!form.enabled) return undefined;

    const timer = window.setTimeout(() => {
      void refreshHealth(form, { quick: true });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [form.enabled, form.baseUrl, refreshHealth]);

  function updateField(key, value) {
    setSaved(false);
    setForm((prev) => normalizePrintAgentConfig({ ...prev, [key]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    const next = savePrintAgentConfig(form);
    setForm(next);
    setSaved(true);
    notifySuccess("Till print settings saved on this device.");
    if (next.enabled) {
      await refreshHealth(next);
    }
  }

  async function handleTestConnection() {
    const result = await refreshHealth(form);
    if (result?.ok) {
      notifySuccess(
        result.defaultPrinter
          ? `Print agent connected. Default printer: ${result.defaultPrinter}`
          : "Print agent connected.",
      );
    } else {
      notifyError(
        "Print agent is not reachable. Install and start Centrix Print Agent on this till PC, then try again.",
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
    const config = normalizePrintAgentConfig({ ...form, enabled: true });
    setTestPrinting(true);
    try {
      let status = health;
      if (!status?.ok) {
        status = await refreshHealth(config);
      }
      if (!status?.ok) {
        notifyError(
          "Print agent is not running on this PC. Run the till installer once (see setup steps below), then try again.",
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

      await printViaAgent({
        html,
        copies: 1,
        jobType: "receipt",
        documentId: "test",
        config,
      });
      notifySuccess("Test receipt sent to the printer.");
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Test print failed.");
    } finally {
      setTestPrinting(false);
    }
  }

  const shellClass = compact
    ? "theme-panel rounded-xl border p-4 shadow-sm"
    : "theme-panel rounded-xl border p-6 shadow-sm";

  const statusLabel = checking
    ? "Checking…"
    : health?.ok
      ? "Agent connected"
      : form.enabled
        ? "Agent offline"
        : "Browser print";

  return (
    <form onSubmit={handleSave} className={shellClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="theme-heading text-lg font-medium">Till printing</h2>
          <p className="theme-subtext mt-1 text-sm">
            Silent receipt printing via Centrix Print Agent on this computer. Settings apply to this browser only.
          </p>
          <p className="theme-subtext mt-2 text-xs">
            Install the agent <strong>once per till PC</strong> — not on every user laptop. Backoffice staff only need
            the web app or installed ERP app; POS tills need the print agent for silent receipts.
          </p>
        </div>
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
            health?.ok
              ? "bg-emerald-100 text-emerald-800"
              : form.enabled
                ? "bg-amber-100 text-amber-900"
                : "bg-slate-100 text-slate-600"
          }`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="mt-5 space-y-4">
        <Toggle
          checked={form.enabled}
          onChange={(v) => updateField("enabled", v)}
          label="Use Centrix Print Agent"
          description="Send POS receipts to the local agent for silent printing on the till thermal printer."
        />

        {form.enabled ? (
          <>
            <Field label="Agent URL">
              <input
                type="url"
                value={form.baseUrl}
                onChange={(e) => updateField("baseUrl", e.target.value)}
                className={inputClassName()}
                placeholder={PRINT_AGENT_DEFAULTS.baseUrl}
              />
            </Field>
            <Field label="Printer name (optional)">
              <input
                type="text"
                value={form.printerName}
                onChange={(e) => updateField("printerName", e.target.value)}
                className={inputClassName()}
                placeholder={health?.defaultPrinter ?? "System default printer"}
              />
            </Field>
            <Toggle
              checked={form.fallbackToBrowser}
              onChange={(v) => updateField("fallbackToBrowser", v)}
              label="Fallback to browser print dialog"
              description="If the agent is offline, open the normal print dialog instead of blocking checkout."
            />
            <Toggle
              checked={form.requireAgent}
              onChange={(v) => updateField("requireAgent", v)}
              label="Require agent (strict mode)"
              description="Block silent print when the agent is unavailable — use only when every sale must print silently."
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
          </>
        ) : null}
      </div>

      <div className="mt-5 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-4 py-3 text-sm">
        <p className="theme-heading font-medium">Install on till PCs (admin / IT)</p>
        <p className="theme-subtext mt-1 text-xs">
          Only physical tills need the print agent — not every user laptop. Windows tills: use the MSI (recommended).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleDownloadMsi()}
            disabled={downloadingMsi || downloadingInstaller}
            className="theme-primary-btn rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {downloadingMsi ? "Downloading MSI…" : "Download Windows MSI installer"}
          </button>
          <button
            type="button"
            onClick={() => void handleDownloadInstaller()}
            disabled={downloadingInstaller || downloadingMsi}
            className="theme-btn-secondary rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {downloadingInstaller ? "Preparing…" : "Download script installer (fallback)"}
          </button>
        </div>
        <p className="theme-subtext mt-2 text-xs">
          <strong>MSI:</strong> copy to till PC (or USB), double-click, Next → Install. Includes Node.js, Chromium,
          and auto-start. <strong>Script:</strong> {printAgentInstallerHelp()}
        </p>
        <ol className="theme-subtext mt-3 list-decimal space-y-1 pl-4 text-xs">
          <li>Install SumatraPDF on Windows tills for reliable silent printing (recommended).</li>
          <li>On each till: enable agent below → <strong>Test print receipt</strong> → Save.</li>
        </ol>
      </div>

      <div className="mt-4 rounded-lg border border-dashed border-[var(--theme-border)] px-4 py-3 text-xs">
        <p className="theme-heading font-medium">Offline / USB install</p>
        <p className="theme-subtext mt-1">
          Copy the <code className="rounded bg-white/80 px-1">print-agent</code> folder to the till PC and run{" "}
          <code className="rounded bg-white/80 px-1">install-windows.bat</code> or{" "}
          <code className="rounded bg-white/80 px-1">./install.sh --autostart</code>.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <PrimaryButton type="submit" showIcon={false}>
          Save till settings
        </PrimaryButton>
        <button
          type="button"
          onClick={() => void handleTestConnection()}
          disabled={checking || testPrinting || !form.enabled}
          className="theme-btn-secondary rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {checking ? "Checking…" : "Test agent"}
        </button>
        <button
          type="button"
          onClick={() => void handleTestPrint()}
          disabled={checking || testPrinting || !form.enabled}
          className="theme-btn-secondary rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {testPrinting ? "Printing…" : "Test print receipt"}
        </button>
        {saved ? <span className="theme-subtext self-center text-xs">Saved on this device</span> : null}
      </div>
    </form>
  );
}
