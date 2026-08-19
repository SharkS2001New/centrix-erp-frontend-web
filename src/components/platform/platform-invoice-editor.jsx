"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { CatalogPageShell, PrimaryButton, SearchableSelect } from "@/components/catalog/catalog-shared";
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";
import {
  PLATFORM_BILLING_MODULE_GROUPS,
  PLATFORM_INVOICE_CUSTOMER_KINDS,
  PLATFORM_INVOICE_DESIGN_TEMPLATES,
  PLATFORM_INVOICE_STATUSES,
  PLATFORM_INVOICE_SPACING,
  buildPlatformBillingSummaries,
  calculateInvoiceTotals,
  emptyPlatformInvoiceForm,
  inferPlatformInvoiceCustomerKind,
  invoiceFormToPayload,
  invoiceRecordToForm,
  lineItemFromModuleSummary,
  lineItemsFromBillingKeys,
  normalizeInvoiceOptions,
  normalizeSeller,
  organizationBillingLabel,
  recalcLineItemAmount,
  resolveEnabledBillingModuleKeys,
} from "@/lib/platform-invoices";
import { PLATFORM_COMPANY_CODE } from "@/lib/admin-scope";
import { buildPlatformInvoiceHtml, printPlatformInvoice } from "@/lib/platform-invoice-print";
import { PlatformInvoiceViewer } from "@/components/platform/platform-invoice-viewer";
import { PlatformAiEmailAssist } from "@/components/platform/platform-ai-email-assist";
import { formatBillingMoney } from "@/lib/platform-billing";
import { formDraftKey } from "@/stores/form-drafts";
import { useFormDraft } from "@/hooks/use-form-draft";
import { compressImageFileIfNeeded } from "@/lib/image-compress";

function Field({ label, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

function isEmptyPlatformInvoiceDraft(value) {
  if (!value) return true;
  return (
    !value.organization_id &&
    !value.invoice_number &&
    !value.bill_to_name &&
    !value.bill_to_email &&
    !value.bill_to_phone &&
    !value.bill_to_address &&
    !(value.line_items?.length) &&
    !(value.selected_modules?.length)
  );
}

async function imageFileToDataUrl(file) {
  const compressed = await compressImageFileIfNeeded(file, { preset: "logo" });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(compressed);
  });
}

