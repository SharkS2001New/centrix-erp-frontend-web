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
  fetchLocalPrintingSettings,
  localPrintingFromQzForm,
  qzConfigFromLocalPrinting,
  saveLocalPrintingSettings,
  syncLocalPrintingFromCapabilities,
} from "@/lib/local-printing-settings";
import { applyLocalPrintProviderSelection } from "@/lib/print-dispatch";
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
    <label className={`flex items-start gap-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-4 py-3 ${disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}>
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

/** Organization local printing — browser dialog or QZ Tray. */
export function PrintAgentSettingsPanel({ compact = false }) {
  const { capabilities, refreshCapabilities, hasPermission } = useAuth();
  const canEdit = hasPermission?.(P.admin.till_printing.edit) ?? true;

  const [ready, setReady] = useState(false);
  const [provider, setProvider] = useState("browser");
  const [qzForm, setQzForm] = useState(() => normalizeQzTrayConfig());
  const [health, setHealth] = useState(null);
  const [checking, setChecking] = useState(false);
  const [testPrinting, setTestPrinting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        syncLocalPrintingFromCapabilities(capabilities);
        const settings = await fetchLocalPrintingSettings();
        if (cancelled) return;
        setProvider(settings.provider);
        setQzForm(qzConfigFromLocalPrinting(settings));
        applyLocalPrintProviderSelection(settings.provider);
      } catch {
        if (cancelled) return;
        syncLocalPrintingFromCapabilities(capabilities);
        const providerFallback = getLocalPrintProvider();
        setProvider(providerFallback);
        setQzForm(qzConfigFromLocalPrinting());
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

  const refreshHealth = useCallback(async () => {
    setChecking(true);
    try {
      if (provider !== "qz") {
        setHealth(null);
        return null;
      }
      const result = await checkQzTrayHealth({ ...qzForm, enabled: true });
      setHealth(result);
      return result;
    } finally {
      setChecking(false);
    }
  }, [provider, qzForm]);

  useEffect(() => {
    if (!ready || provider !== "qz") return undefined;
    const timer = window.setTimeout(() => {
      void refreshHealth();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [ready, provider, qzForm.printerName, qzForm.useSigning, refreshHealth]);

  function selectProvider(next) {
    if (!canEdit) return;
    setSaved(false);
    setProvider(next);
    setHealth(null);
    applyLocalPrintProviderSelection(next);
    if (next === "qz") setQzForm((prev) => ({ ...prev, enabled: true }));
  }

  function updateQz(key, value) {
    if (!canEdit) return;
    setSaved(false);
    setQzForm((prev) => normalizeQzTrayConfig({ ...prev, [key]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    try {
      const payload = localPrintingFromQzForm(provider, {
        ...qzForm,
        enabled: provider === "qz",
      });
      const savedSettings = await saveLocalPrintingSettings(payload);
      setProvider(savedSettings.provider);
      setQzForm(qzConfigFromLocalPrinting(savedSettings));
      applyLocalPrintProviderSelection(savedSettings.provider);
      await refreshCapabilities?.({ force: true });
      setSaved(true);
      notifySuccess("Local print settings saved for this organization.");
      if (savedSettings.provider === "qz") {
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
        notifyError("QZ Tray is not running. Install from https://qz.io/download/ and start it on this PC.");
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
        ? "QZ Tray connected"
        : "QZ Tray offline";

  return (
    <form onSubmit={handleSave} className={shellClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="theme-heading text-lg font-medium">{LOCAL_PRINTING_ADMIN_LABEL}</h2>
          <p className="theme-subtext mt-1 text-sm">
            Organization-wide print method for tills using this company. Install QZ Tray on each workstation that
            should print silently.
          </p>
          <p className="theme-subtext mt-2 text-xs">
            For silent thermal printing, install{" "}
            <a
              href="https://qz.io/download/"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-[var(--theme-accent)] underline"
            >
              QZ Tray
            </a>{" "}
            on each till (Windows or macOS, Chrome / Edge PWA). Receipt HTML is built in Centrix; QZ Tray sends it
            to the printer.
          </p>
        </div>
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
            health?.ok
              ? "bg-emerald-100 text-emerald-800"
              : provider === "qz"
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
              value={qzForm.printerName}
              disabled={!canEdit}
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
          <p className="theme-subtext text-xs">
            If QZ Tray is not installed or offline on a till, Centrix automatically opens the browser print dialog
            instead.
          </p>
          <Toggle
            checked={qzForm.useSigning}
            onChange={(v) => updateQz("useSigning", v)}
            disabled={!canEdit}
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
              <li>Select your receipt printer above and save for the organization.</li>
            </ol>
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        {canEdit ? (
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? "Saving…" : saved ? "Saved" : "Save settings"}
          </PrimaryButton>
        ) : null}
        {provider === "qz" ? (
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
