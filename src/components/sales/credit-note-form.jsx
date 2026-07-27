"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { formatReceiptNumber, formatSaleKes } from "@/lib/sales";
import {
  resolveCustomerReturnStatuses,
  salesSettingsFromCapabilities,
} from "@/lib/sales-settings";
import {
  CREDIT_NOTE_REASONS,
  REFUND_METHODS,
  RETURN_REASON_OTHER,
  resolveReturnReason,
  parseInvoiceNumber,
  salesReturnSearchParams,
} from "@/components/sales/customer-returns-shared";

function emptyCreditLineFromSaleItem(item) {
  const lineTotal = Math.round(Number(item.amount ?? item.line_total ?? 0) * 100) / 100;
  return {
    sale_item_id: item.sale_item_id ?? item.id,
    product_code: item.product_code,
    product_name: item.product_name ?? item.product?.product_name ?? item.product_code,
    uom: item.uom ?? null,
    quantity_sold: Number(item.quantity_sold ?? item.quantity ?? 0),
    line_total: lineTotal,
    max_credit_amount: lineTotal,
    credit_amount: 0,
    line_no: item.line_no ?? null,
  };
}

function totalCreditAmount(lines) {
  return lines.reduce((sum, line) => sum + Number(line.credit_amount || 0), 0);
}

function isCreditReasonValid(preset, otherText) {
  const selected = String(preset ?? "").trim();
  if (!selected) return false;
  if (selected === RETURN_REASON_OTHER) {
    return String(otherText ?? "").trim().length >= 3;
  }
  return true;
}

