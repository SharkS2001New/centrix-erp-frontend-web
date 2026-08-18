"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import {
  Field,
  PrimaryButton,
  SearchableSelect,
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
  saveLocalPrintingSettings,
  syncLocalPrintingFromCapabilities,
} from "@/lib/local-printing-settings";
import { applyLocalPrintProviderSelection } from "@/lib/print-dispatch";
import {
  checkPrintAgentHealth,
  normalizePrintAgentConfig,
  printAgentHealthUrl,
  printViaAgent,
} from "@/lib/print-agent";
import {
  checkPrintAgentDotnetAvailable,
  checkPrintAgentSourceAvailable,
  downloadPrintAgentDotnet,
  downloadPrintAgentSource,
} from "@/lib/print-agent-installer-download";
import {
  PRINT_AGENT_DOTNET_SDK_URL,
  PRINT_AGENT_SUMATRA_PDF_URL,
  PRINT_AGENT_WKHTMLTOPDF_URL,
} from "@/lib/print-agent-download-links";
import { LOCAL_PRINTING_ADMIN_LABEL } from "@/lib/local-printing";
import { notifyError, notifySuccess } from "@/lib/notify";
import { P } from "@/lib/permission-codes";

function ExternalDownloadLink({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="font-medium text-[var(--theme-accent)] underline">
      {children}
    </a>
  );
}

