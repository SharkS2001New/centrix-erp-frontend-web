"use client";

import { useEffect, useMemo, useState } from "react";
import { TabFormCancelButton } from "@/components/layout/tab-form-exit-button";
import { apiRequest, ApiError } from "@/lib/api";
import { Field, SearchableSelect, inputClassName, parseDecimalInput } from "@/components/catalog/catalog-shared";
import { lpoRowDisplayNumber } from "@/components/lpo/lpo-shared";
import { SupplierFormCard, SupplierFormPageShell } from "./supplier-form";
import {
  EMPTY_SUPPLIER_PAYMENT_FORM,
  buildSupplierPaymentReferencePayload,
  formatSupplierKes,
  getSupplierPaymentMethodKind,
  supplierPaymentReferenceMeta,
  todayLocalDateString,
  validateSupplierPaymentReference,
} from "./suppliers-shared";
import { useAuth } from "@/contexts/auth-context";
import { filterPaymentMethodsForOrg } from "@/lib/org-payment-methods";

function PaymentMethodReferenceFields({ form, setForm, paymentMethods }) {
  const selectedMethod = useMemo(
    () => paymentMethods.find((m) => String(m.id) === String(form.payment_method_id)),
    [paymentMethods, form.payment_method_id],
  );
  const kind = getSupplierPaymentMethodKind(selectedMethod);
  const meta = supplierPaymentReferenceMeta(kind);

  if (!form.payment_method_id) {
    return (
      <p className="text-sm text-slate-500 md:col-span-2">
        Select a payment method to enter cheque, M-Pesa, or bank details.
      </p>
    );
  }

  if (kind === "cash") {
    return (
      <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-600 md:col-span-2">
        Cash payment — no transaction reference required. Add notes below if needed.
      </p>
    );
  }

  if (!meta) return null;

  return (
    <Field label={meta.label}>
      <input
        className={inputClassName()}
        value={form[meta.field] ?? ""}
        onChange={(e) => setForm((p) => ({ ...p, [meta.field]: e.target.value }))}
        placeholder={meta.placeholder}
        required={meta.required}
      />
    </Field>
  );
}

/**
 * @param {object} props
 * @param {string|null} [props.initialSupplierId]
 * @param {string|null} [props.initialLpoNo]
 * @param {() => void} props.onSuccess
 * @param {string} props.backHref
 * @param {string} props.backLabel
 * @param {string} [props.pageTitle]
 * @param {string} [props.pageSubtitle]
 */
