"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { DOCUMENT_HEADER_DISPLAY_OPTIONS } from "@/lib/general-settings";
import {
  PRINT_FOOTER_FORM_KEYS,
  PRINT_FOOTER_LABELS,
  RECEIPT_POWERED_BY_LINE,
} from "@/lib/print-footer-settings";
import { SALES_FOOTER_PLACEHOLDER_HINT } from "@/lib/sales-document-footer";
import {
  orderPrintFormatSections,
  PRINTOUT_KIND_LABELS,
  printoutsDistributionPayloadFromForm,
  printoutsFormFromApis,
  printoutsGeneralPayloadFromForm,
  printoutsHospitalityPayloadFromForm,
  printoutsProcurementPayloadFromForm,
  printoutsSalesPayloadFromForm,
  resolvePrintoutSections,
} from "@/lib/printouts-settings";
import { FooterLineEditor } from "@/components/admin/footer-line-editor";
import { DocumentPrintPhonesFields } from "@/components/admin/document-print-phones-fields";
import { PrintFontSettingsFields } from "@/components/admin/print-font-settings-fields";
import { DocumentLogoSettingsFields } from "@/components/admin/document-logo-settings-fields";
import { ReceiptPaymentDetailsEditor } from "@/components/admin/receipt-payment-details-editor";
import { MultilinePrintNotesField } from "@/components/admin/multiline-print-notes-field";
import { LoadingListPrintSettingsFields } from "@/components/admin/loading-list-print-settings-fields";
import { PrintoutsLivePreview } from "@/components/admin/printouts-live-preview";
import { useDocumentPrintPreviewContext } from "@/components/admin/document-print-preview";
import { useSettingsApi, useSettingsAfterSave } from "@/contexts/settings-api-context";
import { Field, PrimaryButton, inputClassName, SearchableSelect } from "@/components/catalog/catalog-shared";
import {
  ORG_DOCUMENT_DESIGN_TEMPLATES,
  orgDocumentTemplateMeta,
} from "@/lib/document-print-templates";
import { formatPrintPhones } from "@/lib/document-print-phones";

const PRINTOUT_TAB_BTN =
  "rounded-md px-3 py-1.5 text-sm font-medium transition whitespace-nowrap";
const PRINTOUT_TAB_BTN_ACTIVE = "bg-white text-[#185FA5] shadow-sm";
const PRINTOUT_TAB_BTN_IDLE = "text-slate-600 hover:text-slate-900";

function DocumentTemplateSelect({
  form,
  setForm,
  settingKey,
  label = "Document template",
}) {
  const value = form?.[settingKey] ?? "default";
  const meta = orgDocumentTemplateMeta(value);
  return (
    <div className="space-y-1">
      <Field label={label}>
        <SearchableSelect
  className={inputClassName()}
  value={value}
  nativeEvent
  onChange={((e) => setForm((f) => ({ ...f, [settingKey]: e.target.value })))}
  options={ORG_DOCUMENT_DESIGN_TEMPLATES.map((tpl) => ({ value: tpl.id, label: tpl.label }))}
/>
      </Field>
      {meta?.description ? (
        <p className="text-xs text-slate-500">{meta.description}</p>
      ) : null}
    </div>
  );
}