/** Organization local printing — browser or Centrix Print Agent. */
export function PrintAgentSettingsPanel({ compact = false }) {
  const { capabilities, refreshCapabilities, hasPermission } = useAuth();
  const canEdit = hasPermission?.(P.admin.till_printing.edit) ?? true;

  const [ready, setReady] = useState(false);
  const [provider, setProvider] = useState("browser");
  const [agentForm, setAgentForm] = useState(() => normalizePrintAgentConfig());
  const [health, setHealth] = useState(null);
  const [healthDetailJson, setHealthDetailJson] = useState(null);
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
        setAgentForm(agentConfigFromLocalPrinting(settings));
        applyLocalPrintProviderSelection(settings.provider);
      } catch {
        if (cancelled) return;
        syncLocalPrintingFromCapabilities(capabilities);
        const providerFallback = getLocalPrintProvider();
        setProvider(providerFallback);
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
      if (provider !== "agent") {
        setHealth(null);
        return null;
      }
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
    } finally {
      setChecking(false);
    }
  }, [provider, agentForm]);

  useEffect(() => {
    if (!ready || provider !== "agent") return undefined;
    const timer = window.setTimeout(() => {
      void refreshHealth();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [ready, provider, agentForm.printerName, refreshHealth]);

  function selectProvider(next) {
    if (!canEdit) return;
    setSaved(false);
    setProvider(next);
    setHealth(null);
    setHealthDetailJson(null);
    applyLocalPrintProviderSelection(next);
    if (next === "agent") setAgentForm((prev) => ({ ...prev, enabled: true }));
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
          : { printerName: "", kitchenPrinterName: agentForm.kitchenPrinterName, copies: 1, useSigning: false };
      const payload = localPrintingFromProviderForm(provider, form);
      const savedSettings = await saveLocalPrintingSettings(payload);
      setProvider(savedSettings.provider);
      setAgentForm(agentConfigFromLocalPrinting(savedSettings));
      applyLocalPrintProviderSelection(savedSettings.provider);
      await refreshCapabilities?.({ force: true });
    setSaved(true);
      notifySuccess("Local print settings saved for this organization.");
      if (savedSettings.provider === "agent") {
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
      const sumatraNote = result.sumatraAvailable
        ? " SumatraPDF is ready."
        : " SumatraPDF is not configured yet — run configure-sumatra.ps1 on the till PC.";
      notifySuccess(
        (result.defaultPrinter
          ? `Connected. Printers available — default: ${result.defaultPrinter}.`
          : "Connected.") + sumatraNote,
      );
    } else {
      notifyError(
        result?.error ||
          "Print agent is not reachable. Install Centrix Print Agent on this PC and leave it running.",
      );
    }
  }

  async function handleCheckHealth() {
    setChecking(true);
    setHealthDetailJson(null);
    try {
      const config = { ...agentForm, enabled: true };
      const status = await checkPrintAgentHealth(config, { bypassCache: true });
      if (!status) {
        const offline = {
          ok: false,
          error: "Print agent is not running on this PC.",
          url: printAgentHealthUrl(config),
        };
        setHealth({ ok: false, printers: [], error: offline.error });
        setHealthDetailJson(JSON.stringify(offline, null, 2));
        notifyError(offline.error);
        return;
      }

      setHealth(status);
      setHealthDetailJson(JSON.stringify(status.raw ?? status, null, 2));

      if (status.sumatraAvailable) {
        notifySuccess('Health OK — "sumatra_available" is true.');
      } else if (status.ok) {
        notifyError(
          'Agent is running but "sumatra_available" is false. Copy Sumatra into the Print Agent folder (see setup guide) or run configure-sumatra.ps1 on the till PC.',
        );
      } else {
        notifyError("Print agent returned an unhealthy status.");
      }
    } finally {
      setChecking(false);
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
          "Print agent is not running. Download and install the Windows print service on this PC, then try again.",
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
        wait: true,
        config: { ...agentForm, enabled: true },
      });
      notifySuccess(
        `Test receipt printed via Centrix Print Agent${agentForm.printerName ? ` → ${agentForm.printerName}` : ""}.`,
      );
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
    : health?.ok
        ? "Print agent connected"
        : "Print agent offline";

  return (
    <form onSubmit={handleSave} className={shellClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="theme-heading text-lg font-medium">{LOCAL_PRINTING_ADMIN_LABEL}</h2>
          <p className="theme-subtext mt-1 text-sm">
            Organization-wide print method for this company. Choose browser print or the Centrix
            Print Agent for silent Windows printing of Hotel POS receipts, retail POS receipts, and
            all ERP documents.
          </p>
        </div>
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
            health?.ok
              ? "bg-emerald-100 text-emerald-800"
              : provider === "agent"
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

      {provider === "agent" ? (
        <div className="mt-5 space-y-4">
          <Field label="Preferred printer">
            <SearchableSelect
              className={inputClassName()}
              value={agentForm.printerName}
              disabled={!canEdit}
              onChange={(v) => updateAgent("printerName", v)}
              placeholder="System / first available"
              options={[
                { value: "", label: "System / first available" },
                ...(health?.printers ?? []).map((name) => ({
                  value: name,
                  label: name,
                })),
              ]}
            />
          </Field>
          <Field label="Kitchen printer (Hotel POS)">
            <SearchableSelect
              className={inputClassName()}
              value={agentForm.kitchenPrinterName ?? ""}
              disabled={!canEdit}
              onChange={(v) => updateAgent("kitchenPrinterName", v)}
              placeholder="None — cashier printer only"
              options={[
                { value: "", label: "None — cashier printer only" },
                ...(health?.printers ?? []).map((name) => ({
                  value: name,
                  label: name,
                })),
              ]}
            />
          </Field>
          <p className="theme-subtext text-xs">
            Hotel POS receipts print one copy on the preferred printer and a second copy on the
            kitchen printer. Leave kitchen as None to print only at the till. Retail POS is
            unchanged.
          </p>
          {!health?.printers?.length ? (
            <p className="theme-subtext text-xs">
              Click <strong>Test connection</strong> or <strong>Check health</strong> after installing the
              Print Agent to load printers.
            </p>
          ) : null}
          {health?.ok && health.sumatraAvailable === false ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Print Agent is online but <strong>SumatraPDF is missing</strong>. Silent printing needs{" "}
              <code className="text-[11px]">sumatra_available: true</code> — use{" "}
              <strong>Check health</strong> after running <code className="text-[11px]">configure-sumatra.ps1</code>{" "}
              on the till PC.
            </p>
          ) : null}
          {healthDetailJson ? (
            <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-subtle)] px-3 py-2">
              <p className="theme-heading text-xs font-medium">Health response</p>
              <pre className="theme-subtext mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed">
                {healthDetailJson}
              </pre>
            </div>
          ) : null}
          <p className="theme-subtext text-xs">
            The agent listens on <code className="text-[11px]">http://127.0.0.1:9247</code>. If it is offline
            or not installed, Centrix opens the browser print dialog instead so printing still works.
          </p>
          <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-4 py-3 text-sm">
            <p className="theme-heading font-medium">Install Centrix Print Agent (Windows)</p>
            <p className="theme-subtext mt-1 text-xs">
              Do this once on each till PC. The agent runs as a Windows service and prints silently to your
              thermal printer.
            </p>

            <div className="mt-3 rounded-md border border-[var(--theme-border)] bg-white/70 px-3 py-2.5">
              <p className="theme-heading text-xs font-semibold">Downloads you may need</p>
              <ul className="theme-subtext mt-2 list-disc space-y-1.5 pl-4 text-xs">
                <li>
                  <ExternalDownloadLink href={PRINT_AGENT_SUMATRA_PDF_URL}>
                    SumatraPDF (free)
                  </ExternalDownloadLink>
                  {" — "}
                  required for silent thermal printing. After install, Sumatra must live{" "}
                  <strong>inside the Print Agent folder</strong> (see step below). Installing only under Program
                  Files is not enough for the Windows service.
                </li>
                <li>
                  <ExternalDownloadLink href={PRINT_AGENT_DOTNET_SDK_URL}>
                    .NET 8 SDK (Windows x64)
                  </ExternalDownloadLink>
                  {" — "}
                  only if you use <strong>Download build package</strong> (first build on a Windows PC). Not
                  needed when a ready installer zip is already available.
                </li>
                <li>
                  <ExternalDownloadLink href={PRINT_AGENT_WKHTMLTOPDF_URL}>
                    wkhtmltopdf (Windows x64)
                  </ExternalDownloadLink>
                  {" — "}
                  one-time install so receipts render to PDF. The build picks it up from{" "}
                  <code className="text-[11px]">Program Files\wkhtmltopdf</code> automatically.
                </li>
              </ul>
            </div>

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
                  Setup guide (org admin)
                </p>
                <ol className="list-decimal space-y-1.5 pl-4">
                  <li>
                    On the till Windows PC, download{" "}
                    <ExternalDownloadLink href={PRINT_AGENT_SUMATRA_PDF_URL}>SumatraPDF</ExternalDownloadLink>{" "}
                    and install it (or download the portable zip).
                  </li>
                  <li>
                    Optionally install{" "}
                    <ExternalDownloadLink href={PRINT_AGENT_WKHTMLTOPDF_URL}>wkhtmltopdf</ExternalDownloadLink>{" "}
                    once for receipt rendering.
                  </li>
                  <li>
                    {dotnetAvailable ? (
                      <>
                        Prefer <strong>Download ready installer (zip)</strong> when shown — unzip and run the
                        install script as Administrator (no .NET SDK).
                      </>
                    ) : (
                      <>
                        Click <strong>Download build package (source)</strong>, unzip, open{" "}
                        <code className="text-[11px]">print-agent-dotnet</code>, install the{" "}
                        <ExternalDownloadLink href={PRINT_AGENT_DOTNET_SDK_URL}>.NET 8 SDK</ExternalDownloadLink>
                        , then double‑click <code className="text-[11px]">BUILD-AND-INSTALL.bat</code> and allow
                        Administrator. Wait for <strong>SUCCESS</strong>.
                      </>
                    )}
                  </li>
                  <li>
                    <strong>Copy Sumatra into the Print Agent folder</strong> (required after install). The agent
                    looks for:
                    <p className="mt-1 rounded bg-white/80 px-2 py-1 font-mono text-[11px] text-[var(--theme-heading)]">
                      C:\Program Files\Centrix\PrintAgent\tools\SumatraPDF\SumatraPDF.exe
                    </p>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4">
                      <li>
                        <strong>Easiest:</strong> open an elevated PowerShell in the unzipped{" "}
                        <code className="text-[11px]">print-agent-dotnet</code> folder and run:
                        <p className="mt-1 font-mono text-[11px]">
                          .\scripts\configure-sumatra.ps1
                        </p>
                        That downloads or copies Sumatra into{" "}
                        <code className="text-[11px]">tools\SumatraPDF\</code> next to the agent and restarts the
                        service.
                      </li>
                      <li>
                        If Sumatra is already installed elsewhere, run:
                        <p className="mt-1 font-mono text-[11px]">
                          .\scripts\configure-sumatra.ps1 -SkipDownload
                        </p>
                        Or manually copy <code className="text-[11px]">SumatraPDF.exe</code> into that{" "}
                        <code className="text-[11px]">tools\SumatraPDF\</code> path (create the folder if missing).
                        <p className="mt-1.5">
                          Usual install locations (copy from whichever exists on the till PC):
                        </p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 font-mono text-[11px]">
                          <li>C:\Program Files\SumatraPDF\SumatraPDF.exe</li>
                          <li>C:\Program Files (x86)\SumatraPDF\SumatraPDF.exe</li>
                          <li>
                            C:\Users\&lt;your Windows user&gt;\AppData\Local\SumatraPDF\SumatraPDF.exe
                          </li>
                        </ul>
                        <p className="mt-1">
                          Portable zip: extract the zip and copy <code className="text-[11px]">SumatraPDF.exe</code>{" "}
                          from the folder you unzipped. If unsure, search the PC for{" "}
                          <code className="text-[11px]">SumatraPDF.exe</code> in File Explorer.
                        </p>
                      </li>
                    </ul>
                  </li>
                  <li>
                    Click <strong>Check health</strong> below on the till PC — the response should include{" "}
                    <code className="text-[11px]">&quot;sumatra_available&quot;: true</code>. Or open{" "}
                    <ExternalDownloadLink href={printAgentHealthUrl(agentForm)}>
                      {printAgentHealthUrl(agentForm)}
                    </ExternalDownloadLink>{" "}
                    in a browser on that same PC.
                  </li>
                  <li>
                    Pick preferred printer → <strong>Test print</strong> → <strong>Save settings</strong>.
                  </li>
                </ol>
                <p>
                  Full notes are in <code className="text-[11px]">BUILD.md</code> inside the zip. The agent
                  listens on <code className="text-[11px]">http://127.0.0.1:9247</code>.
                </p>
                {!dotnetAvailable ? (
                  <p>
                    After the first successful build, place{" "}
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
        {provider === "agent" ? (
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
          onClick={() => void handleCheckHealth()}
          disabled={checking}
          className="theme-btn-secondary rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {checking ? "Checking…" : "Check health"}
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