export function RecordSupplierPaymentForm({
  initialSupplierId = null,
  initialLpoNo = null,
  onSuccess,
  backHref,
  backLabel,
  pageTitle = "Record supplier payment",
  pageSubtitle = "Post a payment to reduce accounts payable. Search a supplier invoice number (selects its LPO) or link an LPO when paying for a specific purchase.",
}) {
  const { capabilities } = useAuth();
  const today = todayLocalDateString();
  const [form, setForm] = useState(() => ({
    ...EMPTY_SUPPLIER_PAYMENT_FORM,
    date_paid: today,
    lpo_no: initialLpoNo ? String(initialLpoNo) : "",
  }));
  const [supplierId, setSupplierId] = useState(
    initialSupplierId != null ? String(initialSupplierId) : "",
  );
  const [suppliers, setSuppliers] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [supplierOwing, setSupplierOwing] = useState(null);
  const [lpoOptions, setLpoOptions] = useState([]);
  const [invoiceOptions, setInvoiceOptions] = useState([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingSupplier, setLoadingSupplier] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingMeta(true);
    Promise.all([
      apiRequest("/suppliers", { searchParams: { per_page: 200 } }),
      apiRequest("/payment-methods", { searchParams: { per_page: 200 } }).catch(() => ({
        data: [],
      })),
    ])
      .then(([supRes, methodsRes]) => {
        if (cancelled) return;
        setSuppliers(supRes.data ?? []);
        setPaymentMethods(
          filterPaymentMethodsForOrg(
            methodsRes.data ?? methodsRes ?? [],
            capabilities?.module_settings,
            { capabilities, checkoutContext: "order_payment" },
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setFormError("Failed to load suppliers or payment methods.");
      })
      .finally(() => {
        if (!cancelled) setLoadingMeta(false);
      });
    return () => {
      cancelled = true;
    };
  }, [capabilities]);

  useEffect(() => {
    if (initialLpoNo) {
      setForm((p) => ({ ...p, lpo_no: String(initialLpoNo) }));
    }
  }, [initialLpoNo]);

  useEffect(() => {
    if (!supplierId) {
      setSupplierOwing(null);
      setLpoOptions([]);
      setInvoiceOptions([]);
      return;
    }
    let cancelled = false;
    setLoadingSupplier(true);
    apiRequest(`/suppliers/${supplierId}/summary`)
      .then((summary) => {
        if (cancelled) return;
        setSupplierOwing(Number(summary.supplier?.current_balance ?? 0));
        const purchases = summary.purchases ?? [];
        setLpoOptions(
          purchases.map((p) => ({
            lpo_no: p.lpo_no,
            balance_due: p.balance_due,
            amount_paid: p.amount_paid,
            total_amount: p.net_amount || p.total_amount,
            supplier_invoice_no: p.supplier_invoice_no,
            items_fully_received: Boolean(p.items_fully_received ?? p.can_pay),
            can_pay: Boolean(p.can_pay ?? p.items_fully_received),
            received_payable_total: p.received_payable_total,
          })),
        );
        setInvoiceOptions(
          (summary.invoices ?? []).map((inv) => ({
            id: inv.id != null ? String(inv.id) : "",
            lpo_no: inv.lpo_no,
            supplier_invoice_number: inv.supplier_invoice_number,
            invoice_date: inv.invoice_date,
            invoice_amount: inv.invoice_amount,
            balance_due: inv.balance_due,
            amount_paid: inv.amount_paid,
            can_pay: Boolean(inv.can_pay),
            total_amount: inv.total_amount,
            po_number: inv.po_number,
            lpo_seq: inv.lpo_seq,
          })),
        );
        if (initialLpoNo) {
          const match = purchases.find((p) => String(p.lpo_no) === String(initialLpoNo));
          if (!match) {
            setFormError((prev) =>
              prev ||
              `LPO ${lpoRowDisplayNumber({ lpo_no: initialLpoNo })} was not found for this supplier. Pick another LPO or leave unlinked.`,
            );
          } else if (Number(match.balance_due ?? 0) <= 0) {
            setForm((p) => ({
              ...p,
              lpo_no: "",
              lpo_supplier_invoice_id: "",
              amount_paid: "",
            }));
            setFormError((prev) =>
              prev ||
              `LPO ${lpoRowDisplayNumber({ lpo_no: initialLpoNo })} is already fully paid. Pick another LPO or leave unlinked.`,
            );
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSupplierOwing(null);
          setLpoOptions([]);
          setInvoiceOptions([]);
          setFormError("Could not load supplier purchases for LPO allocation.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSupplier(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supplierId, initialLpoNo]);

  const selectedMethod = useMemo(
    () => paymentMethods.find((m) => String(m.id) === String(form.payment_method_id)),
    [paymentMethods, form.payment_method_id],
  );
  const methodKind = getSupplierPaymentMethodKind(selectedMethod);

  const selectedLpo = useMemo(
    () => lpoOptions.find((l) => String(l.lpo_no) === String(form.lpo_no)),
    [lpoOptions, form.lpo_no],
  );

  // Hide fully settled LPOs from the payment picker (still kept in lpoOptions for deep-links).
  const payableLpoOptions = useMemo(
    () => lpoOptions.filter((l) => Number(l.balance_due ?? 0) > 0),
    [lpoOptions],
  );

  // All open invoices for this supplier — searchable without picking an LPO first.
  const searchableInvoices = useMemo(() => {
    return invoiceOptions.filter((inv) => {
      if (inv.id && inv.invoice_amount != null && Number(inv.balance_due ?? 0) <= 0) {
        return false;
      }
      return true;
    });
  }, [invoiceOptions]);

  const selectedInvoice = useMemo(() => {
    if (form.lpo_supplier_invoice_id) {
      return (
        searchableInvoices.find(
          (inv) => String(inv.id) === String(form.lpo_supplier_invoice_id),
        ) ??
        invoiceOptions.find(
          (inv) => String(inv.id) === String(form.lpo_supplier_invoice_id),
        ) ??
        null
      );
    }
    if (!form.lpo_no) return null;
    // Header-only invoice numbers have no document id — match by LPO.
    return (
      searchableInvoices.find((inv) => !inv.id && String(inv.lpo_no) === String(form.lpo_no)) ??
      null
    );
  }, [searchableInvoices, invoiceOptions, form.lpo_supplier_invoice_id, form.lpo_no]);

  function onInvoiceSelect(next) {
    if (!next) {
      setForm((p) => ({
        ...p,
        lpo_supplier_invoice_id: "",
        amount_paid: "",
      }));
      return;
    }
    const inv = searchableInvoices.find((row) => {
      if (row.id) return String(row.id) === String(next);
      return `lpo:${row.lpo_no}` === String(next);
    });
    if (!inv) return;
    const due = Number(inv.balance_due ?? 0);
    setForm((p) => ({
      ...p,
      lpo_supplier_invoice_id: inv.id ? String(inv.id) : "",
      // Selecting an invoice always binds the related LPO.
      lpo_no: inv.lpo_no != null ? String(inv.lpo_no) : p.lpo_no,
      amount_paid: due > 0 ? String(due) : "",
    }));
    setFormError(null);
  }

  function onLpoSelect(next) {
    setForm((p) => {
      if (!next) {
        return {
          ...p,
          lpo_no: "",
          lpo_supplier_invoice_id: "",
          amount_paid: "",
        };
      }
      const forLpo = searchableInvoices.filter((inv) => String(inv.lpo_no) === String(next));
      const keepCurrent =
        p.lpo_supplier_invoice_id &&
        forLpo.some((inv) => String(inv.id) === String(p.lpo_supplier_invoice_id));
      const matchingInvoice =
        forLpo.find((inv) => inv.id && Number(inv.balance_due ?? 0) > 0) ??
        forLpo.find((inv) => inv.id);
      const nextInvoiceId = keepCurrent
        ? p.lpo_supplier_invoice_id
        : matchingInvoice
          ? String(matchingInvoice.id)
          : "";
      const selected =
        forLpo.find((inv) => String(inv.id) === String(nextInvoiceId)) ?? matchingInvoice;
      const due = selected ? Number(selected.balance_due ?? 0) : Number(
        payableLpoOptions.find((l) => String(l.lpo_no) === String(next))?.balance_due ?? 0,
      );
      return {
        ...p,
        lpo_no: next,
        lpo_supplier_invoice_id: nextInvoiceId,
        amount_paid: due > 0 ? String(due) : "",
      };
    });
  }

  const systemBalanceDue = useMemo(() => {
    if (selectedInvoice && selectedInvoice.invoice_amount != null) {
      return Number(selectedInvoice.balance_due ?? 0);
    }
    if (selectedLpo) return Number(selectedLpo.balance_due ?? 0);
    return Number(supplierOwing ?? 0);
  }, [selectedInvoice, selectedLpo, supplierOwing]);

  const declaredPayable = parseDecimalInput(form.declared_payable);
  const manual = Boolean(form.manual_amount);

  const payableBase = useMemo(() => {
    if (manual && declaredPayable > 0) {
      if (selectedLpo) {
        const paid = Number(selectedLpo.amount_paid ?? 0);
        return Math.max(0, declaredPayable - paid);
      }
      return declaredPayable;
    }
    return systemBalanceDue;
  }, [manual, declaredPayable, selectedLpo, systemBalanceDue]);

  const paymentAmount = parseDecimalInput(form.amount_paid);
  const remainingAfter = Math.max(0, payableBase - paymentAmount);
  const isPartialPreview =
    paymentAmount > 0 && payableBase > 0 && paymentAmount + 0.01 < payableBase;

  function fillFullBalance() {
    if (payableBase <= 0) return;
    setForm((p) => ({ ...p, amount_paid: String(payableBase) }));
  }

  function fillDeclaredFromLpo() {
    if (!selectedLpo) return;
    const total = Number(selectedLpo.total_amount ?? 0);
    if (total > 0) {
      setForm((p) => ({ ...p, declared_payable: String(total), manual_amount: true }));
    }
  }

  function onPaymentMethodChange(methodId) {
    setForm((p) => ({
      ...p,
      payment_method_id: methodId,
      reference_number: "",
      cheque_number: "",
    }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!supplierId) {
      setFormError("Select a supplier.");
      return;
    }
    const amount = parseDecimalInput(form.amount_paid);
    if (amount <= 0) {
      setFormError("Enter a payment amount greater than zero.");
      return;
    }
    if (!form.payment_method_id) {
      setFormError("Select a payment method.");
      return;
    }

    const refError = validateSupplierPaymentReference(form, methodKind);
    if (refError) {
      setFormError(refError);
      return;
    }

    if (!form.date_paid) {
      setFormError("Enter the date paid.");
      return;
    }
    if (form.date_paid > today) {
      setFormError("Date paid cannot be in the future. Use today or a past date.");
      return;
    }

    if (form.lpo_no && !lpoOptions.some((l) => String(l.lpo_no) === String(form.lpo_no))) {
      setFormError("Selected LPO does not belong to this supplier.");
      return;
    }

    if (
      form.lpo_no &&
      selectedLpo &&
      Number(selectedLpo.balance_due ?? 0) <= 0 &&
      !manual
    ) {
      setFormError(
        "This LPO is already fully paid. Pick another LPO or enable manual payable amount.",
      );
      return;
    }

    if (
      form.lpo_supplier_invoice_id &&
      !searchableInvoices.some((inv) => String(inv.id) === String(form.lpo_supplier_invoice_id)) &&
      !invoiceOptions.some((inv) => String(inv.id) === String(form.lpo_supplier_invoice_id))
    ) {
      setFormError("Selected supplier invoice does not belong to this supplier.");
      return;
    }

    if (form.lpo_no && selectedLpo && !selectedLpo.can_pay && !manual) {
      setFormError(
        "This LPO cannot be paid until some items have been received. Use Receive stock on the LPO first.",
      );
      return;
    }

    if (manual && declaredPayable <= 0) {
      setFormError("Enter the payable amount you are paying against.");
      return;
    }
    if (!manual) {
      if (systemBalanceDue <= 0 && form.lpo_no) {
        setFormError(
          "This LPO has no balance on record. Turn on manual payable amount to enter the correct figure.",
        );
        return;
      }
      if (amount > systemBalanceDue + 0.01) {
        setFormError(
          `Amount exceeds balance due (${formatSupplierKes(systemBalanceDue)}). Use partial payment, pay full balance, or manual payable amount.`,
        );
        return;
      }
    } else if (declaredPayable > 0 && amount > payableBase + 0.01) {
      setFormError(`Payment exceeds payable amount (${formatSupplierKes(payableBase)}).`);
      return;
    }

    const refs = buildSupplierPaymentReferencePayload(form, methodKind);

    setSaving(true);
    setFormError(null);
    try {
      await apiRequest(`/suppliers/${supplierId}/payments`, {
        method: "POST",
        body: {
          lpo_no: form.lpo_no ? Number(form.lpo_no) : null,
          lpo_supplier_invoice_id: form.lpo_supplier_invoice_id
            ? Number(form.lpo_supplier_invoice_id)
            : null,
          payment_method_id: Number(form.payment_method_id),
          amount_paid: amount,
          manual_amount: manual,
          declared_payable: manual && declaredPayable > 0 ? declaredPayable : null,
          amount_due_snapshot: payableBase > 0 ? payableBase : null,
          ...refs,
          date_paid: form.date_paid,
          notes: form.notes.trim() || null,
        },
      });
      onSuccess(supplierId);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Payment failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SupplierFormPageShell
      backHref={backHref}
      backLabel={backLabel}
      title={pageTitle}
      subtitle={pageSubtitle}
    >
      <SupplierFormCard
        onSubmit={submit}
        actions={
          <>
            {formError && (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
            )}
            <div className="mt-6 flex gap-2 border-t border-slate-200 pt-4">
              <TabFormCancelButton href={backHref} />
              <button
                type="submit"
                disabled={saving || loadingMeta}
                className="rounded-lg bg-[#185FA5] px-6 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a] disabled:opacity-50"
              >
                {saving
                  ? "Posting…"
                  : isPartialPreview
                    ? "Post partial payment"
                    : "Post payment"}
              </button>
            </div>
          </>
        }
      >
        {loadingMeta ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            <p className="text-xs text-slate-500 md:col-span-2">
              Payments appear on the supplier profile under Payments and in Supplier payments.
              Search a supplier invoice number (selects its LPO), or link an LPO first.
            </p>

            <Field label="Supplier">
              <SearchableSelect
                value={supplierId}
                onChange={(next) => {
                  setSupplierId(next);
                  setForm((p) => ({
                    ...EMPTY_SUPPLIER_PAYMENT_FORM,
                    payment_method_id: p.payment_method_id,
                    date_paid: p.date_paid,
                    lpo_no: initialLpoNo && next === String(initialSupplierId)
                      ? String(initialLpoNo)
                      : "",
                  }));
                  setFormError(null);
                }}
                required
                disabled={Boolean(initialSupplierId)}
                placeholder="Select supplier"
                options={[
                  { value: "", label: "Select supplier" },
                  ...suppliers.map((s) => ({ value: String(s.id), label: s.supplier_name })),
                ]}
              />
            </Field>

            {supplierId && supplierOwing != null ? (
              <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <p className="text-slate-600">
                  Amount owing:{" "}
                  <span className="font-medium text-slate-900">
                    {formatSupplierKes(supplierOwing)}
                  </span>
                  {loadingSupplier ? (
                    <span className="ml-2 text-xs text-slate-400">Updating LPOs…</span>
                  ) : null}
                </p>
              </div>
            ) : (
              <div />
            )}

            <div className="md:col-span-2">
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={form.manual_amount}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      manual_amount: e.target.checked,
                      declared_payable: e.target.checked ? p.declared_payable : "",
                      amount_paid: "",
                    }))
                  }
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium text-slate-800">Payable amount not on LPO</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Use when the LPO total was not captured or is incorrect.
                  </span>
                </span>
              </label>
            </div>

            {manual ? (
              <Field label="Amount payable (KES)">
                <input
                  className={inputClassName()}
                  inputMode="decimal"
                  value={form.declared_payable}
                  onChange={(e) => setForm((p) => ({ ...p, declared_payable: e.target.value }))}
                  placeholder="Total you owe for this payment"
                  required
                />
              </Field>
            ) : null}

            <Field label="Link payment to supplier invoice">
              <SearchableSelect
                value={
                  form.lpo_supplier_invoice_id
                    ? String(form.lpo_supplier_invoice_id)
                    : selectedInvoice && !selectedInvoice.id
                      ? `lpo:${selectedInvoice.lpo_no}`
                      : ""
                }
                onChange={onInvoiceSelect}
                disabled={!supplierId || loadingSupplier}
                placeholder="Search invoice #…"
                options={[
                  {
                    value: "",
                    label: searchableInvoices.length
                      ? "No invoice link"
                      : "No open invoices for this supplier",
                  },
                  ...searchableInvoices.map((inv) => ({
                    value: inv.id ? String(inv.id) : `lpo:${inv.lpo_no}`,
                    label: `${inv.supplier_invoice_number}${
                      inv.po_number || inv.lpo_seq || inv.lpo_no
                        ? ` · ${lpoRowDisplayNumber(inv)}`
                        : ""
                    }${
                      inv.invoice_amount != null
                        ? ` · ${formatSupplierKes(inv.invoice_amount)}`
                        : ""
                    } — ${formatSupplierKes(inv.balance_due)} due`,
                  })),
                ]}
              />
              <p className="mt-1 text-xs text-slate-500">
                Search by invoice number without picking an LPO — the related LPO is selected
                automatically. Each invoice number belongs to only one LPO.
              </p>
            </Field>

            <Field label="Link payment to LPO">
              <SearchableSelect
                value={form.lpo_no}
                onChange={onLpoSelect}
                disabled={!supplierId || loadingSupplier}
                placeholder="General payment (supplier account)"
                options={[
                  { value: "", label: "General payment (supplier account)" },
                  ...payableLpoOptions.map((l) => ({
                    value: String(l.lpo_no),
                    label: `${lpoRowDisplayNumber(l)}${
                      l.supplier_invoice_no ? ` · inv ${l.supplier_invoice_no}` : ""
                    } — ${formatSupplierKes(l.balance_due)} due${
                      Number(l.total_amount) > 0
                        ? ` (total ${formatSupplierKes(l.total_amount)})`
                        : " (no LPO total)"
                    }${!l.can_pay ? " — receive stock first" : ""}`,
                  })),
                ]}
              />
              <p className="mt-1 text-xs text-slate-500">
                Optional. Filled automatically when you pick an invoice, or choose an LPO directly.
              </p>
            </Field>

            {selectedInvoice?.invoice_amount != null && !manual ? (
              <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                Invoice {selectedInvoice.supplier_invoice_number}:{" "}
                <span className="font-medium">
                  {formatSupplierKes(selectedInvoice.invoice_amount)}
                </span>
                {" · "}
                paid {formatSupplierKes(selectedInvoice.amount_paid ?? 0)}
                {" · "}
                due{" "}
                <span className="font-medium">
                  {formatSupplierKes(selectedInvoice.balance_due)}
                </span>
              </div>
            ) : null}

            {manual && selectedLpo && Number(selectedLpo.total_amount) > 0 ? (
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={fillDeclaredFromLpo}
                  className="text-xs font-medium text-[#185FA5] hover:underline"
                >
                  Use LPO total ({formatSupplierKes(selectedLpo.total_amount)}) as payable
                </button>
              </div>
            ) : null}

            {selectedLpo && !selectedLpo.can_pay ? (
              <div className="md:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {lpoRowDisplayNumber(selectedLpo)}: receive stock on at least one line before payment is
                allowed.
              </div>
            ) : null}

            {selectedLpo && !manual && selectedLpo.can_pay ? (
              <div className="md:col-span-2 rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2 text-sm text-amber-900">
                <p>
                  {lpoRowDisplayNumber(selectedLpo)} balance due (received stock only):{" "}
                  <span className="font-medium">{formatSupplierKes(selectedLpo.balance_due)}</span>
                  {selectedLpo.received_payable_total != null ? (
                    <span className="text-xs text-amber-800">
                      {" "}
                      — payable on received: {formatSupplierKes(selectedLpo.received_payable_total)}
                    </span>
                  ) : null}
                </p>
                {Number(selectedLpo.total_amount) <= 0 ? (
                  <p className="mt-1 text-xs">
                    No LPO total on file — enable manual payable amount above.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="md:col-span-2 flex flex-wrap items-end gap-2">
              <div className="min-w-[200px] flex-1">
                <Field label="Payment amount (KES)">
                  <input
                    className={inputClassName()}
                    inputMode="decimal"
                    value={form.amount_paid}
                    onChange={(e) => setForm((p) => ({ ...p, amount_paid: e.target.value }))}
                    placeholder={
                      payableBase > 0
                        ? `Up to ${payableBase.toLocaleString("en-KE")}`
                        : "Amount paid now"
                    }
                    required
                  />
                </Field>
              </div>
              {payableBase > 0 ? (
                <button
                  type="button"
                  onClick={fillFullBalance}
                  className="mb-0.5 shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-[#185FA5] hover:bg-slate-50"
                >
                  {manual ? "Pay full payable" : "Pay full balance"}
                </button>
              ) : null}
            </div>

            {paymentAmount > 0 && payableBase > 0 ? (
              <p className="text-sm text-slate-600 md:col-span-2">
                {isPartialPreview ? (
                  <>
                    Partial payment — remaining:{" "}
                    <span className="font-medium text-amber-700">
                      {formatSupplierKes(remainingAfter)}
                    </span>
                  </>
                ) : (
                  <span className="font-medium text-emerald-700">
                    This payment clears the payable amount.
                  </span>
                )}
              </p>
            ) : null}

            <Field label="Payment method">
              <SearchableSelect
                value={form.payment_method_id}
                onChange={(next) => onPaymentMethodChange(next)}
                required
                placeholder="Select method"
                options={[
                  { value: "", label: "Select method" },
                  ...paymentMethods.map((m) => ({ value: String(m.id), label: m.method_name })),
                ]}
              />
            </Field>

            <PaymentMethodReferenceFields
              form={form}
              setForm={setForm}
              paymentMethods={paymentMethods}
            />

            <Field label="Date paid">
              <input
                type="date"
                className={inputClassName()}
                value={form.date_paid}
                max={today}
                onChange={(e) => {
                  const next = e.target.value;
                  setForm((p) => ({ ...p, date_paid: next }));
                  if (next && next > today) {
                    setFormError("Date paid cannot be in the future. Use today or a past date.");
                  } else {
                    setFormError((prev) =>
                      prev && /future/i.test(prev) ? null : prev,
                    );
                  }
                }}
                required
              />
              <p className="mt-1 text-xs text-slate-500">Today or a past date only.</p>
            </Field>

            <div className="md:col-span-2">
              <Field label="Notes (optional)">
                <textarea
                  className={`${inputClassName()} min-h-[64px]`}
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Internal note about this payment"
                />
              </Field>
            </div>
          </div>
        )}
      </SupplierFormCard>
    </SupplierFormPageShell>
  );
}
