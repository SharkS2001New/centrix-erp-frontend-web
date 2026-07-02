"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { DOCUMENT_HEADER_DISPLAY_OPTIONS } from "@/lib/general-settings";
import {
  PRINT_FOOTER_FORM_KEYS,
  PRINT_FOOTER_LABELS,
  RECEIPT_POWERED_BY_LINE,
  receiptFooterForAdmin,
} from "@/lib/print-footer-settings";
import { SALES_FOOTER_PLACEHOLDER_HINT, defaultInvoiceBodyFooterForAdmin } from "@/lib/sales-document-footer";
import {
  footerKeysForOrderPrintFormat,
  orderPrintFormatSections,
  printoutsDistributionPayloadFromForm,
  printoutsFormFromApis,
  printoutsGeneralPayloadFromForm,
  printoutsProcurementPayloadFromForm,
  printoutsSalesPayloadFromForm,
  resolvePrintoutSections,
} from "@/lib/printouts-settings";
import { PrintFontSettingsFields } from "@/components/admin/print-font-settings-fields";
import { ReceiptPaymentDetailsEditor } from "@/components/admin/receipt-payment-details-editor";
import { MultilinePrintNotesField } from "@/components/admin/multiline-print-notes-field";
import { LoadingListPrintSettingsFields } from "@/components/admin/loading-list-print-settings-fields";
import { PrintoutsLivePreview } from "@/components/admin/printouts-live-preview";
import { useDocumentPrintPreviewContext } from "@/components/admin/document-print-preview";
import { useAuth } from "@/contexts/auth-context";
import { useSettingsApi } from "@/contexts/settings-api-context";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";

const PRINTOUT_TAB_BTN =
  "rounded-md px-3 py-1.5 text-sm font-medium transition whitespace-nowrap";
const PRINTOUT_TAB_BTN_ACTIVE = "bg-white text-[#185FA5] shadow-sm";
const PRINTOUT_TAB_BTN_IDLE = "text-slate-600 hover:text-slate-900";

const PRINTOUT_TABS = [
  { id: "general", label: "General" },
  { id: "receipt", label: "Thermal receipts", requiresSales: true },
  { id: "invoice", label: "A4 invoices", requiresSales: true },
  { id: "lpo", label: "LPO", requiresProcurement: true },
  { id: "loading_sheet", label: "Loading sheets", requiresDistribution: true },
];

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

function SectionHeading({ title, description }) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
    </div>
  );
}

