"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { DOCUMENT_HEADER_DISPLAY_OPTIONS } from "@/lib/general-settings";
import {
  PRINT_FOOTER_FORM_KEYS,
  PRINT_FOOTER_LABELS,
  RECEIPT_POWERED_BY_LINE,
  receiptFooterForAdmin,
} from "@/lib/print-footer-settings";
import {
  printoutsDistributionPayloadFromForm,
  printoutsFormFromApis,
  printoutsGeneralPayloadFromForm,
  printoutsProcurementPayloadFromForm,
  printoutsSalesPayloadFromForm,
} from "@/lib/printouts-settings";
import { ReceiptPaymentDetailsEditor } from "@/components/admin/receipt-payment-details-editor";
import { MultilinePrintNotesField } from "@/components/admin/multiline-print-notes-field";
import { PrintoutsLivePreview } from "@/components/admin/printouts-live-preview";
import { useDocumentPrintPreviewContext } from "@/components/admin/document-print-preview";
import { useAuth } from "@/contexts/auth-context";
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
  const { refreshCapabilities } = useAuth();
  const { settingsPath } = useSettingsApi();
  const previewContext = useDocumentPrintPreviewContext();
  const afterSave = onAfterSave ?? refreshCapabilities;
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
      const [generalRes, salesRes, procurementRes, distributionRes] = await Promise.all([
        hasGeneral ? apiRequest(settingsPath("general")) : Promise.resolve(null),
        hasSales ? apiRequest(settingsPath("sales")) : Promise.resolve(null),
        hasProcurement ? apiRequest(settingsPath("procurement")) : Promise.resolve(null),
        hasLoadingSheets ? apiRequest(settingsPath("distribution")) : Promise.resolve(null),
      ]);
      setForm(
        printoutsFormFromApis({ generalRes, salesRes, procurementRes, distributionRes }),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load printout settings");
    } finally {
      setLoading(false);
    }
  }, [hasGeneral, hasLoadingSheets, hasProcurement, hasSales, setError, settingsPath]);

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
      if (hasLoadingSheets) {
        tasks.push(
          apiRequest(settingsPath("distribution"), {
            method: "PATCH",
            body: printoutsDistributionPayloadFromForm(form),
          }),
        );
      }
      await Promise.all(tasks);
      await load();
      if (afterSave) await afterSave();
      setMessage("Printout settings saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save printout settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave}>
      <section className="theme-panel rounded-xl border p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Printouts</h2>
        <p className="mt-1 text-sm text-slate-500">
          Customize each document type separately. The live preview on the right updates as you
          edit.
        </p>

        {loading || !form ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
            <div className="space-y-6">
              {hasGeneral ? (
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
                        onChange={(e) =>
                          setForm((f) => ({ ...f, document_header_display: e.target.value }))
                        }
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

              {hasGeneral ? (
                <div>
                  <SectionHeading
                    title="Document footers"
                    description="Each printout type has its own footer. Thermal receipt: one centered line per row (use {organization} for company name). Vendor credit on receipts is fixed and always printed."
                  />
                  <div className="mt-4 space-y-3">
                    {Object.entries(PRINT_FOOTER_LABELS).map(([key, label]) => (
                      <Field key={key} label={label}>
                        <textarea
                          className={inputClassName()}
                          rows={key === "receipt" ? 4 : 2}
                          value={form[PRINT_FOOTER_FORM_KEYS[key]] ?? ""}
                          onChange={(e) => {
                            const fieldKey = PRINT_FOOTER_FORM_KEYS[key];
                            const nextValue =
                              key === "receipt"
                                ? receiptFooterForAdmin(e.target.value)
                                : e.target.value;
                            setForm((f) => ({
                              ...f,
                              [fieldKey]: nextValue,
                            }));
                          }}
                          placeholder={
                            key === "receipt"
                              ? "Thank you for your business!\nGoods once sold are not returnable."
                              : "Optional footer text for this document only"
                          }
                        />
                        {key === "receipt" ? (
                          <p className="mt-2 rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                            Always printed (not editable):{" "}
                            <span className="font-medium text-slate-800">{RECEIPT_POWERED_BY_LINE}</span>
                          </p>
                        ) : null}
                      </Field>
                    ))}
                  </div>
                </div>
              ) : null}

              {hasSales ? (
                <div>
                  <SectionHeading
                    title="Thermal receipts"
                    description="POS and backoffice narrow receipt printers."
                  />
                  <div className="mt-4 space-y-3">
                    <Field label="Order print format">
                      <select
                        className={inputClassName()}
                        value={form.order_document_type}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, order_document_type: e.target.value }))
                        }
                      >
                        <option value="receipt">Thermal receipt only</option>
                        <option value="invoice">A4 sales invoice only</option>
                        <option value="both">Both — choose at print time</option>
                      </select>
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
                      checked={form.show_branch_on_receipt}
                      onChange={(v) => setForm((f) => ({ ...f, show_branch_on_receipt: v }))}
                    />
                    <Toggle
                      label="Show payment instructions on thermal receipts"
                      checked={form.show_receipt_payment_details}
                      onChange={(v) =>
                        setForm((f) => ({ ...f, show_receipt_payment_details: v }))
                      }
                    />
                    <Toggle
                      label="Show payment instructions on A4 sales invoices"
                      checked={form.show_invoice_payment_details}
                      onChange={(v) =>
                        setForm((f) => ({ ...f, show_invoice_payment_details: v }))
                      }
                    />
                    <Toggle
                      label="Use same payment instructions for mobile / route orders"
                      checked={form.use_same_payment_details_for_routes}
                      onChange={(v) =>
                        setForm((f) => ({ ...f, use_same_payment_details_for_routes: v }))
                      }
                    />
                    <ReceiptPaymentDetailsEditor
                      value={form.pos_receipt_payment_details}
                      onChange={(value) =>
                        setForm((f) => ({ ...f, pos_receipt_payment_details: value }))
                      }
                      idPrefix="printouts-pos-pay"
                    />
                    {!form.use_same_payment_details_for_routes ? (
                      <ReceiptPaymentDetailsEditor
                        value={form.route_receipt_payment_details}
                        onChange={(value) =>
                          setForm((f) => ({ ...f, route_receipt_payment_details: value }))
                        }
                        idPrefix="printouts-route-pay"
                      />
                    ) : null}
                  </div>
                </div>
              ) : null}

              {hasSales ? (
                <div>
                  <SectionHeading
                    title="A4 sales invoices"
                    description="Full-page invoices for credit sales and detailed orders. Use {organization} and {days} in footer lines."
                  />
                  <div className="mt-4 space-y-3">
                    <Field label="Invoice valid for (days)">
                      <input
                        type="number"
                        min={0}
                        max={365}
                        className={`${inputClassName()} w-32`}
                        value={form.invoice_valid_days}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, invoice_valid_days: e.target.value }))
                        }
                      />
                    </Field>
                    <MultilinePrintNotesField
                      label="Delivery instructions"
                      value={form.invoice_print_delivery_terms}
                      onChange={(value) =>
                        setForm((f) => ({ ...f, invoice_print_delivery_terms: value }))
                      }
                      rows={8}
                    />
                    <MultilinePrintNotesField
                      label="Invoice footer lines"
                      value={form.invoice_print_footer_lines}
                      onChange={(value) =>
                        setForm((f) => ({ ...f, invoice_print_footer_lines: value }))
                      }
                      rows={6}
                    />
                  </div>
                </div>
              ) : null}

              {hasProcurement ? (
                <div>
                  <SectionHeading title="Local purchase orders (LPO)" />
                  <div className="mt-4 space-y-3">
                    <MultilinePrintNotesField
                      label="Default delivery notes"
                      value={form.lpo_print_delivery_notes}
                      onChange={(value) =>
                        setForm((f) => ({ ...f, lpo_print_delivery_notes: value }))
                      }
                      rows={8}
                    />
                    <Field label="KEBS warning line">
                      <input
                        type="text"
                        className={inputClassName()}
                        value={form.lpo_print_kebs_warning}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, lpo_print_kebs_warning: e.target.value }))
                        }
                      />
                    </Field>
                    <Field label="VAT / ETR note">
                      <input
                        type="text"
                        className={inputClassName()}
                        value={form.lpo_print_vat_note}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, lpo_print_vat_note: e.target.value }))
                        }
                      />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Default checked by">
                        <input
                          type="text"
                          className={inputClassName()}
                          value={form.lpo_print_checked_by}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, lpo_print_checked_by: e.target.value }))
                          }
                        />
                      </Field>
                      <Field label="Default authorised by">
                        <input
                          type="text"
                          className={inputClassName()}
                          value={form.lpo_print_authorised_by}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, lpo_print_authorised_by: e.target.value }))
                          }
                        />
                      </Field>
                    </div>
                    <MultilinePrintNotesField
                      label="LPO footer lines"
                      value={form.lpo_print_footer_lines}
                      onChange={(value) =>
                        setForm((f) => ({ ...f, lpo_print_footer_lines: value }))
                      }
                      rows={5}
                    />
                  </div>
                </div>
              ) : null}

              {hasLoadingSheets ? (
                <div>
                  <SectionHeading
                    title="Loading sheets"
                    description="Route pick lists. Price (R/W) shows wholesale (W) and retail (R) prices on separate rows when both are sold."
                  />
                  <div className="mt-4 space-y-3">
                    <Toggle
                      label="Show prepared / checked signature blocks"
                      checked={form.loading_sheet_show_signatures}
                      onChange={(v) =>
                        setForm((f) => ({ ...f, loading_sheet_show_signatures: v }))
                      }
                    />
                    <Field label="Default checked by">
                      <input
                        type="text"
                        className={inputClassName()}
                        value={form.loading_sheet_default_checked_by}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            loading_sheet_default_checked_by: e.target.value,
                          }))
                        }
                      />
                    </Field>
                    <MultilinePrintNotesField
                      label="Loading sheet footer lines"
                      hint="One line per row below the table."
                      value={form.loading_sheet_footer_lines}
                      onChange={(value) =>
                        setForm((f) => ({ ...f, loading_sheet_footer_lines: value }))
                      }
                      rows={4}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <PrintoutsLivePreview
              form={form}
              organization={previewContext.organization}
              moduleSettings={previewContext.moduleSettings}
            />
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