export function PlatformInvoiceEditor({ invoiceId = null, onSaved }) {
  const isEdit = Boolean(invoiceId);
  const searchParams = useSearchParams();
  const presetTemplateId = searchParams.get("template")?.trim() ?? "";
  const presetOrganizationId = searchParams.get("organization")?.trim() ?? "";
  const presetDesignId = searchParams.get("design")?.trim() ?? "";
  const [form, setForm] = useState(() => emptyPlatformInvoiceForm());
  const [serverForm, setServerForm] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [moduleSummaries, setModuleSummaries] = useState([]);
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [presetTemplateApplied, setPresetTemplateApplied] = useState(false);
  const [presetOrganizationApplied, setPresetOrganizationApplied] = useState(false);
  const [presetDesignApplied, setPresetDesignApplied] = useState(false);
  const [brandingOpen, setBrandingOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  const isBaseline = useCallback(
    (value) => {
      if (isEdit) {
        if (!serverForm || !value) return true;
        return JSON.stringify(value) === JSON.stringify(serverForm);
      }
      return isEmptyPlatformInvoiceDraft(value);
    },
    [isEdit, serverForm],
  );

  const { clearDraft } = useFormDraft({
    draftKey: formDraftKey("platform-invoice", invoiceId ?? "new"),
    value: form,
    setValue: setForm,
    enabled: !loading && (!isEdit || serverForm != null),
    isBaseline,
  });

  const totals = useMemo(
    () =>
      calculateInvoiceTotals(form.line_items, form.tax_rate, normalizeInvoiceOptions(form.invoice_options)),
    [form.line_items, form.tax_rate, form.invoice_options],
  );

  const previewRecord = useMemo(() => ({ ...form, ...totals }), [form, totals]);
  const previewHtml = useMemo(() => buildPlatformInvoiceHtml(previewRecord), [previewRecord]);
  const customerKind = inferPlatformInvoiceCustomerKind(form);
  const tenantOrganizations = useMemo(
    () =>
      (organizations ?? []).filter(
        (org) => String(org.company_code ?? "").toUpperCase() !== PLATFORM_COMPANY_CODE,
      ),
    [organizations],
  );

  const loadOrganizations = useCallback(async () => {
    try {
      const res = await apiRequest("/admin/organizations");
      setOrganizations(res.data ?? []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load organizations.");
    }
  }, []);

  const loadSavedTemplates = useCallback(async () => {
    try {
      const res = await apiRequest("/admin/platform-invoices/saved-templates");
      setSavedTemplates(res.data ?? []);
    } catch {
      setSavedTemplates([]);
    }
  }, []);

  const loadBillingContext = useCallback(async (organizationId, options = {}) => {
    const {
      syncBillTo = true,
      syncSeller = true,
      autoSelectModules = Boolean(organizationId),
    } = options;
    try {
      const query = organizationId ? `?organization_id=${organizationId}` : "";
      const res = await apiRequest(`/admin/platform-invoices/billing-context${query}`);
      const summaries = buildPlatformBillingSummaries(res.module_summaries ?? []);
      setModuleSummaries(summaries);

      const enabledKeys = organizationId ? resolveEnabledBillingModuleKeys(res) : [];

      setForm((prev) => {
        const next = { ...prev };
        if (syncBillTo && res.bill_to) {
          next.bill_to_name = res.bill_to.name ?? prev.bill_to_name;
          next.bill_to_email = res.bill_to.email ?? prev.bill_to_email;
          next.bill_to_phone = res.bill_to.phone ?? prev.bill_to_phone;
          next.bill_to_address = res.bill_to.address ?? prev.bill_to_address;
          next.bill_to_tax_pin = res.bill_to.tax_pin ?? prev.bill_to_tax_pin;
          next.bill_to_company_code = res.bill_to.company_code ?? prev.bill_to_company_code;
        }
        if (syncSeller) {
          // Prefer Alpac defaults; only fill blanks from API context.
          const contextSeller = res.seller ?? res.bill_from ?? {};
          next.seller = normalizeSeller({
            ...contextSeller,
            name: contextSeller.name || prev.seller?.name,
            email: contextSeller.email || prev.seller?.email,
            phone: contextSeller.phone || prev.seller?.phone,
            address: contextSeller.address || prev.seller?.address,
            tax_pin: contextSeller.tax_pin || prev.seller?.tax_pin,
          });
        }
        if (autoSelectModules) {
          next.selected_modules = enabledKeys;
          next.line_items = lineItemsFromBillingKeys(enabledKeys, summaries);
        }
        return next;
      });
      return summaries;
    } catch (e) {
      // Still show catalog modules if billing-context fails.
      const fallback = buildPlatformBillingSummaries([]);
      setModuleSummaries(fallback);
      notifyError(e instanceof ApiError ? e.message : "Failed to load billing context.");
      return fallback;
    }
  }, []);

  const loadInvoice = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    try {
      const res = await apiRequest(`/admin/platform-invoices/${invoiceId}`);
      const record = res.data;
      const next = invoiceRecordToForm(record);
      setServerForm(next);
      setForm(next);
      await loadBillingContext(record.organization_id ?? "", {
        syncBillTo: false,
        syncSeller: false,
        autoSelectModules: false,
      });
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load invoice.");
    } finally {
      setLoading(false);
    }
  }, [invoiceId, loadBillingContext]);

  useEffect(() => {
    void loadOrganizations();
    void loadSavedTemplates();
    if (!invoiceId) {
      void loadBillingContext("", { syncBillTo: false, syncSeller: false, autoSelectModules: false });
    } else {
      void loadInvoice();
    }
  }, [invoiceId, loadBillingContext, loadInvoice, loadOrganizations, loadSavedTemplates]);

  function updateForm(patch) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function updateSeller(patch) {
    setForm((prev) => ({
      ...prev,
      seller: normalizeSeller({ ...prev.seller, ...patch }),
    }));
  }

  function updateInvoiceOptions(patch) {
    setForm((prev) => ({
      ...prev,
      invoice_options: normalizeInvoiceOptions({ ...prev.invoice_options, ...patch }),
    }));
  }

  async function handleLogoUpload(event, targetKey) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notifyError("Please choose an image file.");
      return;
    }
    try {
      const dataUrl = await imageFileToDataUrl(file);
      updateInvoiceOptions({ [targetKey]: dataUrl });
      notifySuccess("Logo uploaded.");
    } catch {
      notifyError("Could not upload logo.");
    }
  }

  async function handleOrganizationChange(organizationId) {
    setForm((prev) => ({
      ...prev,
      organization_id: organizationId,
      selected_modules: [],
      line_items: [],
      invoice_options: normalizeInvoiceOptions({
        ...prev.invoice_options,
        customer_kind: organizationId ? "centrix_tenant" : prev.invoice_options?.customer_kind,
      }),
    }));
    // Refresh Bill to + auto-tick this tenant's enabled modules onto the invoice.
    await loadBillingContext(organizationId || "", {
      syncBillTo: true,
      syncSeller: false,
      autoSelectModules: Boolean(organizationId),
    });
  }

  function handleCustomerKindChange(kind) {
    setForm((prev) => {
      const next = {
        ...prev,
        invoice_options: normalizeInvoiceOptions({ ...prev.invoice_options, customer_kind: kind }),
      };
      if (kind === "external") {
        next.organization_id = "";
        next.selected_modules = [];
        const hasActiveLines = (prev.line_items ?? []).some((row) => row.included !== false);
        if (!hasActiveLines) {
          next.line_items = [
            {
              module_key: null,
              description: "Website hosting",
              quantity: 1,
              unit_price: 0,
              amount: 0,
              included: true,
            },
          ];
        }
      }
      return next;
    });
    if (kind === "external") {
      void loadBillingContext("", { syncBillTo: false, syncSeller: false, autoSelectModules: false });
    }
  }

  useEffect(() => {
    if (invoiceId || !presetOrganizationId || presetOrganizationApplied) return;
    setPresetOrganizationApplied(true);
    void handleOrganizationChange(presetOrganizationId);
    // One-shot query preset for /platform/invoices/new?organization=
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId, presetOrganizationId, presetOrganizationApplied]);

  function toggleModule(summary, checked) {
    setForm((prev) => {
      const selected = new Set(prev.selected_modules ?? []);
      let lineItems = [...(prev.line_items ?? [])];
      if (checked) {
        selected.add(summary.key);
        if (!lineItems.some((row) => row.module_key === summary.key)) {
          lineItems.push(lineItemFromModuleSummary(summary, true));
        } else {
          lineItems = lineItems.map((row) =>
            row.module_key === summary.key ? { ...row, included: true } : row,
          );
        }
      } else {
        selected.delete(summary.key);
        lineItems = lineItems.map((row) =>
          row.module_key === summary.key ? { ...row, included: false } : row,
        );
      }
      return { ...prev, selected_modules: [...selected], line_items: lineItems };
    });
  }

  function updateLineItem(index, patch) {
    setForm((prev) => {
      const lineItems = [...(prev.line_items ?? [])];
      lineItems[index] = recalcLineItemAmount({ ...lineItems[index], ...patch });
      return { ...prev, line_items: lineItems };
    });
  }

  function addCustomLine() {
    setForm((prev) => ({
      ...prev,
      line_items: [
        ...(prev.line_items ?? []),
        { module_key: null, description: "", quantity: 1, unit_price: 0, amount: 0, included: true },
      ],
    }));
  }

  function removeLine(index) {
    setForm((prev) => ({
      ...prev,
      line_items: (prev.line_items ?? []).filter((_, i) => i !== index),
    }));
  }

  async function handleSave(options = {}) {
    const { skipOnSaved = false } = options;
    const kind = inferPlatformInvoiceCustomerKind(form);
    if (kind === "centrix_tenant" && !form.organization_id) {
      notifyError("Select a tenant organization, or choose External customer for hosting and other work.");
      return null;
    }
    if (!String(form.bill_to_name ?? "").trim()) {
      notifyError("Enter the bill-to customer name.");
      return null;
    }
    const billedLines = (form.line_items ?? []).filter(
      (row) => row.included !== false && String(row.description ?? "").trim(),
    );
    if (!billedLines.length) {
      notifyError("Add at least one line item with a description.");
      return null;
    }
    setSaving(true);
    try {
      const payload = invoiceFormToPayload({
        ...form,
        line_items: billedLines,
      });
      const res = isEdit
        ? await apiRequest(`/admin/platform-invoices/${invoiceId}`, { method: "PATCH", body: payload })
        : await apiRequest("/admin/platform-invoices", { method: "POST", body: payload });
      notifySuccess(res.message ?? "Invoice saved.");
      const saved = res.data;
      clearDraft();
      if (saved) {
        setForm((prev) => {
          const next = invoiceRecordToForm(saved);
          // If the API omits seller, keep what the user just saved in the form.
          if (!(saved.seller ?? saved.bill_from)) {
            next.seller = prev.seller;
          }
          setServerForm(next);
          return next;
        });
      }
      if (!skipOnSaved) onSaved?.(saved);
      return saved?.id ?? invoiceId ?? null;
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to save invoice.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  function openEmailComposer() {
    const org = organizations.find((row) => String(row.id) === String(form.organization_id));
    const number = form.invoice_number || (invoiceId ? `#${invoiceId}` : "draft");
    const name = form.bill_to_name || org?.org_name || "Customer";
    const total = formatBillingMoney(totals.total, form.currency);
    setEmailTo(form.bill_to_email || org?.org_email || "");
    setEmailSubject(`Invoice ${number}`);
    setEmailBody(
      `Dear ${name},\n\nPlease find attached invoice ${number} for ${total}.\n\nIf you have questions, reply to this email.\n\nRegards,\nCentrix`,
    );
    setEmailOpen(true);
  }

  async function handleSendEmail() {
    if (!emailTo.trim()) {
      notifyError("Enter a recipient email.");
      return;
    }
    let id = invoiceId;
    if (!id) {
      id = await handleSave({ skipOnSaved: true });
      if (!id) return;
    }
    setEmailing(true);
    try {
      const res = await apiRequest(`/admin/platform-invoices/${id}/email`, {
        method: "POST",
        body: {
          to: emailTo.trim(),
          subject: emailSubject.trim() || undefined,
          body: emailBody.trim() || undefined,
        },
      });
      notifySuccess(res.message ?? `Sent to ${emailTo.trim()}.`);
      if (form.status === "draft") {
        updateForm({ status: "sent" });
      }
      setEmailOpen(false);
      if (!invoiceId && id) {
        window.location.href = `/platform/invoices/${id}`;
      }
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to send email. Check Platform → Email.");
    } finally {
      setEmailing(false);
    }
  }

  async function handleSaveTemplate() {
    if (!templateName.trim()) {
      notifyError("Enter a template name.");
      return;
    }
    try {
      await apiRequest("/admin/platform-invoices/saved-templates", {
        method: "POST",
        body: {
          name: templateName.trim(),
          description: templateDescription.trim() || null,
          template_id: form.template_id,
          invoice_options: form.invoice_options,
          line_items: form.line_items,
          selected_modules: form.selected_modules,
          notes: form.notes,
          terms: form.terms,
          tax_rate: form.tax_rate,
        },
      });
      notifySuccess("Template saved.");
      setSaveTemplateOpen(false);
      setTemplateName("");
      setTemplateDescription("");
      await loadSavedTemplates();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to save template.");
    }
  }

  useEffect(() => {
    if (isEdit || presetTemplateApplied || !presetTemplateId || !savedTemplates.length) return;
    const template = savedTemplates.find((row) => String(row.id) === String(presetTemplateId));
    if (!template) return;
    setForm((prev) => ({
      ...prev,
      template_id: template.template_id ?? prev.template_id,
      invoice_options: normalizeInvoiceOptions(template.invoice_options ?? prev.invoice_options),
      line_items: (template.line_items ?? []).map((row) => ({ ...row })),
      selected_modules: template.selected_modules ?? [],
      notes: template.notes ?? prev.notes,
      terms: template.terms ?? prev.terms,
      tax_rate: template.tax_rate ?? prev.tax_rate,
    }));
    setPresetTemplateApplied(true);
    notifySuccess(`Applied template “${template.name}”.`);
  }, [isEdit, presetTemplateApplied, presetTemplateId, savedTemplates]);

  useEffect(() => {
    if (isEdit || presetDesignApplied || !presetDesignId || presetTemplateId) return;
    const known = PLATFORM_INVOICE_DESIGN_TEMPLATES.some((row) => row.id === presetDesignId);
    if (!known) return;
    setForm((prev) => ({ ...prev, template_id: presetDesignId }));
    setPresetDesignApplied(true);
  }, [isEdit, presetDesignApplied, presetDesignId, presetTemplateId]);

  function applySavedTemplate(templateId) {
    const template = savedTemplates.find((row) => String(row.id) === String(templateId));
    if (!template) return;
    setForm((prev) => ({
      ...prev,
      template_id: template.template_id ?? prev.template_id,
      invoice_options: normalizeInvoiceOptions(template.invoice_options ?? prev.invoice_options),
      line_items: (template.line_items ?? []).map((row) => ({ ...row })),
      selected_modules: template.selected_modules ?? [],
      notes: template.notes ?? prev.notes,
      terms: template.terms ?? prev.terms,
      tax_rate: template.tax_rate ?? prev.tax_rate,
    }));
    notifySuccess(`Applied template “${template.name}”.`);
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading invoice…</p>;
  }

  const activeLines = (form.line_items ?? []).filter((row) => row.included !== false);
  const seller = normalizeSeller(form.seller);
  const invoiceOptions = normalizeInvoiceOptions(form.invoice_options);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AppBreadcrumb
          items={[
            { label: "Platform", href: "/platform" },
            { label: "Invoices", href: "/platform/invoices" },
            { label: isEdit ? form.invoice_number || "Edit" : "New invoice" },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={() => printPlatformInvoice(previewRecord)}
          >
            Print / PDF
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={() => setViewerOpen(true)}
          >
            Expand preview
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            disabled={emailing || saving}
            onClick={openEmailComposer}
          >
            Send email
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={() => setSaveTemplateOpen(true)}
          >
            Save as template
          </button>
          <PrimaryButton type="button" showIcon={false} disabled={saving || emailing} onClick={() => void handleSave()}>
            {saving ? "Saving…" : "Save invoice"}
          </PrimaryButton>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-3">
          <section className="theme-panel rounded-xl border p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Invoice details</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {PLATFORM_INVOICE_CUSTOMER_KINDS.map((kind) => {
                const selected = customerKind === kind.id;
                return (
                  <button
                    key={kind.id}
                    type="button"
                    onClick={() => handleCustomerKindChange(kind.id)}
                    className={`rounded-lg border px-3 py-2.5 text-left transition ${
                      selected
                        ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <span className="block text-sm font-semibold text-slate-900">{kind.label}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{kind.description}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {customerKind === "centrix_tenant" ? (
              <Field label="Tenant organization">
                <SearchableSelect
                  className={inputClass}
                  value={form.organization_id}
                  nativeEvent
                  placeholder="Select tenant…"
                  onChange={(e) => void handleOrganizationChange(e.target.value)}
                  options={tenantOrganizations.map((org) => ({
                    value: String(org.id),
                    label: organizationBillingLabel(org),
                  }))}
                />
              </Field>
              ) : (
              <Field label="Customer type" className="sm:col-span-2">
                <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  Enter Bill to details below. Add custom line items (hosting, websites, retainers) — Centrix
                  modules are not required.
                </p>
              </Field>
              )}
              <Field label="Design template">
                <SearchableSelect
  className={inputClass}
  value={form.template_id}
  nativeEvent
  onChange={((e) => updateForm({ template_id: e.target.value }))}
  options={PLATFORM_INVOICE_DESIGN_TEMPLATES.map((tpl) => ({ value: tpl.id, label: tpl.label }))}
/>
              </Field>
              <Field label="Saved template">
                <SearchableSelect
  className={inputClass}
  value={""}
  nativeEvent
  onChange={((e) => {
                    if (e.target.value) applySavedTemplate(e.target.value);
                    e.target.value = "";
                  })}
  options={savedTemplates.map((tpl) => ({ value: tpl.id, label: tpl.name }))}
/>
              </Field>
              <Field label="Status">
                <SearchableSelect
  className={inputClass}
  value={form.status}
  nativeEvent
  onChange={((e) => updateForm({ status: e.target.value }))}
  options={PLATFORM_INVOICE_STATUSES.map((row) => ({ value: row.id, label: row.label }))}
/>
              </Field>
              <Field label="Invoice number">
                <input
                  className={inputClass}
                  value={form.invoice_number}
                  onChange={(e) => updateForm({ invoice_number: e.target.value })}
                  placeholder="Auto-generated if empty"
                />
              </Field>
              <Field label="Issue date">
                <input
                  type="date"
                  className={inputClass}
                  value={form.issue_date}
                  onChange={(e) => updateForm({ issue_date: e.target.value })}
                />
              </Field>
              <Field label="Due date">
                <input
                  type="date"
                  className={inputClass}
                  value={form.due_date}
                  onChange={(e) => updateForm({ due_date: e.target.value })}
                />
              </Field>
              <Field label="VAT rate (%)">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className={inputClass}
                  value={form.tax_rate}
                  onChange={(e) => updateForm({ tax_rate: e.target.value })}
                />
              </Field>
            </div>
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-slate-300"
                checked={Boolean(invoiceOptions.prices_include_vat)}
                onChange={(e) => updateInvoiceOptions({ prices_include_vat: e.target.checked })}
              />
              <span>
                <span className="font-medium">Line amounts include VAT</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  On: Total due equals the sum of line amounts (VAT is extracted). Off: VAT is added on
                  top of the line amounts.
                </span>
              </span>
            </label>
            <p className="mt-2 text-xs text-slate-500">
              {PLATFORM_INVOICE_DESIGN_TEMPLATES.find((t) => t.id === form.template_id)?.description}
              {" · "}
              <a href="/platform/invoice-templates" className="font-medium text-[#185FA5] hover:underline">
                Manage templates
              </a>
            </p>
          </section>

          <section className="theme-panel rounded-xl border p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Bill from</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Your company details on the invoice (defaults to ALPAC SOFTWARE SOLUTIONS).
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Organization name" className="sm:col-span-2">
                <input className={inputClass} value={seller.name} onChange={(e) => updateSeller({ name: e.target.value })} />
              </Field>
              <Field label="Email">
                <input className={inputClass} value={seller.email} onChange={(e) => updateSeller({ email: e.target.value })} />
              </Field>
              <Field label="Phone">
                <input className={inputClass} value={seller.phone} onChange={(e) => updateSeller({ phone: e.target.value })} />
              </Field>
              <Field label="Tax PIN">
                <input className={inputClass} value={seller.tax_pin} onChange={(e) => updateSeller({ tax_pin: e.target.value })} />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <textarea className={inputClass} rows={2} value={seller.address} onChange={(e) => updateSeller({ address: e.target.value })} />
              </Field>
            </div>
          </section>

          <section className="theme-panel rounded-xl border p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Bill to</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {customerKind === "centrix_tenant"
                ? "Filled from the selected tenant. You can still edit these fields."
                : "Who this invoice is billed to — not a Centrix tenant."}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Organization / customer name" className="sm:col-span-2">
                <input className={inputClass} value={form.bill_to_name} onChange={(e) => updateForm({ bill_to_name: e.target.value })} />
              </Field>
              <Field label="Email">
                <input className={inputClass} value={form.bill_to_email} onChange={(e) => updateForm({ bill_to_email: e.target.value })} />
              </Field>
              <Field label="Phone">
                <input className={inputClass} value={form.bill_to_phone} onChange={(e) => updateForm({ bill_to_phone: e.target.value })} />
              </Field>
              <Field label={customerKind === "external" ? "Reference / company code" : "Company code"}>
                <input className={inputClass} value={form.bill_to_company_code} onChange={(e) => updateForm({ bill_to_company_code: e.target.value })} />
              </Field>
              <Field label="Tax PIN">
                <input className={inputClass} value={form.bill_to_tax_pin} onChange={(e) => updateForm({ bill_to_tax_pin: e.target.value })} />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <textarea className={inputClass} rows={2} value={form.bill_to_address} onChange={(e) => updateForm({ bill_to_address: e.target.value })} />
              </Field>
            </div>
          </section>

          <section className="theme-panel rounded-xl border p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
            <h2 className="text-sm font-semibold text-slate-900">Branding &amp; display</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Optional — show or hide branding, quantity, payment details, eTIMS, and watermark per invoice.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setBrandingOpen((open) => !open)}
              >
                {brandingOpen ? "Hide options" : "Show options"}
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={invoiceOptions.show_branding !== false}
                  onChange={(e) => {
                    updateInvoiceOptions({ show_branding: e.target.checked });
                    if (e.target.checked) setBrandingOpen(true);
                  }}
                />
                Show branding
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={invoiceOptions.show_quantity !== false}
                  onChange={(e) => updateInvoiceOptions({ show_quantity: e.target.checked })}
                />
                Show quantity
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={Boolean(invoiceOptions.show_payment_details)}
                  onChange={(e) => {
                    updateInvoiceOptions({ show_payment_details: e.target.checked });
                    if (e.target.checked) setBrandingOpen(true);
                  }}
                />
                Payment details
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={Boolean(invoiceOptions.show_etims_invoice_no)}
                  onChange={(e) => {
                    updateInvoiceOptions({ show_etims_invoice_no: e.target.checked });
                    if (e.target.checked) setBrandingOpen(true);
                  }}
                />
                eTIMS number
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={invoiceOptions.watermark_enabled === true}
                  onChange={(e) => {
                    updateInvoiceOptions({ watermark_enabled: e.target.checked });
                    if (e.target.checked) setBrandingOpen(true);
                  }}
                />
                Watermark
              </label>
            </div>

            <div className="mt-3">
              <Field label="Page spacing / margins">
                <SearchableSelect
                  className={inputClass}
                  value={invoiceOptions.print_spacing || "comfortable"}
                  onChange={(next) => updateInvoiceOptions({ print_spacing: next })}
                  options={PLATFORM_INVOICE_SPACING.map((row) => ({
                    value: row.id,
                    label: `${row.label} — ${row.description}`,
                  }))}
                />
              </Field>
            </div>

            {brandingOpen ? (
            <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
              {invoiceOptions.show_branding !== false ? (
                <>
              <Field label="Header branding">
                <SearchableSelect
  className={inputClass}
  value={invoiceOptions.brand_mode}
  nativeEvent
  onChange={((e) => updateInvoiceOptions({ brand_mode: e.target.value }))}
  options={[{ value: 'name', label: 'Name only' }, { value: 'logo', label: 'Logo only' }, { value: 'both', label: 'Logo and name' }]}
/>
              </Field>
              <Field label="Brand name">
                <input
                  className={inputClass}
                  value={invoiceOptions.brand_name}
                  onChange={(e) => updateInvoiceOptions({ brand_name: e.target.value })}
                />
              </Field>
              <Field label="Brand logo" className="sm:col-span-2">
                <input
                  type="file"
                  accept="image/*"
                  className="block w-full text-sm text-slate-600"
                  onChange={(e) => void handleLogoUpload(e, "brand_logo_url")}
                />
                {invoiceOptions.brand_logo_url ? (
                  <button
                    type="button"
                    className="mt-2 text-xs font-medium text-red-600 hover:text-red-800"
                    onClick={() => updateInvoiceOptions({ brand_logo_url: "" })}
                  >
                    Remove brand logo
                  </button>
                ) : null}
              </Field>
                </>
              ) : (
                <p className="sm:col-span-2 text-xs text-slate-500">
                  Branding is hidden on this invoice. Turn on “Show branding” to configure logo/name.
                </p>
              )}
              {invoiceOptions.show_payment_details ? (
                <Field label="Payment details" className="sm:col-span-2">
                  <textarea
                    className={inputClass}
                    rows={2}
                    value={invoiceOptions.payment_details}
                    onChange={(e) => updateInvoiceOptions({ payment_details: e.target.value })}
                    placeholder="Bank name, account number, paybill, etc."
                  />
                </Field>
              ) : null}
              {invoiceOptions.show_etims_invoice_no ? (
                <Field label="eTIMS KRA invoice no." className="sm:col-span-2">
                  <input
                    className={inputClass}
                    value={invoiceOptions.etims_invoice_no}
                    onChange={(e) => updateInvoiceOptions({ etims_invoice_no: e.target.value })}
                    placeholder="KRA-approved invoice reference"
                  />
                </Field>
              ) : null}
              {invoiceOptions.watermark_enabled === true ? (
                <>
                  <Field label="Watermark style">
                    <SearchableSelect
  className={inputClass}
  value={invoiceOptions.watermark_mode}
  nativeEvent
  onChange={((e) => updateInvoiceOptions({ watermark_mode: e.target.value }))}
  options={[{ value: 'name', label: 'Brand name' }, { value: 'text', label: 'Custom text' }, { value: 'logo', label: 'Logo image' }]}
/>
                  </Field>
                  {invoiceOptions.watermark_mode === "text" ? (
                    <Field label="Watermark text">
                      <input
                        className={inputClass}
                        value={invoiceOptions.watermark_text}
                        onChange={(e) => updateInvoiceOptions({ watermark_text: e.target.value })}
                      />
                    </Field>
                  ) : null}
                  {invoiceOptions.watermark_mode === "logo" ? (
                    <Field label="Watermark logo" className="sm:col-span-2">
                      <input
                        type="file"
                        accept="image/*"
                        className="block w-full text-sm text-slate-600"
                        onChange={(e) => void handleLogoUpload(e, "watermark_logo_url")}
                      />
                      {invoiceOptions.watermark_logo_url ? (
                        <button
                          type="button"
                          className="mt-2 text-xs font-medium text-red-600 hover:text-red-800"
                          onClick={() => updateInvoiceOptions({ watermark_logo_url: "" })}
                        >
                          Remove watermark logo
                        </button>
                      ) : null}
                    </Field>
                  ) : null}
                </>
              ) : null}
            </div>
            ) : null}
          </section>

          {customerKind === "centrix_tenant" && moduleSummaries.length > 0 ? (
            <section className="theme-panel rounded-xl border p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Workspace modules</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Aligned to Centrix workspaces. Choosing a tenant auto-selects their enabled modules
                (and free Administration). Amounts are market suggestions — edit line items below.
              </p>
              <div className="mt-3 space-y-4">
                {PLATFORM_BILLING_MODULE_GROUPS.map((group) => {
                  const rows = moduleSummaries.filter((summary) => summary.group === group.id);
                  if (!rows.length) return null;
                  return (
                    <div key={group.id}>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {group.label}
                      </p>
                      <ul className="space-y-2">
                        {rows.map((summary) => {
                          const checked = (form.selected_modules ?? []).includes(summary.key);
                          return (
                            <li
                              key={summary.key}
                              className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-2.5 dark:border-slate-700 dark:bg-slate-900/40"
                            >
                              <input
                                type="checkbox"
                                className="mt-1 h-4 w-4 rounded border-slate-300"
                                checked={checked}
                                onChange={(e) => toggleModule(summary, e.target.checked)}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                  {summary.label}
                                  {summary.free ? (
                                    <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">
                                      Free
                                    </span>
                                  ) : null}
                                </p>
                                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                                  {summary.description}
                                </p>
                                <p className="mt-1 text-xs font-medium text-indigo-700 dark:text-indigo-300">
                                  {summary.free
                                    ? "Included free of charge"
                                    : `Suggested: ${form.currency} ${Number(summary.default_amount ?? 0).toLocaleString()} / ${summary.billing_period}`}
                                </p>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="theme-panel rounded-xl border p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Line items</h2>
              <button type="button" className="text-sm font-medium text-indigo-600 hover:text-indigo-800" onClick={addCustomLine}>
                + Add line
              </button>
            </div>
            {customerKind === "external" ? (
              <p className="mt-1 text-xs text-slate-500">
                Use custom lines for website hosting, domains, retainers, or any non-Centrix work.
              </p>
            ) : null}
            <div className="mt-4 space-y-3">
              {(form.line_items ?? []).map((row, index) => (
                <div
                  key={`${row.module_key ?? "custom"}-${index}`}
                  className={`rounded-lg border p-3 ${row.included === false ? "border-dashed opacity-50" : "border-slate-200"}`}
                >
                  <div className="grid gap-3 sm:grid-cols-12">
                    <Field label="Description" className="sm:col-span-6">
                      <textarea
                        className={`${inputClass} min-h-[4.5rem] resize-y`}
                        rows={3}
                        value={row.description ?? ""}
                        onChange={(e) => updateLineItem(index, { description: e.target.value })}
                        placeholder={"Line description\nOptional second line"}
                      />
                    </Field>
                    <Field label="Qty" className={`sm:col-span-2 ${invoiceOptions.show_quantity === false ? "opacity-50" : ""}`}>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        className={inputClass}
                        value={row.quantity ?? 1}
                        disabled={invoiceOptions.show_quantity === false}
                        onChange={(e) => updateLineItem(index, { quantity: e.target.value })}
                      />
                    </Field>
                    <Field label="Unit price" className="sm:col-span-3">
                      <input
                        type="number"
                        step="0.01"
                        className={inputClass}
                        value={row.unit_price ?? 0}
                        onChange={(e) => updateLineItem(index, { unit_price: e.target.value })}
                      />
                    </Field>
                    <div className="flex items-end sm:col-span-1">
                      <button
                        type="button"
                        className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title="Remove line"
                        onClick={() => removeLine(index)}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Line total: {form.currency} {Number(row.amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
              ))}
              {!activeLines.length ? (
                <p className="text-sm text-slate-500">No active line items. Select modules or add a custom line.</p>
              ) : null}
            </div>
            <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
              <div className="flex justify-between">
                <span>Subtotal (ex. VAT)</span>
                <span>
                  {form.currency}{" "}
                  {totals.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span>
                  VAT ({form.tax_rate}%
                  {invoiceOptions.prices_include_vat ? " included" : ""})
                </span>
                <span>
                  {form.currency}{" "}
                  {totals.tax_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="mt-1 flex justify-between font-semibold text-slate-900">
                <span>Total due</span>
                <span>
                  {form.currency}{" "}
                  {totals.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              {invoiceOptions.prices_include_vat ? (
                <p className="mt-2 text-xs text-slate-500">
                  Total due matches the sum of your line amounts.
                </p>
              ) : (
                <p className="mt-2 text-xs text-slate-500">
                  Total due = subtotal + VAT (line amounts are exclusive of VAT).
                </p>
              )}
            </div>
          </section>

          <section className="theme-panel rounded-xl border p-4 shadow-sm">
            <div className="grid gap-3">
              <Field label="Notes">
                <textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => updateForm({ notes: e.target.value })} />
              </Field>
              <Field label="Terms">
                <textarea className={inputClass} rows={2} value={form.terms} onChange={(e) => updateForm({ terms: e.target.value })} />
              </Field>
            </div>
          </section>
        </div>

        <div className="xl:sticky xl:top-4 xl:self-start">
          <section className="theme-panel overflow-hidden rounded-xl border shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
              <h2 className="text-sm font-semibold text-slate-900">Live preview</h2>
              <p className="text-xs text-slate-500">Updates as you edit — matches print output.</p>
            </div>
            <iframe
              title="Invoice preview"
              className="h-[min(70vh,780px)] w-full border-0 bg-white"
              srcDoc={previewHtml}
            />
          </section>
        </div>
      </div>

      <PlatformInvoiceViewer
        open={viewerOpen}
        invoice={previewRecord}
        expanded
        allowEmail={false}
        onClose={() => setViewerOpen(false)}
      />

      {saveTemplateOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl border bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">Save invoice template</h3>
            <p className="mt-1 text-sm text-slate-500">Reuse line items, notes, and design for future invoices.</p>
            <div className="mt-4 space-y-3">
              <Field label="Template name">
                <input className={inputClass} value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
              </Field>
              <Field label="Description (optional)">
                <input className={inputClass} value={templateDescription} onChange={(e) => setTemplateDescription(e.target.value)} />
              </Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100" onClick={() => setSaveTemplateOpen(false)}>
                Cancel
              </button>
              <PrimaryButton type="button" showIcon={false} onClick={() => void handleSaveTemplate()}>
                Save template
              </PrimaryButton>
            </div>
          </div>
        </div>
      ) : null}

      {emailOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">Email invoice</h3>
            <p className="mt-1 text-xs text-slate-500">
              The invoice PDF will be attached. Delivery uses Platform → Email SMTP.
            </p>
            <div className="mt-4 space-y-3">
              <Field label="To">
                <input
                  type="email"
                  className={inputClass}
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                />
              </Field>
              <PlatformAiEmailAssist
                subject={emailSubject}
                body={emailBody}
                onApply={({ subject, body }) => {
                  setEmailSubject(subject);
                  setEmailBody(body);
                }}
              />
              <Field label="Subject">
                <input
                  className={inputClass}
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                />
              </Field>
              <Field label="Body">
                <textarea
                  className={inputClass}
                  rows={10}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                />
              </Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
                onClick={() => setEmailOpen(false)}
              >
                Cancel
              </button>
              <PrimaryButton type="button" showIcon={false} disabled={emailing} onClick={() => void handleSendEmail()}>
                {emailing ? "Sending…" : "Send with PDF"}
              </PrimaryButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PlatformInvoiceEditorPage({ invoiceId = null }) {
  return (
    <CatalogPageShell
      title={invoiceId ? "Edit platform invoice" : "New platform invoice"}
      subtitle="Bill Centrix tenants or external customers (website hosting and other work) with live preview."
    >
      <Suspense fallback={<p className="text-sm text-slate-500">Loading invoice…</p>}>
        <PlatformInvoiceEditor
          invoiceId={invoiceId}
          onSaved={(record) => {
            if (!invoiceId && record?.id) {
              window.location.href = `/platform/invoices/${record.id}`;
            }
          }}
        />
      </Suspense>
    </CatalogPageShell>
  );
}