const PRINTOUT_TABS = [
  { id: "general", label: "General" },
  { id: "receipt", label: "Thermal receipts", requiresSales: true },
  { id: "invoice", label: "A4 invoices", requiresSales: true },
  { id: "proforma", label: "Proforma", requiresSales: true },
  { id: "credit_note", label: "Credit notes", requiresSales: true },
  { id: "hospitality_check", label: "Hotel checks", requiresHospitality: true },
  { id: "lpo", label: "LPO", requiresProcurement: true },
  { id: "loading_sheet", label: "Loading sheets", requiresRoutePrintouts: true },
  { id: "picking_list", label: "Picking lists", requiresRoutePrintouts: true },
  { id: "trip_chart", label: "Trip chart lists", requiresRoutePrintouts: true },
  { id: "payroll_receipt", label: "Payroll receipts", requiresHrPayroll: true },
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
        checked={Boolean(checked)}
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

function DocumentFooterField({ footerKey, form, setForm }) {
  const fieldKey = PRINT_FOOTER_FORM_KEYS[footerKey];
  const label = PRINT_FOOTER_LABELS[footerKey];
  const isSalesFooter = footerKey === "receipt" || footerKey === "invoice" || footerKey === "hospitality_check";
  const minRows = footerKey === "receipt" || footerKey === "hospitality_check" ? 3 : footerKey === "invoice" ? 4 : 2;
  const placeholder =
    footerKey === "receipt" || footerKey === "hospitality_check"
      ? "You were served by: {username}"
      : footerKey === "invoice"
        ? "You were served by: {username}"
        : "Optional footer text";

  return (
    <Field label={label}>
      <FooterLineEditor
        value={form[fieldKey] ?? ""}
        onChange={(nextValue) => {
          setForm((f) => ({
            ...f,
            [fieldKey]: nextValue,
          }));
        }}
        minRows={minRows}
        maxRows={footerKey === "invoice" ? 10 : 8}
        placeholder={placeholder}
        showPlaceholdersHint={isSalesFooter}
        placeholdersHint={isSalesFooter ? SALES_FOOTER_PLACEHOLDER_HINT : ""}
      />
      {footerKey === "receipt" || footerKey === "hospitality_check" ? (
        <p className="mt-2 rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Always printed (not editable):{" "}
          <span className="font-medium text-slate-800">{RECEIPT_POWERED_BY_LINE}</span>
        </p>
      ) : null}
      {footerKey === "invoice" ? (
        <p className="mt-2 rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Always printed on A4 (not editable): Designed &amp; Developed By, Printed By, and Printed On.
        </p>
      ) : null}
      <p className="mt-2 text-xs text-slate-500">
        Each line has its own alignment (Left / Center / Right), size, bold, italic, and optional dashed
        separator (---) after the row. Styling is saved automatically and applied on printed documents.
      </p>
    </Field>
  );
}

function GeneralPrintoutsTab({ form, setForm, hasSales, sections, organization = null }) {
  const orderFormat = form.order_document_type ?? "receipt";
  const { showThermal, showA4 } = orderPrintFormatSections(orderFormat);
  const showBranchSetting = showThermal || showA4;
  const availableKinds = (sections?.availableKinds ?? []).filter((kind) => {
    if (kind === "receipt") return showThermal;
    if (kind === "invoice") return showA4;
    return true;
  });
  const routeNote = sections?.hasRoutePrintouts
    ? sections.hasDistribution && sections.hasMobileSales
      ? "Distribution and mobile orders are on — loading sheets, picking lists, and trip chart lists are available."
      : sections.hasDistribution
        ? "Distribution is on — loading sheets, picking lists, and trip chart lists are available."
        : "Mobile / field sales are on — loading sheets, picking lists, and trip chart lists use General print footers and fonts (Distribution module not required)."
    : "Loading sheets, picking lists, and trip chart lists appear when Distribution is enabled or mobile orders are turned on.";

  return (
    <div className="space-y-6">
      <div>
        <SectionHeading
          title="Printouts for this organization"
          description="Tabs below match your org setup. Receipts, invoices, proformas, and General branding work for backoffice wholesale and retail without Distribution."
        />
        <ul className="mt-3 space-y-1.5 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          {availableKinds.length > 0 ? (
            availableKinds.map((kind) => (
              <li key={kind} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#185FA5]" aria-hidden />
                {PRINTOUT_KIND_LABELS[kind] ?? kind}
              </li>
            ))
          ) : (
            <li className="text-slate-500">
              Enable Sales, Hospitality, or Procurement to configure printouts.
            </li>
          )}
        </ul>
        <p className="mt-2 text-xs text-slate-500">{routeNote}</p>
      </div>

      {(sections?.needsWork?.length ?? 0) > 0 ? (
        <div>
          <SectionHeading
            title="Printouts to work on"
            description="Documented printouts that still need contrast, branding, or layout polish before full Admin settings."
          />
          <ul className="mt-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
            {sections.needsWork.map((item) => (
              <li key={item.kind}>
                <span className="font-medium">{item.label}</span>
                {item.note ? (
                  <span className="mt-0.5 block text-xs text-amber-900/80">{item.note}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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
                  <SearchableSelect
  className={inputClassName()}
  value={form.receipt_copies}
  nativeEvent
  onChange={((e) => setForm((f) => ({ ...f, receipt_copies: e.target.value })))}
  options={[{ value: '1', label: 'Single receipt' }, { value: '2', label: 'Double receipt (customer + merchant)' }]}
/>
                  <p className="mt-1 text-xs text-slate-500">
                    How many copies print when staff print an order to a thermal printer.
                  </p>
                </Field>
              </div>
            ) : null}
            {showBranchSetting ? (
              <Toggle
                label="Show selling branch on sales printouts"
                description="When on, thermal receipts and A4 invoices print the order branch name, address, and phone from Admin → Branches below your company header. When off, those lines use your organization address and phone instead. Company logo and tax PIN always come from organization settings. Email appears on A4 invoices only."
                checked={form.show_branch_on_receipt}
                onChange={(v) => setForm((f) => ({ ...f, show_branch_on_receipt: v }))}
              />
            ) : null}
            {showBranchSetting ? (
              <Toggle
                label="Show full-package UOM on sales documents"
                description="For products marked “Full package only — wholesale, no small unit breakdown” (e.g. ASIS sold by bale), print the package name with quantity (1 bale). When off (default), print only the quantity (1) on thermal receipts, A4 invoices, proformas, and delivery notes. Products with a small-unit breakdown are unchanged."
                checked={Boolean(form.show_full_package_uom_on_documents)}
                onChange={(v) => setForm((f) => ({ ...f, show_full_package_uom_on_documents: v }))}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      <div>
        <SectionHeading
          title="Document branding"
          description="Global header mode for all documents. Per-document logo size and position are set on each printout tab."
        />
        <div className="mt-4 space-y-3">
          <Toggle
            label="Show organization name on documents"
            description="Include your company name and address on printed documents."
            checked={form.show_organization_on_documents}
            onChange={(v) => setForm((f) => ({ ...f, show_organization_on_documents: v }))}
          />
          <Field label="Report and document header">
            <SearchableSelect
  className={inputClassName()}
  value={form.document_header_display}
  nativeEvent
  onChange={((e) => setForm((f) => ({ ...f, document_header_display: e.target.value })))}
  options={DOCUMENT_HEADER_DISPLAY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
/>
          </Field>
          <p className="text-xs text-slate-500">
            Open each document tab (receipt, invoice, proforma, etc.) to choose whether that printout shows the
            logo, where it sits, and how large it is. The live preview updates as you change those controls.
          </p>
        </div>
      </div>
    </div>
  );
}

function OrderPrintFormatField({ form, setForm }) {
  return (
    <Field label="Order print format">
      <SearchableSelect
  className={inputClassName()}
  value={form.order_document_type}
  nativeEvent
  onChange={((e) => setForm((f) => ({ ...f, order_document_type: e.target.value })))}
  options={[{ value: 'receipt', label: 'Thermal receipt only' }, { value: 'invoice', label: 'A4 sales invoice only' }, { value: 'both', label: 'Both — choose at print time' }]}
/>
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

function ThermalReceiptsTab({ form, setForm, hasMobileSales, organization = null }) {
  return (
    <div className="space-y-3">
      <SectionHeading
        title="Thermal receipts"
        description="POS and backoffice narrow receipt printers."
      />
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <p className="font-medium text-slate-900">Phone numbers (Tel 1 / Tel 2)</p>
        <p className="mt-1 text-xs text-slate-500">
          Thermal receipts and A4 tax invoices always print company Tel 1 and Tel 2 from Admin → Company
          {organization?.primary_tel || organization?.secondary_tel
            ? `: ${formatPrintPhones({
                tel1: organization?.primary_tel,
                tel2: organization?.secondary_tel,
              })}`
            : " (set them there if missing)"}.
          Proforma and LPO can use different numbers on their Printouts tabs. Other branded documents
          (credit notes, GRNs, supplier returns) use numbers under Admin → Company profile.
        </p>
      </div>
      <PrintFontSettingsFields
        form={form}
        setForm={setForm}
        variantKey="receipt"
        description="Font for narrow thermal receipt printers only."
      />
      <DocumentLogoSettingsFields
        form={form}
        setForm={setForm}
        variantKey="receipt"
        description="Optional on narrow thermal printers. Off by default — turn on only if you want the company logo on receipts."
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
      <div className="border-t border-slate-200 pt-4">
        <SectionHeading
          title="Document footer"
          description="Editable closing text on thermal receipts (one line per row)."
        />
        <div className="mt-3">
          <DocumentFooterField footerKey="receipt" form={form} setForm={setForm} />
        </div>
      </div>
    </div>
  );
}

function CreditNotesTab({ form, setForm }) {
  return (
    <div className="space-y-3">
      <SectionHeading
        title="Credit notes"
        description="Layout template, logo, fonts, and closing footer text for A4 credit note printouts."
      />
      <DocumentTemplateSelect
        form={form}
        setForm={setForm}
        settingKey="credit_note_document_template"
        label="Document template"
      />
      <PrintFontSettingsFields
        form={form}
        setForm={setForm}
        variantKey="credit_note"
        description="Font for credit note printouts. Falls back to A4 invoice fonts until you set these."
      />
      <DocumentLogoSettingsFields
        form={form}
        setForm={setForm}
        variantKey="credit_note"
        description="Logo size and position on credit notes."
      />
      <div className="border-t border-slate-200 pt-4">
        <SectionHeading
          title="Document footer"
          description="Closing text on credit notes (one line per row)."
        />
        <div className="mt-3">
          <DocumentFooterField footerKey="credit_note" form={form} setForm={setForm} />
        </div>
      </div>
    </div>
  );
}

function A4InvoicesTab({ form, setForm }) {
  return (
    <div className="space-y-3">
      <SectionHeading
        title="A4 invoice receipts"
        description="Valid-until date, payment instructions, logo, fonts, and closing footer text for A4 tax invoices."
      />
      <DocumentTemplateSelect
        form={form}
        setForm={setForm}
        settingKey="invoice_document_template"
        label="Document template"
      />
      <PrintFontSettingsFields
        form={form}
        setForm={setForm}
        variantKey="invoice"
        description="Font for A4 invoice receipts and similar sales documents."
      />
      <DocumentLogoSettingsFields
        form={form}
        setForm={setForm}
        variantKey="invoice"
        description="Tax invoices can use a larger logo than proformas."
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
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        Phone numbers match thermal receipts (company Tel 1 & Tel 2 from Admin → Company). Proforma and
        LPO can use different numbers on their tabs.
      </p>
      <Toggle
        label="Show payment instructions on A4 sales invoices"
        checked={form.show_invoice_payment_details}
        onChange={(v) => setForm((f) => ({ ...f, show_invoice_payment_details: v }))}
        description="Bank / M-Pesa details printed only on A4 tax invoices — separate from thermal receipts and proformas."
      />
      {form.show_invoice_payment_details ? (
        <ReceiptPaymentDetailsEditor
          value={form.invoice_payment_details}
          onChange={(value) => setForm((f) => ({ ...f, invoice_payment_details: value }))}
          idPrefix="printouts-invoice-pay"
        />
      ) : null}
      <div className="border-t border-slate-200 pt-4">
        <SectionHeading
          title="Document footer"
          description="Closing text on A4 invoices — served by, goods confirmation, and signature lines (one line per row)."
        />
        <div className="mt-3">
          <DocumentFooterField footerKey="invoice" form={form} setForm={setForm} />
        </div>
      </div>
    </div>
  );
}

function ProformaInvoicesTab({ form, setForm, organization = null }) {
  return (
    <div className="space-y-3">
      <SectionHeading
        title="Proforma invoices"
        description="Control what appears on unpaid proforma (PFI) printouts. Separate from tax invoices."
      />
      <Toggle
        label="Show Print Proforma invoice option"
        checked={form.show_print_proforma_invoice_option !== false}
        onChange={(v) => setForm((f) => ({ ...f, show_print_proforma_invoice_option: v }))}
        description="When enabled, unpaid orders show Print Proforma Invoice alongside Print A4 Invoice. Uncheck to hide the proforma print action."
      />
      <DocumentTemplateSelect
        form={form}
        setForm={setForm}
        settingKey="proforma_document_template"
        label="Document template"
      />
      <DocumentLogoSettingsFields
        form={form}
        setForm={setForm}
        variantKey="proforma"
        description="Uses your company profile logo (Admin → Organization). Default size is large to match commercial PFI layouts."
      />
      <Field label="Proforma valid for (days)">
        <input
          type="number"
          min={0}
          max={365}
          className={`${inputClassName()} w-32`}
          value={form.proforma_valid_days}
          onChange={(e) => setForm((f) => ({ ...f, proforma_valid_days: e.target.value }))}
        />
      </Field>
      <DocumentPrintPhonesFields
        form={form}
        setForm={setForm}
        useSameKey="use_same_print_phones_for_proforma"
        phonesKey="proforma_print_phones"
        organization={organization}
        title="Proforma phone numbers"
        description="Tel lines on proforma invoices. Uncheck to use different numbers than company Tel 1 & Tel 2 (thermal)."
      />
      <Toggle
        label="Show payment instructions"
        checked={form.show_proforma_payment_details}
        onChange={(v) => setForm((f) => ({ ...f, show_proforma_payment_details: v }))}
        description="Bank / M-Pesa details printed only on proforma invoices — separate from thermal receipts and A4 invoices."
      />
      {form.show_proforma_payment_details ? (
        <ReceiptPaymentDetailsEditor
          value={form.proforma_payment_details}
          onChange={(value) => setForm((f) => ({ ...f, proforma_payment_details: value }))}
          idPrefix="printouts-proforma-pay"
        />
      ) : null}
      <Toggle
        label="Show proforma banner"
        checked={form.show_proforma_banner}
        onChange={(v) => setForm((f) => ({ ...f, show_proforma_banner: v }))}
      />
      {form.show_proforma_banner ? (
        <Field label="Banner text">
          <input
            type="text"
            className={inputClassName()}
            value={form.proforma_banner_text}
            onChange={(e) => setForm((f) => ({ ...f, proforma_banner_text: e.target.value }))}
          />
        </Field>
      ) : null}
      <Toggle
        label="Show our PIN (company KRA PIN)"
        checked={form.show_proforma_our_pin !== false}
        onChange={(v) => setForm((f) => ({ ...f, show_proforma_our_pin: v }))}
        description="Prints “Our PIN No.” in the proforma header. Off hides it. Not used on LPO."
      />
      <Toggle
        label="Show customer PIN"
        checked={form.show_proforma_customer_pin}
        onChange={(v) => setForm((f) => ({ ...f, show_proforma_customer_pin: v }))}
      />
      <Toggle
        label="Show terms of payment"
        checked={form.show_proforma_payment_terms}
        onChange={(v) => setForm((f) => ({ ...f, show_proforma_payment_terms: v }))}
      />
      <Toggle
        label="Show valid until"
        checked={form.show_proforma_valid_until}
        onChange={(v) => setForm((f) => ({ ...f, show_proforma_valid_until: v }))}
      />
      <Toggle
        label="Show totals breakdown (VAT, amount paid, amount due)"
        checked={form.show_proforma_totals_breakdown}
        onChange={(v) => setForm((f) => ({ ...f, show_proforma_totals_breakdown: v }))}
      />
      <Toggle
        label="Show VAT note"
        checked={form.show_proforma_vat_note}
        onChange={(v) => setForm((f) => ({ ...f, show_proforma_vat_note: v }))}
      />
      {form.show_proforma_vat_note ? (
        <Field label="VAT note">
          <input
            type="text"
            className={inputClassName()}
            value={form.proforma_vat_note}
            onChange={(e) => setForm((f) => ({ ...f, proforma_vat_note: e.target.value }))}
          />
        </Field>
      ) : null}
      <Toggle
        label="Show terms and conditions"
        checked={form.show_proforma_terms}
        onChange={(v) => setForm((f) => ({ ...f, show_proforma_terms: v }))}
      />
      {form.show_proforma_terms ? (
        <MultilinePrintNotesField
          label="Terms and conditions"
          value={form.proforma_print_terms}
          onChange={(value) => setForm((f) => ({ ...f, proforma_print_terms: value }))}
          rows={8}
          hint="Printed on proforma invoices only. Edit freely — one term per line."
        />
      ) : null}
      <Toggle
        label="Show signature lines"
        checked={form.show_proforma_signatures}
        onChange={(v) => setForm((f) => ({ ...f, show_proforma_signatures: v }))}
      />
      {form.show_proforma_signatures ? (
        <Field label="Default confirmed by">
          <input
            type="text"
            className={inputClassName()}
            value={form.proforma_confirmed_by}
            onChange={(e) => setForm((f) => ({ ...f, proforma_confirmed_by: e.target.value }))}
            placeholder="Leave blank for a signature line"
          />
        </Field>
      ) : null}
    </div>
  );
}

function LpoPrintoutsTab({ form, setForm, organization = null }) {
  return (
    <div className="space-y-3">
      <SectionHeading title="Local purchase orders (LPO)" />
      <DocumentTemplateSelect
        form={form}
        setForm={setForm}
        settingKey="lpo_document_template"
        label="Document template"
      />
      <PrintFontSettingsFields
        form={form}
        setForm={setForm}
        variantKey="lpo"
        description="Font for local purchase order printouts."
      />
      <DocumentLogoSettingsFields
        form={form}
        setForm={setForm}
        variantKey="lpo"
      />
      <DocumentPrintPhonesFields
        form={form}
        setForm={setForm}
        useSameKey="use_same_print_phones_for_lpo"
        phonesKey="lpo_print_phones"
        organization={organization}
        title="LPO phone numbers"
        description="Tel lines on LPO / delivery note headers. Uncheck to use different numbers than company Tel 1 & Tel 2."
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
      <div className="border-t border-slate-200 pt-4">
        <SectionHeading
          title="Document footer"
          description="Optional closing text printed at the bottom of LPO documents."
        />
        <div className="mt-3">
          <DocumentFooterField footerKey="lpo" form={form} setForm={setForm} />
        </div>
      </div>
    </div>
  );
}

function LoadingSheetsTab({ form, setForm, hasDistribution = false, hasMobileSales = false }) {
  const canPersistColumns = hasDistribution || hasMobileSales;
  return (
    <div className="space-y-3">
      <SectionHeading
        title="Loading sheets"
        description={
          hasDistribution
            ? "Route delivery loading lists for Distribution trips and mobile route orders. Column visibility can also be configured under Distribution → Trips & loading."
            : "Field-sales and backoffice loading lists for mobile route orders. Column layout (show amount, totals, etc.) is saved with these settings."
        }
      />
      {!canPersistColumns ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          Enable mobile orders or Distribution to save loading-sheet column toggles. Fonts and footers still
          save under General.
        </p>
      ) : null}
      <PrintFontSettingsFields
        form={form}
        setForm={setForm}
        variantKey="loading_sheet"
        description="Font for route loading sheets and delivery notes."
      />
      <DocumentLogoSettingsFields
        form={form}
        setForm={setForm}
        variantKey="loading_sheet"
      />
      <LoadingListPrintSettingsFields
        form={form}
        setForm={setForm}
        showTripFields={hasDistribution}
      />
      <div className="border-t border-slate-200 pt-4">
        <SectionHeading
          title="Document footer"
          description="Optional closing text on loading sheet printouts (separate from loading list footer lines above)."
        />
        <div className="mt-3">
          <DocumentFooterField footerKey="loading_sheet" form={form} setForm={setForm} />
        </div>
      </div>
    </div>
  );
}

function PickingListsTab({ form, setForm }) {
  return (
    <div className="space-y-3">
      <SectionHeading
        title="Picking lists"
        description="Warehouse pick sheets for Distribution trip charts and mobile route orders. Lines are ordered from highest quantity to lowest."
      />
      <PrintFontSettingsFields
        form={form}
        setForm={setForm}
        variantKey="picking_list"
        description="Font for picking list printouts. Falls back to loading sheet fonts until you set these."
      />
      <DocumentLogoSettingsFields
        form={form}
        setForm={setForm}
        variantKey="picking_list"
      />
      <div className="border-t border-slate-200 pt-4">
        <SectionHeading
          title="Document footer"
          description="Optional closing text on picking list printouts."
        />
        <div className="mt-3">
          <DocumentFooterField footerKey="picking_list" form={form} setForm={setForm} />
        </div>
      </div>
    </div>
  );
}

function TripChartListsTab({ form, setForm }) {
  return (
    <div className="space-y-3">
      <SectionHeading
        title="Trip chart lists"
        description="Customer stop lists printed from a trip chart (Distribution or mobile field sales)."
      />
      <PrintFontSettingsFields
        form={form}
        setForm={setForm}
        variantKey="trip_chart"
        description="Font for trip chart list printouts. Falls back to loading sheet fonts until you set these."
      />
      <DocumentLogoSettingsFields
        form={form}
        setForm={setForm}
        variantKey="trip_chart"
      />
      <div className="border-t border-slate-200 pt-4">
        <SectionHeading
          title="Document footer"
          description="Optional closing text on trip chart list printouts."
        />
        <div className="mt-3">
          <DocumentFooterField footerKey="trip_chart" form={form} setForm={setForm} />
        </div>
      </div>
    </div>
  );
}

function HospitalityCheckTab({ form, setForm, organization = null }) {
  return (
    <div className="space-y-3">
      <SectionHeading
        title="Hotel & Bar check receipts"
        description="80mm guest checks for Hotel POS — same thermal customization as retail (fonts, logo, footer, payment instructions), laid out like a hotel F&B bill."
      />
      <Field label="Receipt copies">
        <SearchableSelect
  className={inputClassName()}
  value={form.check_receipt_copies}
  nativeEvent
  onChange={((e) => setForm((f) => ({ ...f, check_receipt_copies: e.target.value })))}
  options={[{ value: '1', label: 'Single receipt' }, { value: '2', label: 'Double receipt' }, { value: '3', label: 'Triple receipt' }]}
/>
      </Field>
      <PrintFontSettingsFields
        form={form}
        setForm={setForm}
        variantKey="hospitality_check"
        description="Font for Hotel / Bar thermal checks. Falls back to Thermal receipt fonts until you set these."
      />
      <DocumentLogoSettingsFields
        form={form}
        setForm={setForm}
        variantKey="hospitality_check"
        description="Optional on narrow thermal printers. Off by default — turn on only if you want the company logo on guest checks."
      />
      <Toggle
        label="Show organization name on check receipts"
        checked={form.show_organization_on_check_receipt !== false}
        onChange={(v) => setForm((f) => ({ ...f, show_organization_on_check_receipt: v }))}
      />
      <Toggle
        label="Show address on check receipts"
        checked={form.show_address_on_check_receipt !== false}
        onChange={(v) => setForm((f) => ({ ...f, show_address_on_check_receipt: v }))}
      />
      <Toggle
        label="Show tax PIN on check receipts"
        checked={form.show_tax_pin_on_check_receipt !== false}
        onChange={(v) => setForm((f) => ({ ...f, show_tax_pin_on_check_receipt: v }))}
      />
      <Toggle
        label="Show outlet / channel on check receipts"
        description="Prints the Bar or Restaurant outlet name tied to the check."
        checked={form.show_outlet_on_check_receipt !== false}
        onChange={(v) => setForm((f) => ({ ...f, show_outlet_on_check_receipt: v }))}
      />
      <Toggle
        label="Show date & time on check receipts"
        checked={form.show_datetime_on_check_receipt !== false}
        onChange={(v) => setForm((f) => ({ ...f, show_datetime_on_check_receipt: v }))}
      />
      <Toggle
        label="Show server / cashier on check receipts"
        checked={form.show_cashier_on_check_receipt !== false}
        onChange={(v) => setForm((f) => ({ ...f, show_cashier_on_check_receipt: v }))}
      />
      <Toggle
        label="Show unit price column"
        description="Hotel-style Item | Qty | Price | Amount. Turn off for a simpler Qty | Amount layout."
        checked={form.show_unit_price_on_check_receipt !== false}
        onChange={(v) => setForm((f) => ({ ...f, show_unit_price_on_check_receipt: v }))}
      />
      <Toggle
        label="Ask for guest / customer name on Hotel POS"
        description="Off by default (same as retail checkout). When on, cashiers can enter a name on the ticket and it prints on check receipts."
        checked={Boolean(form.enable_check_guest_name)}
        onChange={(v) => setForm((f) => ({ ...f, enable_check_guest_name: v }))}
      />
      <Toggle
        label="Always show Cash / M-Pesa / Equity / KCB rows"
        description="When off, only tenders that were used are printed."
        checked={Boolean(form.check_receipt_show_all_payment_methods)}
        onChange={(v) => setForm((f) => ({ ...f, check_receipt_show_all_payment_methods: v }))}
      />
      <DocumentPrintPhonesFields
        form={form}
        setForm={setForm}
        useSameKey="use_same_print_phones_for_check"
        phonesKey="check_print_phones"
        organization={organization}
        title="Phone numbers on hotel checks"
        description="Defaults to company Tel 1 / Tel 2. Override for hotel front desk or bar numbers if needed."
      />
      <Toggle
        label="Show payment instructions on hotel checks"
        checked={form.show_check_payment_details !== false}
        onChange={(v) => setForm((f) => ({ ...f, show_check_payment_details: v }))}
        description="Bank / Paybill / Till details under the bill totals — same style as retail thermal receipts."
      />
      {form.show_check_payment_details !== false ? (
        <>
          <Toggle
            label="Use the same payment instructions as POS thermal receipts"
            checked={form.use_same_payment_details_for_check !== false}
            onChange={(v) => setForm((f) => ({ ...f, use_same_payment_details_for_check: v }))}
            description="When off, set hotel-specific bank / M-Pesa details below."
          />
          {form.use_same_payment_details_for_check === false ? (
            <ReceiptPaymentDetailsEditor
              value={form.check_receipt_payment_details}
              onChange={(value) => setForm((f) => ({ ...f, check_receipt_payment_details: value }))}
              idPrefix="printouts-hotel-check-pay"
            />
          ) : (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
              Hotel checks will print the payment details configured under Thermal receipts
              {organization?.org_name ? ` for ${organization.org_name}` : ""}.
            </p>
          )}
        </>
      ) : null}
      <div className="border-t border-slate-200 pt-4">
        <SectionHeading
          title="Check receipt footer"
          description={`Closing lines on Hotel POS checks. Placeholders: ${SALES_FOOTER_PLACEHOLDER_HINT}. Always ends with: ${RECEIPT_POWERED_BY_LINE}`}
        />
        <div className="mt-3">
          <DocumentFooterField footerKey="hospitality_check" form={form} setForm={setForm} />
        </div>
      </div>
    </div>
  );
}

function PayrollReceiptsTab({ form, setForm }) {
  return (
    <div className="space-y-3">
      <SectionHeading
        title="HR payroll receipts (payslips)"
        description="Printed and emailed payslips from payroll runs. Uses the same organization logo/header settings as other documents."
      />
      <PrintFontSettingsFields
        form={form}
        setForm={setForm}
        variantKey="payroll_receipt"
        description="Font for payslip printouts. Falls back to A4 invoice fonts until you set these."
      />
      <DocumentLogoSettingsFields
        form={form}
        setForm={setForm}
        variantKey="payroll_receipt"
      />
      <div className="border-t border-slate-200 pt-4">
        <SectionHeading
          title="Document footer"
          description="Optional closing text on payslips (for example bank details or HR contact)."
        />
        <div className="mt-3">
          <DocumentFooterField footerKey="payroll_receipt" form={form} setForm={setForm} />
        </div>
      </div>
    </div>
  );
}

function previewTypeForTab(tabId, previewTypes = []) {
  if (
    tabId === "receipt" ||
    tabId === "invoice" ||
    tabId === "proforma" ||
    tabId === "credit_note" ||
    tabId === "lpo" ||
    tabId === "loading_sheet" ||
    tabId === "picking_list" ||
    tabId === "trip_chart" ||
    tabId === "payroll_receipt" ||
    tabId === "hospitality_check"
  ) {
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
  const { settingsPath } = useSettingsApi();
  const previewContext = useDocumentPrintPreviewContext();
  const afterSave = useSettingsAfterSave(onAfterSave);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("general");

  const sections = resolvePrintoutSections(capabilities);
  const {
    hasSales,
    hasHospitality,
    hasProcurement,
    hasMobileSales,
    hasRoutePrintouts,
    hasDistribution,
    hasHrPayroll,
  } = sections;
  const orderFormat = form?.order_document_type ?? "receipt";
  const { showThermal, showA4 } = orderPrintFormatSections(orderFormat);

  const visibleTabs = useMemo(
    () =>
      PRINTOUT_TABS.filter((tab) => {
        if (tab.requiresSales && !hasSales) return false;
        if (tab.requiresHospitality && !hasHospitality) return false;
        if (tab.id === "receipt" && (!hasSales || !showThermal)) return false;
        if (tab.id === "invoice" && (!hasSales || !showA4)) return false;
        if (tab.requiresProcurement && !hasProcurement) return false;
        if (tab.requiresRoutePrintouts && !hasRoutePrintouts) return false;
        if (tab.requiresHrPayroll && !hasHrPayroll) return false;
        return true;
      }),
    [hasHospitality, hasHrPayroll, hasProcurement, hasRoutePrintouts, hasSales, showA4, showThermal],
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

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      // Loading-sheet column flags live under distribution settings, but the API is also
      // available when sales.mobile is on (field-sales loading/picking without Distribution).
      const canLoadDistributionPrint = hasDistribution || hasMobileSales;
      const [generalResult, salesResult, hospitalityResult, procurementResult, distributionResult] =
        await Promise.allSettled([
          apiRequest(settingsPath("general")),
          hasSales ? apiRequest(settingsPath("sales")) : Promise.resolve(null),
          hasHospitality ? apiRequest(settingsPath("hospitality")) : Promise.resolve(null),
          hasProcurement ? apiRequest(settingsPath("procurement")) : Promise.resolve(null),
          canLoadDistributionPrint
            ? apiRequest(settingsPath("distribution"))
            : Promise.resolve(null),
        ]);

      const valueFrom = (result) => (result.status === "fulfilled" ? result.value : null);

      let nextForm;
      try {
        nextForm = printoutsFormFromApis({
          generalRes: valueFrom(generalResult),
          salesRes: valueFrom(salesResult),
          hospitalityRes: valueFrom(hospitalityResult),
          procurementRes: valueFrom(procurementResult),
          distributionRes: valueFrom(distributionResult),
        });
      } catch (formError) {
        console.error("Failed to build printout settings form", formError);
        setError(
          formError instanceof Error
            ? `Failed to read printout settings: ${formError.message}`
            : "Failed to read printout settings",
        );
        nextForm = printoutsFormFromApis({});
      }

      setForm(nextForm);

      const failures = [
        generalResult.status === "rejected" ? "general" : null,
        salesResult.status === "rejected" ? "sales" : null,
        hospitalityResult.status === "rejected" ? "hospitality" : null,
        procurementResult.status === "rejected" ? "procurement" : null,
        (hasDistribution || hasMobileSales) && distributionResult.status === "rejected"
          ? "distribution"
          : null,
      ].filter(Boolean);

      if (failures.length > 0) {
        const firstError = [
          generalResult,
          salesResult,
          hospitalityResult,
          procurementResult,
          distributionResult,
        ].find((result) => result.status === "rejected")?.reason;
        const detail =
          firstError instanceof ApiError
            ? firstError.message
            : firstError instanceof Error
              ? firstError.message
              : "Failed to load printout settings";
        // General printouts should remain usable even if a module-specific section fails.
        const generalOk = generalResult.status === "fulfilled";
        setError(
          failures.length === 1
            ? detail
            : generalOk
              ? `Some optional printout settings could not be loaded (${failures.join(", ")}). General printouts are still available. ${detail}`
              : `Some printout settings could not be loaded (${failures.join(", ")}). ${detail}`,
        );
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load printout settings");
    } finally {
      setLoading(false);
    }
  }, [hasDistribution, hasHospitality, hasMobileSales, hasProcurement, hasSales, setError, settingsPath]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const steps = [
        {
          label: "general",
          run: () =>
            apiRequest(settingsPath("general"), {
              method: "PATCH",
              body: printoutsGeneralPayloadFromForm(form),
            }),
        },
      ];
      if (hasSales) {
        steps.push({
          label: "sales",
          run: () =>
            apiRequest(settingsPath("sales"), {
              method: "PATCH",
              body: printoutsSalesPayloadFromForm(form),
            }),
        });
      }
      if (hasHospitality) {
        steps.push({
          label: "hospitality",
          run: () =>
            apiRequest(settingsPath("hospitality"), {
              method: "PATCH",
              body: printoutsHospitalityPayloadFromForm(form),
            }),
        });
      }
      if (hasProcurement) {
        steps.push({
          label: "procurement",
          run: () =>
            apiRequest(settingsPath("procurement"), {
              method: "PATCH",
              body: printoutsProcurementPayloadFromForm(form),
            }),
        });
      }
      if (hasDistribution || hasMobileSales) {
        steps.push({
          label: "distribution",
          run: () =>
            apiRequest(settingsPath("distribution"), {
              method: "PATCH",
              body: printoutsDistributionPayloadFromForm(form),
            }),
        });
      }

      for (const step of steps) {
        try {
          await step.run();
        } catch (stepError) {
          throw stepError instanceof ApiError
            ? new ApiError(
                `Failed to save ${step.label} printout settings: ${stepError.message}`,
                stepError.status,
                stepError.body,
              )
            : stepError;
        }
      }

      await load({ silent: true });
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
    const organization = previewContext?.organization ?? null;

    if (activeTab === "general") {
      return (
        <GeneralPrintoutsTab
          form={form}
          setForm={setForm}
          hasSales={hasSales}
          sections={sections}
          organization={organization}
        />
      );
    }
    if (activeTab === "receipt" && hasSales) {
      return (
        <ThermalReceiptsTab
          form={form}
          setForm={setForm}
          hasMobileSales={hasMobileSales}
          organization={organization}
        />
      );
    }
    if (activeTab === "invoice" && hasSales) {
      return <A4InvoicesTab form={form} setForm={setForm} />;
    }
    if (activeTab === "proforma" && hasSales) {
      return <ProformaInvoicesTab form={form} setForm={setForm} organization={organization} />;
    }
    if (activeTab === "credit_note" && hasSales) {
      return <CreditNotesTab form={form} setForm={setForm} />;
    }
    if (activeTab === "hospitality_check" && hasHospitality) {
      return (
        <HospitalityCheckTab form={form} setForm={setForm} organization={organization} />
      );
    }
    if (activeTab === "lpo" && hasProcurement) {
      return <LpoPrintoutsTab form={form} setForm={setForm} organization={organization} />;
    }
    if (activeTab === "loading_sheet" && hasRoutePrintouts) {
      return (
        <LoadingSheetsTab
          form={form}
          setForm={setForm}
          hasDistribution={hasDistribution}
          hasMobileSales={hasMobileSales}
        />
      );
    }
    if (activeTab === "picking_list" && hasRoutePrintouts) {
      return <PickingListsTab form={form} setForm={setForm} />;
    }
    if (activeTab === "trip_chart" && hasRoutePrintouts) {
      return <TripChartListsTab form={form} setForm={setForm} />;
    }
    if (activeTab === "payroll_receipt" && hasHrPayroll) {
      return <PayrollReceiptsTab form={form} setForm={setForm} />;
    }

    return (
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Sales, hospitality, procurement, route, and payroll printout options appear here when those features are enabled for
        your organization.
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
                setForm={setForm}
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
