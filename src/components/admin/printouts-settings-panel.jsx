"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { DOCUMENT_HEADER_DISPLAY_OPTIONS } from "@/lib/general-settings";
import {
  printoutsFormFromApis,
  printoutsGeneralPayloadFromForm,
  printoutsProcurementPayloadFromForm,
  printoutsSalesPayloadFromForm,
} from "@/lib/printouts-settings";
import { ReceiptPaymentDetailsEditor } from "@/components/admin/receipt-payment-details-editor";
import { MultilinePrintNotesField } from "@/components/admin/multiline-print-notes-field";
import {
  DocumentPrintPreviewButton,
  previewLpoPrint,
  previewLoadingListPrint,
  previewReceiptPaymentDetails,
  previewSaleInvoicePrint,
  useDocumentPrintPreviewContext,
} from "@/components/admin/document-print-preview";
import { useSettingsApi } from "@/contexts/settings-api-context";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";

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
    <div className="border-t border-slate-200 pt-6 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
    </div>
  );
}

export function PrintoutsSettingsPanel({
  saving,
  setSaving,
  setError,
  setMessage,
  onAfterSave,
  capabilities,
}) {
  const { settingsPath } = useSettingsApi();
  const previewContext = useDocumentPrintPreviewContext();
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);

  const modules = capabilities?.modules ?? {};
  const hasSales = Boolean(modules.sales);
  const hasProcurement = Boolean(modules.customers_suppliers);
  const hasGeneral = Boolean(modules.admin);
  const hasLoadingSheets = Boolean(modules.distribution || modules["sales.mobile"]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [generalRes, salesRes, procurementRes] = await Promise.all([
        hasGeneral ? apiRequest(settingsPath("general")) : Promise.resolve(null),
        hasSales ? apiRequest(settingsPath("sales")) : Promise.resolve(null),
        hasProcurement ? apiRequest(settingsPath("procurement")) : Promise.resolve(null),
      ]);
      setForm(printoutsFormFromApis({ generalRes, salesRes, procurementRes }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load printout settings");
    } finally {
      setLoading(false);
    }
  }, [hasGeneral, hasProcurement, hasSales, setError, settingsPath]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const tasks = [];
      if (hasGeneral) {
        tasks.push(
          apiRequest(settingsPath("general"), {
            method: "PATCH",
            body: printoutsGeneralPayloadFromForm(form),
          }),
        );
      }
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
      await Promise.all(tasks);
      await load();
      if (onAfterSave) await onAfterSave();
      setMessage("Printout settings saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save printout settings");
    } finally {
      setSaving(false);
    }
  }

  const salesPreviewForm = form
    ? {
        order_document_type: form.order_document_type,
        invoice_valid_days: form.invoice_valid_days,
        show_receipt_payment_details: form.show_receipt_payment_details,
        show_invoice_payment_details: form.show_invoice_payment_details,
        use_same_payment_details_for_routes: form.use_same_payment_details_for_routes,
        pos_receipt_payment_details: form.pos_receipt_payment_details,
        route_receipt_payment_details: form.route_receipt_payment_details,
        invoice_print_delivery_terms: form.invoice_print_delivery_terms,
        invoice_print_footer_lines: form.invoice_print_footer_lines,
      }
    : null;

  return (
    <form onSubmit={handleSave}>
      <section className="theme-panel rounded-xl border p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Printouts</h2>
        <p className="mt-1 text-sm text-slate-500">
          Customize branding, receipts, tax invoices, and LPO documents. Use preview to check layout
          before saving.
        </p>

        {loading || !form ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="mt-5 space-y-6">
            {hasGeneral ? (
              <div>
                <SectionHeading
                  title="Document branding"
                  description="Organization header, footer, and logo display on all printed documents."
                />
                <div className="mt-4 space-y-3">
                  <Field label="Document footer text">
                    <textarea
                      className={inputClassName()}
                      rows={3}
                      value={form.document_footer_text}
                      onChange={(e) => setForm((f) => ({ ...f, document_footer_text: e.target.value }))}
                      placeholder="Shown on printed receipts, invoices, and LPO documents."
                    />
                  </Field>
                  <Toggle
                    label="Show organization name on documents"
                    description="Include your company name and address on printed sales and procurement documents."
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
            ) : null}

            {hasSales ? (
              <div>
                <SectionHeading
                  title="Sales receipts"
                  description="Thermal receipt format, copies, and payment instructions."
                />
                <div className="mt-4 space-y-3">
                  <Field label="Order print format">
                    <select
                      className={inputClassName()}
                      value={form.order_document_type}
                      onChange={(e) => setForm((f) => ({ ...f, order_document_type: e.target.value }))}
                    >
                      <option value="receipt">Thermal receipt only</option>
                      <option value="invoice">A4 tax invoice only</option>
                      <option value="both">Both — choose at print time</option>
                    </select>
                    <p className="mt-1 text-xs text-slate-500">
                      Thermal for receipt printers, A4 for detailed tax invoices.
                    </p>
                  </Field>
                  <Field label="Receipt copies">
                    <select
                      className={inputClassName()}
                      value={form.receipt_copies}
                      onChange={(e) => setForm((f) => ({ ...f, receipt_copies: e.target.value }))}
                    >
                      <option value="1">Single receipt</option>
                      <option value="2">Double receipt (customer + merchant)</option>
                    </select>
                  </Field>
                  <Toggle
                    label="Show branch details on receipt"
                    description="When enabled and a branch is selected, receipt will show branch name, address and phone."
                    checked={form.show_branch_on_receipt}
                    onChange={(v) => setForm((f) => ({ ...f, show_branch_on_receipt: v }))}
                  />
                  <Toggle
                    label="Show payment instructions on thermal receipts"
                    checked={form.show_receipt_payment_details}
                    onChange={(v) => setForm((f) => ({ ...f, show_receipt_payment_details: v }))}
                  />
                  <Toggle
                    label="Show payment instructions on A4 invoices"
                    checked={form.show_invoice_payment_details}
                    onChange={(v) => setForm((f) => ({ ...f, show_invoice_payment_details: v }))}
                  />
                  <Toggle
                    label="Use same payment instructions for mobile / route orders"
                    description="When off, configure separate instructions for mobile field sales and POS route orders. Individual routes can still override for mobile orders."
                    checked={form.use_same_payment_details_for_routes}
                    onChange={(v) => setForm((f) => ({ ...f, use_same_payment_details_for_routes: v }))}
                  />
                  <p className="text-sm font-medium text-slate-900">POS & backoffice receipts</p>
                  <ReceiptPaymentDetailsEditor
                    value={form.pos_receipt_payment_details}
                    onChange={(value) => setForm((f) => ({ ...f, pos_receipt_payment_details: value }))}
                    idPrefix="printouts-pos-pay"
                  />
                  {!form.use_same_payment_details_for_routes ? (
                    <>
                      <p className="text-sm font-medium text-slate-900">Mobile & route order receipts</p>
                      <ReceiptPaymentDetailsEditor
                        value={form.route_receipt_payment_details}
                        onChange={(value) =>
                          setForm((f) => ({ ...f, route_receipt_payment_details: value }))
                        }
                        idPrefix="printouts-route-pay"
                        description="Used for mobile orders and POS route-mode orders unless a route defines its own paybill details."
                      />
                    </>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <DocumentPrintPreviewButton
                      label="Preview POS receipt"
                      onPreview={() =>
                        previewReceiptPaymentDetails({
                          ...previewContext,
                          salesForm: salesPreviewForm,
                          channel: "pos",
                        })
                      }
                    />
                    {!form.use_same_payment_details_for_routes ? (
                      <DocumentPrintPreviewButton
                        label="Preview route receipt"
                        onPreview={() =>
                          previewReceiptPaymentDetails({
                            ...previewContext,
                            salesForm: salesPreviewForm,
                            channel: "mobile",
                          })
                        }
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {hasSales ? (
              <div>
                <SectionHeading
                  title="Tax invoices"
                  description="A4 invoice delivery instructions and footer lines. Use {organization} and {days} placeholders in footer lines."
                />
                <div className="mt-4 space-y-3">
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
                  <MultilinePrintNotesField
                    label="Delivery instructions"
                    hint="One instruction per line. Shown in the numbered list on the invoice."
                    value={form.invoice_print_delivery_terms}
                    onChange={(value) => setForm((f) => ({ ...f, invoice_print_delivery_terms: value }))}
                    rows={8}
                  />
                  <MultilinePrintNotesField
                    label="Invoice footer lines"
                    hint="One line per row in the footer block below signatures."
                    value={form.invoice_print_footer_lines}
                    onChange={(value) => setForm((f) => ({ ...f, invoice_print_footer_lines: value }))}
                    rows={6}
                  />
                  <DocumentPrintPreviewButton
                    label="Preview tax invoice"
                    onPreview={() =>
                      previewSaleInvoicePrint({
                        ...previewContext,
                        salesForm: salesPreviewForm,
                      })
                    }
                  />
                </div>
              </div>
            ) : null}

            {hasProcurement ? (
              <div>
                <SectionHeading
                  title="Local purchase orders (LPO)"
                  description="Default notes and warnings on printed LPOs. Per-LPO instructions in the LPO form still override the delivery notes list when set."
                />
                <div className="mt-4 space-y-3">
                  <MultilinePrintNotesField
                    label="Default delivery notes"
                    hint="One numbered note per line."
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
                  <DocumentPrintPreviewButton
                    label="Preview LPO"
                    onPreview={() =>
                      previewLpoPrint({
                        ...previewContext,
                        procurementForm: form,
                      })
                    }
                  />
                </div>
              </div>
            ) : null}

            {hasLoadingSheets ? (
              <div>
                <SectionHeading
                  title="Loading sheets"
                  description="Route pick lists for mobile orders and distribution trips. Uses document branding above — company name, logo, watermark, and footer."
                />
                <div className="mt-4">
                  <DocumentPrintPreviewButton
                    label="Preview loading sheet"
                    onPreview={() =>
                      previewLoadingListPrint({
                        ...previewContext,
                        printoutsForm: form,
                      })
                    }
                  />
                </div>
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-6">
          <PrimaryButton type="submit" disabled={loading || saving || !form} showIcon={false}>
            {saving ? "Saving…" : "Save"}
          </PrimaryButton>
        </div>
      </section>
    </form>
  );
}