function PrintoutsTabBar({ tabs, activeTab, onTabChange }) {
  if (tabs.length <= 1) return null;

  return (
    <div className="w-full overflow-x-auto">
      <div
        className="flex w-full min-w-0 flex-nowrap gap-1 rounded-lg bg-slate-100 p-0.5"
        role="tablist"
        aria-label="Printout settings"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`${PRINTOUT_TAB_BTN} shrink-0 ${
              activeTab === tab.id ? PRINTOUT_TAB_BTN_ACTIVE : PRINTOUT_TAB_BTN_IDLE
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function GeneralPrintoutsTab({ form, setForm, footerKeys, hasSales }) {
  const orderFormat = form.order_document_type ?? "receipt";
  const { showThermal, showA4 } = orderPrintFormatSections(orderFormat);
  const visibleFooterKeys = footerKeysForOrderPrintFormat(footerKeys, orderFormat);
  const showBranchSetting = showThermal || showA4;

  return (
    <div className="space-y-6">
      {hasSales ? (
        <div>
          <SectionHeading
            title="Sales order printing"
            description="Document format, receipt copies, and the branch or organization contact lines on thermal and A4 sales printouts."
          />
          <div className="mt-4 space-y-3">
            <OrderPrintFormatField form={form} setForm={setForm} />
            {showThermal ? (
              <div className="space-y-3 border-t border-slate-200 pt-4">
                <Field label="Receipt copies">
                  <select
                    className={inputClassName()}
                    value={form.receipt_copies}
                    onChange={(e) => setForm((f) => ({ ...f, receipt_copies: e.target.value }))}
                  >
                    <option value="1">Single receipt</option>
                    <option value="2">Double receipt (customer + merchant)</option>
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    How many copies print when staff print an order to a thermal printer.
                  </p>
                </Field>
              </div>
            ) : null}
            {showBranchSetting ? (
              <Toggle
                label="Show selling branch on sales printouts"
                description="When on, thermal receipts and A4 invoices print the order branch name, address, and phone from Admin → Branches below your company header. When off, those lines use your organization address and phone instead. Company logo, email, and tax PIN always come from organization settings."
                checked={form.show_branch_on_receipt}
                onChange={(v) => setForm((f) => ({ ...f, show_branch_on_receipt: v }))}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      <div>
        <SectionHeading
          title="Document branding"
          description="Logo and organization header shown on all printouts."
        />
        <div className="mt-4 space-y-3">
          <Toggle
            label="Show organization name on documents"
            description="Include your company name and address on printed documents."
            checked={form.show_organization_on_documents}
            onChange={(v) => setForm((f) => ({ ...f, show_organization_on_documents: v }))}
          />
          <Field label="Report and document header">
            <select
              className={inputClassName()}
              value={form.document_header_display}
              onChange={(e) => setForm((f) => ({ ...f, document_header_display: e.target.value }))}
            >
              {DOCUMENT_HEADER_DISPLAY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <div>
        <SectionHeading
          title="Document footers"
          description="Editable closing text on thermal receipts and A4 invoices (one line per row). Use placeholders below. Designed & Developed By, Printed By, and Printed On are always fixed on A4."
        />
        <div className="mt-4 space-y-3">
          {visibleFooterKeys.length === 0 ? (
            <p className="text-sm text-slate-500">
              Enable Sales, Procurement, or Distribution to configure document footers for those printouts.
            </p>
          ) : null}
          {visibleFooterKeys.map((key) => {
            const label = PRINT_FOOTER_LABELS[key];
            return (
              <Field key={key} label={label}>
                <textarea
                  className={inputClassName()}
                  rows={key === "receipt" ? 4 : key === "invoice" ? 6 : 2}
                  value={form[PRINT_FOOTER_FORM_KEYS[key]] ?? ""}
                  onChange={(e) => {
                    const fieldKey = PRINT_FOOTER_FORM_KEYS[key];
                    const nextValue =
                      key === "receipt" ? receiptFooterForAdmin(e.target.value) : e.target.value;
                    setForm((f) => ({
                      ...f,
                      [fieldKey]: nextValue,
                    }));
                  }}
                  placeholder={
                    key === "receipt"
                      ? "You were served by: {username}\nThank you for your business!\nGoods once sold are not returnable."
                      : key === "invoice"
                        ? defaultInvoiceBodyFooterForAdmin()
                        : "Optional footer text for this document only"
                  }
                />
                {key === "receipt" ? (
                  <p className="mt-2 rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    Always printed (not editable):{" "}
                    <span className="font-medium text-slate-800">{RECEIPT_POWERED_BY_LINE}</span>
                  </p>
                ) : null}
                {key === "receipt" || key === "invoice" ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Placeholders: {SALES_FOOTER_PLACEHOLDER_HINT}
                  </p>
                ) : null}
                {key === "invoice" ? (
                  <p className="mt-2 rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    Always printed on A4 (not editable): Designed &amp; Developed By, Printed By, and
                    Printed On.
                  </p>
                ) : null}
              </Field>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function OrderPrintFormatField({ form, setForm }) {
  return (
    <Field label="Order print format">
      <select
        className={inputClassName()}
        value={form.order_document_type}
        onChange={(e) => setForm((f) => ({ ...f, order_document_type: e.target.value }))}
      >
        <option value="receipt">Thermal receipt only</option>
        <option value="invoice">A4 sales invoice only</option>
        <option value="both">Both — choose at print time</option>
      </select>
      <p className="mt-1 text-xs text-slate-500">
        Thermal receipt only shows the thermal printout tab. A4 invoice only shows the A4 tab. Both enables
        both tabs and lets staff choose at print time.
      </p>
    </Field>
  );
}

function PaymentInstructionsSharedSection({ form, setForm, hasMobileSales, idPrefix }) {
  return (
    <>
      <Toggle
        label="Use same payment instructions for mobile / route orders"
        checked={form.use_same_payment_details_for_routes}
        onChange={(v) => setForm((f) => ({ ...f, use_same_payment_details_for_routes: v }))}
        disabled={!hasMobileSales}
        description={
          hasMobileSales
            ? "When off, configure separate payment instructions for mobile and route orders below."
            : "Enable the mobile sales module to configure separate route payment instructions."
        }
      />
      <ReceiptPaymentDetailsEditor
        value={form.pos_receipt_payment_details}
        onChange={(value) => setForm((f) => ({ ...f, pos_receipt_payment_details: value }))}
        idPrefix={`${idPrefix}-pos-pay`}
      />
      {!form.use_same_payment_details_for_routes && hasMobileSales ? (
        <ReceiptPaymentDetailsEditor
          value={form.route_receipt_payment_details}
          onChange={(value) => setForm((f) => ({ ...f, route_receipt_payment_details: value }))}
          idPrefix={`${idPrefix}-route-pay`}
        />
      ) : null}
    </>
  );
}

function ThermalReceiptsTab({ form, setForm, hasMobileSales }) {
  return (
    <div className="space-y-3">
      <SectionHeading
        title="Thermal receipts"
        description="POS and backoffice narrow receipt printers."
      />
      <PrintFontSettingsFields
        form={form}
        setForm={setForm}
        variantKey="receipt"
        description="Font for narrow thermal receipt printers only."
      />
      <Toggle
        label="Show payment instructions on thermal receipts"
        checked={form.show_receipt_payment_details}
        onChange={(v) => setForm((f) => ({ ...f, show_receipt_payment_details: v }))}
      />
      <PaymentInstructionsSharedSection
        form={form}
        setForm={setForm}
        hasMobileSales={hasMobileSales}
        idPrefix="printouts-thermal"
      />
    </div>
  );
}

function A4InvoicesTab({ form, setForm, hasMobileSales }) {
  return (
    <div className="space-y-3">
      <SectionHeading
        title="A4 invoice receipts"
        description="Valid-until date on the invoice header. Closing text (served by, goods confirmation, signatures) is configured under General → Document footers → A4 sales invoice footer."
      />
      <PrintFontSettingsFields
        form={form}
        setForm={setForm}
        variantKey="invoice"
        description="Font for A4 invoice receipts and similar sales documents."
      />
      <Field label="Invoice valid for (days)">
        <input
          type="number"
          min={0}
          max={365}
          className={`${inputClassName()} w-32`}
          value={form.invoice_valid_days}
          onChange={(e) => setForm((f) => ({ ...f, invoice_valid_days: e.target.value }))}
        />
      </Field>
      <Toggle
        label="Show payment instructions on A4 sales invoices"
        checked={form.show_invoice_payment_details}
        onChange={(v) => setForm((f) => ({ ...f, show_invoice_payment_details: v }))}
      />
      <PaymentInstructionsSharedSection
        form={form}
        setForm={setForm}
        hasMobileSales={hasMobileSales}
        idPrefix="printouts-invoice"
      />
    </div>
  );
}

function LpoPrintoutsTab({ form, setForm }) {
  return (
    <div className="space-y-3">
      <SectionHeading title="Local purchase orders (LPO)" />
      <PrintFontSettingsFields
        form={form}
        setForm={setForm}
        variantKey="lpo"
        description="Font for local purchase order printouts."
      />
      <MultilinePrintNotesField
        label="Default delivery notes"
        value={form.lpo_print_delivery_notes}
        onChange={(value) => setForm((f) => ({ ...f, lpo_print_delivery_notes: value }))}
        rows={8}
      />
      <Field label="KEBS warning line">
        <input
          type="text"
          className={inputClassName()}
          value={form.lpo_print_kebs_warning}
          onChange={(e) => setForm((f) => ({ ...f, lpo_print_kebs_warning: e.target.value }))}
        />
      </Field>
      <Field label="VAT / ETR note">
        <input
          type="text"
          className={inputClassName()}
          value={form.lpo_print_vat_note}
          onChange={(e) => setForm((f) => ({ ...f, lpo_print_vat_note: e.target.value }))}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Default checked by">
          <input
            type="text"
            className={inputClassName()}
            value={form.lpo_print_checked_by}
            onChange={(e) => setForm((f) => ({ ...f, lpo_print_checked_by: e.target.value }))}
          />
        </Field>
        <Field label="Default authorised by">
          <input
            type="text"
            className={inputClassName()}
            value={form.lpo_print_authorised_by}
            onChange={(e) => setForm((f) => ({ ...f, lpo_print_authorised_by: e.target.value }))}
          />
        </Field>
      </div>
      <MultilinePrintNotesField
        label="LPO footer lines"
        value={form.lpo_print_footer_lines}
        onChange={(value) => setForm((f) => ({ ...f, lpo_print_footer_lines: value }))}
        rows={5}
      />
    </div>
  );
}

function LoadingSheetsTab({ form, setForm }) {
  return (
    <div className="space-y-3">
      <SectionHeading
        title="Loading sheets"
        description="Route pick lists. Column visibility can also be configured under Distribution → Trips & loading."
      />
      <PrintFontSettingsFields
        form={form}
        setForm={setForm}
        variantKey="loading_sheet"
        description="Font for route loading sheets and delivery notes."
      />
      <LoadingListPrintSettingsFields form={form} setForm={setForm} />
    </div>
  );
}

function previewTypeForTab(tabId, previewTypes = []) {
  if (tabId === "receipt" || tabId === "invoice" || tabId === "lpo" || tabId === "loading_sheet") {
    return tabId;
  }
  return previewTypes[0] ?? "receipt";
}

export function PrintoutsSettingsPanel({
  saving,
  setSaving,
  setError,
  setMessage,
  onAfterSave,
  capabilities,
}) {
  const { refreshCapabilities } = useAuth();
  const { settingsPath } = useSettingsApi();
  const previewContext = useDocumentPrintPreviewContext();
  const afterSave = onAfterSave ?? refreshCapabilities;
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("general");

  const sections = resolvePrintoutSections(capabilities);
  const { hasSales, hasProcurement, hasDistribution, hasMobileSales, footerKeys } = sections;
  const orderFormat = form?.order_document_type ?? "receipt";
  const { showThermal, showA4 } = orderPrintFormatSections(orderFormat);

  const visibleTabs = useMemo(
    () =>
      PRINTOUT_TABS.filter((tab) => {
        if (tab.requiresSales && !hasSales) return false;
        if (tab.id === "receipt" && (!hasSales || !showThermal)) return false;
        if (tab.id === "invoice" && (!hasSales || !showA4)) return false;
        if (tab.requiresProcurement && !hasProcurement) return false;
        if (tab.requiresDistribution && !hasDistribution) return false;
        return true;
      }),
    [hasDistribution, hasProcurement, hasSales, showA4, showThermal],
  );

  useEffect(() => {
    if (!form) return;
    if (activeTab === "receipt" && !showThermal) {
      setActiveTab("general");
    } else if (activeTab === "invoice" && !showA4) {
      setActiveTab("general");
    }
  }, [activeTab, form, showA4, showThermal]);

  const filteredPreviewTypes = useMemo(
    () =>
      sections.previewTypes.filter((type) => {
        if (type === "receipt") return showThermal;
        if (type === "invoice") return showA4;
        return true;
      }),
    [sections.previewTypes, showA4, showThermal],
  );

  useEffect(() => {
    if (visibleTabs.length === 0) return;
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [activeTab, visibleTabs]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [generalResult, salesResult, procurementResult, distributionResult] =
        await Promise.allSettled([
          apiRequest(settingsPath("general")),
          hasSales ? apiRequest(settingsPath("sales")) : Promise.resolve(null),
          hasProcurement ? apiRequest(settingsPath("procurement")) : Promise.resolve(null),
          hasDistribution ? apiRequest(settingsPath("distribution")) : Promise.resolve(null),
        ]);

      const valueFrom = (result) => (result.status === "fulfilled" ? result.value : null);

      setForm(
        printoutsFormFromApis({
          generalRes: valueFrom(generalResult),
          salesRes: valueFrom(salesResult),
          procurementRes: valueFrom(procurementResult),
          distributionRes: valueFrom(distributionResult),
        }),
      );

      if (generalResult.status === "rejected") {
        const e = generalResult.reason;
        setError(e instanceof ApiError ? e.message : "Failed to load printout settings");
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load printout settings");
    } finally {
      setLoading(false);
    }
  }, [hasDistribution, hasProcurement, hasSales, setError, settingsPath]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const tasks = [
        apiRequest(settingsPath("general"), {
          method: "PATCH",
          body: printoutsGeneralPayloadFromForm(form),
        }),
      ];
      if (hasSales) {
        tasks.push(
          apiRequest(settingsPath("sales"), {
            method: "PATCH",
            body: printoutsSalesPayloadFromForm(form),
          }),
        );
      }
      if (hasProcurement) {
        tasks.push(
          apiRequest(settingsPath("procurement"), {
            method: "PATCH",
            body: printoutsProcurementPayloadFromForm(form),
          }),
        );
      }
      if (hasDistribution) {
        tasks.push(
          apiRequest(settingsPath("distribution"), {
            method: "PATCH",
            body: printoutsDistributionPayloadFromForm(form),
          }),
        );
      }
      const results = await Promise.allSettled(tasks);
      const failed = results.find((result) => result.status === "rejected");
      if (failed) {
        const e = failed.reason;
        throw e instanceof ApiError ? e : new Error("Failed to save printout settings");
      }
      await load();
      if (afterSave) await afterSave();
      setMessage("Printout settings saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save printout settings");
    } finally {
      setSaving(false);
    }
  }

  function renderActiveTab() {
    if (!form) return null;

    if (activeTab === "general") {
      return (
        <GeneralPrintoutsTab
          form={form}
          setForm={setForm}
          footerKeys={footerKeys}
          hasSales={hasSales}
        />
      );
    }
    if (activeTab === "receipt" && hasSales) {
      return <ThermalReceiptsTab form={form} setForm={setForm} hasMobileSales={hasMobileSales} />;
    }
    if (activeTab === "invoice" && hasSales) {
      return <A4InvoicesTab form={form} setForm={setForm} hasMobileSales={hasMobileSales} />;
    }
    if (activeTab === "lpo" && hasProcurement) {
      return <LpoPrintoutsTab form={form} setForm={setForm} />;
    }
    if (activeTab === "loading_sheet" && hasDistribution) {
      return <LoadingSheetsTab form={form} setForm={setForm} />;
    }

    return (
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Sales, procurement, and distribution printout options appear here when those modules are enabled
        for your organization.
      </p>
    );
  }

  return (
    <form onSubmit={handleSave}>
      <section className="theme-panel rounded-xl border p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Printouts</h2>
        <p className="mt-1 text-sm text-slate-500">
          Customize each document type in its own tab. The live preview updates as you edit. One save applies
          all tabs.
        </p>

        {loading || !form ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="mt-5 space-y-4">
            <PrintoutsTabBar tabs={visibleTabs} activeTab={activeTab} onTabChange={setActiveTab} />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
              <div className="min-h-[20rem] rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                {renderActiveTab()}
              </div>

              <PrintoutsLivePreview
                key={activeTab}
                form={form}
                organization={previewContext.organization}
                moduleSettings={previewContext.moduleSettings}
                capabilities={capabilities}
                defaultType={previewTypeForTab(activeTab, filteredPreviewTypes)}
              />
            </div>
          </div>
        )}

        <div className="mt-6">
          <PrimaryButton type="submit" disabled={loading || saving || !form} showIcon={false}>
            {saving ? "Saving…" : "Save printout settings"}
          </PrimaryButton>
        </div>
      </section>
    </form>
  );
}