export function CreditNoteForm({
  onSaved,
  onCancel,
  backHref = "/sales/credit-notes",
  backLabel = "← Back to credit notes",
  initialSaleId = "",
}) {
  const router = useRouter();
  const { user, capabilities } = useAuth();
  const returnSearchStatuses = useMemo(
    () => resolveCustomerReturnStatuses(salesSettingsFromCapabilities(capabilities)),
    [capabilities],
  );
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [saleOptions, setSaleOptions] = useState([]);
  const [saleId, setSaleId] = useState("");
  const [customerNum, setCustomerNum] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [creditDate, setCreditDate] = useState(new Date().toISOString().slice(0, 10));
  const [refundMethod, setRefundMethod] = useState("CASH");
  const [reasonPreset, setReasonPreset] = useState(CREDIT_NOTE_REASONS[0]);
  const [reasonOther, setReasonOther] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([]);
  const [loadingSale, setLoadingSale] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [invoiceHint, setInvoiceHint] = useState(null);

  const totalCredit = useMemo(() => totalCreditAmount(lines), [lines]);

  useEffect(() => {
    const q = invoiceQuery.trim();
    if (q.length < 2) {
      setSaleOptions([]);
      return;
    }
    const timer = setTimeout(() => {
      apiRequest("/sales", {
        searchParams: salesReturnSearchParams(q, returnSearchStatuses),
      })
        .then((res) => setSaleOptions(res.data ?? []))
        .catch(() => setSaleOptions([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [invoiceQuery, returnSearchStatuses]);

  const loadSale = useCallback(async (id, displayQuery) => {
    if (!id) return;
    setLoadingSale(true);
    setError(null);
    setInvoiceHint(null);
    try {
      const res = await apiRequest(`/sales/${id}/return-lines`);
      const sale = res.sale ?? res;
      setSaleId(String(sale.id));
      setCustomerNum(sale.customer_num ? String(sale.customer_num) : "");
      setCustomerName(sale.customer_name_override ?? res.customer?.customer_name ?? "");
      setInvoiceQuery(displayQuery ?? formatReceiptNumber(sale));
      const nextLines = (res.lines ?? sale.items ?? []).map((item) =>
        emptyCreditLineFromSaleItem(item),
      );
      setLines(nextLines);
      setInvoiceHint(`Loaded ${nextLines.length} item(s) from invoice.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load invoice");
      setLines([]);
    } finally {
      setLoadingSale(false);
    }
  }, []);

  useEffect(() => {
    if (!initialSaleId) return;
    if (String(initialSaleId) === "undefined" || String(initialSaleId) === "null") return;
    loadSale(initialSaleId);
  }, [initialSaleId, loadSale]);

  const resolveAndLoadInvoice = useCallback(async () => {
    const q = invoiceQuery.trim();
    if (!q) return;

    const exactOption = saleOptions.find(
      (sale) => formatReceiptNumber(sale).toLowerCase() === q.toLowerCase(),
    );
    if (exactOption) {
      await loadSale(exactOption.id);
      return;
    }

    const orderNum = parseInvoiceNumber(q);
    if (orderNum != null) {
      const match = saleOptions.find(
        (sale) => Number(sale.order_num) === orderNum || Number(sale.id) === orderNum,
      );
      if (match) {
        await loadSale(match.id);
        return;
      }
    }

    setLoadingSale(true);
    setError(null);
    try {
      const res = await apiRequest("/sales", {
        searchParams: salesReturnSearchParams(q, returnSearchStatuses),
      });
      const sales = res.data ?? [];
      const match =
        sales.find((sale) => formatReceiptNumber(sale).toLowerCase() === q.toLowerCase()) ??
        (orderNum != null
          ? sales.find(
              (sale) => Number(sale.order_num) === orderNum || Number(sale.id) === orderNum,
            )
          : null) ??
        (sales.length === 1 ? sales[0] : null);

      if (!match) {
        setError("No matching invoice found. Check the number and try again.");
        setLines([]);
        return;
      }

      await loadSale(match.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not find invoice");
    } finally {
      setLoadingSale(false);
    }
  }, [invoiceQuery, saleOptions, loadSale, returnSearchStatuses]);

  function updateCreditAmount(index, rawValue) {
    const parsed = rawValue === "" ? 0 : Number(rawValue);
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const max = Number(line.max_credit_amount ?? line.line_total ?? 0);
        const creditAmount = Number.isFinite(parsed) ? Math.max(0, Math.min(parsed, max)) : 0;
        return { ...line, credit_amount: creditAmount };
      }),
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!user?.branch_id) {
      setError("Your user profile has no branch assigned.");
      return;
    }
    const payloadLines = lines.filter((line) => Number(line.credit_amount) > 0);
    if (!payloadLines.length) {
      setError("Enter a credit amount for at least one product.");
      return;
    }
    if (!isCreditReasonValid(reasonPreset, reasonOther)) {
      setError("Reason for credit note is required.");
      return;
    }
    const resolvedReason = resolveReturnReason(reasonPreset, reasonOther);

    setSaving(true);
    setError(null);
    try {
      const body = {
        sale_id: Number(saleId),
        customer_num: customerNum ? Number(customerNum) : null,
        branch_id: user.branch_id,
        credit_date: creditDate,
        return_date: creditDate,
        refund_method: refundMethod,
        reason: resolvedReason,
        notes: notes.trim() || null,
        lines: payloadLines.map((line) => ({
          sale_item_id: line.sale_item_id,
          product_code: line.product_code,
          product_name: line.product_name,
          uom: line.uom ?? null,
          amount: line.credit_amount,
          line_no: line.line_no,
        })),
      };

      await apiRequest("/credit-notes", { method: "POST", body });
      if (onSaved) {
        await onSaved();
      } else {
        router.push("/sales/credit-notes");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save credit note");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (onCancel) {
      onCancel();
      return;
    }
    router.push(backHref);
  }

  return (
    <form onSubmit={handleSubmit} className="theme-panel rounded-xl border p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Create credit note</h1>
          <p className="mt-1 text-sm text-slate-500">
            Issue a credit for billing errors or price adjustments without returning stock.
          </p>
        </div>
        <button type="button" onClick={handleCancel} className="text-sm text-[#185FA5] hover:underline">
          {backLabel}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Invoice / receipt no." required>
          <div className="flex gap-2">
            <input
              list="credit-note-sale-options"
              className={inputClassName()}
              value={invoiceQuery}
              onChange={(e) => setInvoiceQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void resolveAndLoadInvoice();
                }
              }}
              placeholder="Search by receipt or invoice number"
              required
            />
            <datalist id="credit-note-sale-options">
              {saleOptions.map((sale) => (
                <option key={sale.id} value={formatReceiptNumber(sale)} />
              ))}
            </datalist>
            <button
              type="button"
              onClick={() => void resolveAndLoadInvoice()}
              disabled={loadingSale}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {loadingSale ? "Loading…" : "Load"}
            </button>
          </div>
          {invoiceHint ? <p className="mt-1 text-xs text-emerald-700">{invoiceHint}</p> : null}
        </Field>

        <Field label="Customer">
          <input className={inputClassName()} value={customerName || "Walk-in"} readOnly />
        </Field>

        <Field label="Credit date" required>
          <input
            type="date"
            className={inputClassName()}
            value={creditDate}
            onChange={(e) => setCreditDate(e.target.value)}
            required
          />
        </Field>

        <Field label="Refund method">
          <select
            className={inputClassName()}
            value={refundMethod}
            onChange={(e) => setRefundMethod(e.target.value)}
          >
            {REFUND_METHODS.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Reason for credit" required>
          <select
            className={inputClassName()}
            value={reasonPreset}
            onChange={(e) => setReasonPreset(e.target.value)}
            required
          >
            {CREDIT_NOTE_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {reason}
              </option>
            ))}
          </select>
        </Field>
        {reasonPreset === RETURN_REASON_OTHER ? (
          <Field label="Please specify" required>
            <input
              className={inputClassName()}
              value={reasonOther}
              onChange={(e) => setReasonOther(e.target.value)}
              required
            />
          </Field>
        ) : null}
      </div>

      <Field label="Notes" className="mt-4">
        <textarea
          rows={2}
          className={inputClassName()}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional internal notes"
        />
      </Field>

      {lines.length > 0 ? (
        <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2 text-right">Line total</th>
                <th className="px-3 py-2 text-right">Credit amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={`${line.sale_item_id}-${line.product_code}`} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900">{line.product_name}</div>
                    <div className="text-xs text-slate-500">{line.product_code}</div>
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700">
                    {formatSaleKes(line.line_total)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      max={line.max_credit_amount}
                      className={`${inputClassName()} w-32 text-right`}
                      value={line.credit_amount || ""}
                      onChange={(e) => updateCreditAmount(index, e.target.value)}
                      placeholder="0.00"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50">
                <td colSpan={2} className="px-3 py-2 text-right font-medium text-slate-700">
                  Total credit
                </td>
                <td className="px-3 py-2 text-right font-semibold text-slate-900">
                  {formatSaleKes(totalCredit)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      <div className="mt-6 flex flex-wrap gap-2">
        <PrimaryButton type="submit" disabled={saving || !saleId || loadingSale}>
          {saving ? "Saving…" : "Create credit note"}
        </PrimaryButton>
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
