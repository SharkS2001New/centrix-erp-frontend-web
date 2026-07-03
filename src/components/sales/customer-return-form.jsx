"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, apiRequestMultipart, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { ReturnProofField } from "@/components/returns/return-proof-field";
import { formatReceiptNumber, formatSaleKes } from "@/lib/sales";
import {
  REFUND_METHODS,
  RETURN_REASONS,
  parseReturnReason,
  resolveReturnReason,
  customerReturnLineQtyLabel,
  customerReturnLineUnitLabel,
  emptyReturnLineFromSaleItem,
  initReturnLineCounts,
  parseInvoiceNumber,
  applyReturnAllLines,
  buildReturnCountsForLines,
  clearReturnAllLines,
  isFullOrderReturn,
  recalcReturnLine,
  recalcReturnLineFromCounts,
  resolveCustomerReturnLineUom,
  returnLineCountId,
  totalReturnAmount,
} from "@/components/sales/customer-returns-shared";
import { ReturnReasonFields, isReturnReasonValid } from "@/components/returns/return-reason-fields";
import { CustomerReturnQtyInputs } from "@/components/sales/customer-return-qty-inputs";

export function CustomerReturnForm({
  editing,
  onSaved,
  onCancel,
  backHref = "/sales/returns",
  backLabel = "← Back to returns",
  initialSaleId = "",
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [saleOptions, setSaleOptions] = useState([]);
  const [saleId, setSaleId] = useState("");
  const [customerNum, setCustomerNum] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10));
  const [refundMethod, setRefundMethod] = useState("CASH");
  const [reasonPreset, setReasonPreset] = useState(RETURN_REASONS[0]);
  const [reasonOther, setReasonOther] = useState("");
  const [notes, setNotes] = useState("");
  const [stockLocation, setStockLocation] = useState("shop");
  const [lines, setLines] = useState([]);
  const [loadingSale, setLoadingSale] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [invoiceHint, setInvoiceHint] = useState(null);
  const [uoms, setUoms] = useState([]);
  const [returnCounts, setReturnCounts] = useState({});
  const [returnAll, setReturnAll] = useState(false);
  const [proofFile, setProofFile] = useState(null);

  const uomById = useMemo(() => new Map(uoms.map((u) => [u.id, u])), [uoms]);
  const totalRefund = useMemo(() => totalReturnAmount(lines), [lines]);

  useEffect(() => {
    apiRequest("/uoms", { searchParams: { per_page: 200 } })
      .then((res) => setUoms(res.data ?? []))
      .catch(() => setUoms([]));
  }, []);

  useEffect(() => {
    if (!editing) return;
    setSaleId(editing.sale_id ? String(editing.sale_id) : "");
    setCustomerNum(editing.customer_num ? String(editing.customer_num) : "");
    setCustomerName(editing.customer?.customer_name ?? "");
    setReturnDate(editing.return_date?.slice?.(0, 10) ?? editing.return_date ?? returnDate);
    setRefundMethod(editing.refund_method ?? "CASH");
    const parsedReason = parseReturnReason(editing.reason);
    setReasonPreset(parsedReason.preset);
    setReasonOther(parsedReason.other);
    setNotes(editing.notes ?? "");
    setStockLocation(editing.stock_location ?? "shop");
    const nextLines = (editing.lines ?? []).map((line) =>
      recalcReturnLine({
        sale_item_id: line.sale_item_id,
        product_code: line.product_code,
        product_name: line.product_name,
        uom: line.uom,
        product: line.product ?? null,
        quantity_sold: line.quantity_sold,
        already_returned: line.already_returned,
        max_return_qty: line.max_return_qty,
        return_qty: line.return_qty,
        unit_price: line.unit_price,
        line_total: line.line_total ?? line.amount,
        amount: line.amount,
        line_no: line.line_no,
        on_wholesale_retail: line.on_wholesale_retail,
        display_uom_mode: line.display_uom_mode ?? "centrix",
      }),
    );
    setLines(nextLines);
    const nextCounts = {};
    for (const line of nextLines) {
      const uom = resolveCustomerReturnLineUom(line, uomById);
      Object.assign(nextCounts, initReturnLineCounts(line, uom, line.return_qty));
    }
    setReturnCounts(nextCounts);
    setReturnAll(isFullOrderReturn(nextLines));
    if (editing.sale) {
      setInvoiceQuery(formatReceiptNumber(editing.sale));
    }
  }, [editing, uomById]);

  useEffect(() => {
    const q = invoiceQuery.trim();
    if (q.length < 2) {
      setSaleOptions([]);
      return;
    }
    const timer = setTimeout(() => {
      const orderNum = parseInvoiceNumber(q);
      const searchQ = orderNum != null ? String(orderNum) : q;
      apiRequest("/sales", {
        searchParams: { q: searchQ, per_page: 15, "filter[status]": "completed" },
      })
        .then((res) => setSaleOptions(res.data ?? []))
        .catch(() => setSaleOptions([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [invoiceQuery]);

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
        emptyReturnLineFromSaleItem(item),
      );
      setLines(nextLines);
      const nextCounts = {};
      for (const line of nextLines) {
        const uom = resolveCustomerReturnLineUom(line, uomById);
        Object.assign(nextCounts, initReturnLineCounts(line, uom));
      }
      setReturnCounts(nextCounts);
      setReturnAll(false);
      setInvoiceHint(`Loaded ${nextLines.length} item(s) from invoice.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load invoice");
      setLines([]);
    } finally {
      setLoadingSale(false);
    }
  }, [uomById]);

  useEffect(() => {
    if (editing || !initialSaleId) return;
    loadSale(initialSaleId);
  }, [editing, initialSaleId, loadSale]);

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
      const searchQ = orderNum != null ? String(orderNum) : q;
      const res = await apiRequest("/sales", {
        searchParams: { q: searchQ, per_page: 15, "filter[status]": "completed" },
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
  }, [invoiceQuery, saleOptions, loadSale]);

  function updateLine(index, returnQty) {
    setReturnAll(false);
    setLines((prev) =>
      prev.map((line, i) => (i === index ? recalcReturnLine({ ...line, return_qty: returnQty }) : line)),
    );
  }

  function updateLineFromCounts(index, key, value) {
    setReturnAll(false);
    setReturnCounts((prev) => {
      const nextCounts = { ...prev, [key]: value };
      setLines((prevLines) =>
        prevLines.map((line, i) =>
          i === index ? recalcReturnLineFromCounts(line, nextCounts, uomById) : line,
        ),
      );
      return nextCounts;
    });
  }

  function removeLine(index) {
    setReturnAll(false);
    setLines((prev) => {
      const line = prev[index];
      if (line) {
        const lineId = returnLineCountId(line);
        setReturnCounts((counts) => {
          const next = { ...counts };
          for (const key of Object.keys(next)) {
            if (key.startsWith(`${lineId}:`)) delete next[key];
          }
          return next;
        });
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  function handleReturnAllToggle(checked) {
    setReturnAll(checked);
    if (!lines.length) return;

    if (checked) {
      const nextLines = applyReturnAllLines(lines, uomById);
      setLines(nextLines);
      setReturnCounts(buildReturnCountsForLines(nextLines, uomById));
      return;
    }

    const cleared = clearReturnAllLines(lines);
    setLines(cleared);
    const nextCounts = {};
    for (const line of cleared) {
      const uom = resolveCustomerReturnLineUom(line, uomById);
      Object.assign(nextCounts, initReturnLineCounts(line, uom, 0));
    }
    setReturnCounts(nextCounts);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!user?.branch_id) {
      setError("Your user profile has no branch assigned.");
      return;
    }
    const payloadLines = lines.filter((l) => Number(l.return_qty) > 0);
    if (!payloadLines.length) {
      setError("Set a return quantity for at least one product.");
      return;
    }
    if (!isReturnReasonValid(reasonPreset, reasonOther)) {
      setError("Reason for return is required.");
      return;
    }
    const resolvedReason = resolveReturnReason(reasonPreset, reasonOther);

    setSaving(true);
    setError(null);
    try {
      const body = {
        sale_id: saleId ? Number(saleId) : null,
        customer_num: customerNum ? Number(customerNum) : null,
        branch_id: user.branch_id,
        return_date: returnDate,
        refund_method: refundMethod,
        reason: resolvedReason,
        notes: notes.trim() || null,
        stock_location: stockLocation,
        lines: payloadLines.map((line) => ({
          sale_item_id: line.sale_item_id,
          product_code: line.product_code,
          product_name: line.product_name,
          uom: line.uom ?? null,
          quantity_sold: line.quantity_sold,
          return_qty: line.return_qty,
          unit_price: line.unit_price,
          amount: line.amount,
          line_no: line.line_no,
        })),
      };

      if (editing?.id) {
        if (proofFile) {
          await apiRequestMultipart(`/customer-returns/${editing.id}`, { ...body, proof: proofFile }, { method: "PUT" });
        } else {
          await apiRequest(`/customer-returns/${editing.id}`, { method: "PUT", body });
        }
      } else if (proofFile) {
        await apiRequestMultipart("/customer-returns", { ...body, proof: proofFile });
      } else {
        await apiRequest("/customer-returns", { method: "POST", body });
      }
      if (onSaved) {
        await onSaved();
      } else {
        router.push("/sales/returns");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save return");
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
          <Link href={backHref} className="text-sm text-[var(--theme-primary)] hover:underline">
            {backLabel}
          </Link>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">
            {editing ? `Edit ${editing.return_no}` : "Create new return"}
          </h2>
          <p className="text-sm text-slate-500">Enter an invoice number to load line items.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Invoice number">
          <div className="flex gap-2">
            <input
              className={inputClassName()}
              value={invoiceQuery}
              onChange={(e) => setInvoiceQuery(e.target.value)}
              onBlur={() => resolveAndLoadInvoice()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  resolveAndLoadInvoice();
                }
              }}
              placeholder="S0001 or INV-1005"
              list="return-sale-options"
            />
            <button
              type="button"
              onClick={() => resolveAndLoadInvoice()}
              disabled={loadingSale || !invoiceQuery.trim()}
              className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Load
            </button>
          </div>
          <datalist id="return-sale-options">
            {saleOptions.map((sale) => (
              <option
                key={sale.id}
                value={formatReceiptNumber(sale)}
                label={`${formatReceiptNumber(sale)} · ${formatSaleKes(sale.order_total)}`}
              />
            ))}
          </datalist>
          {invoiceHint ? <p className="mt-1 text-xs text-emerald-700">{invoiceHint}</p> : null}
          <div className="mt-1 flex flex-wrap gap-2">
            {saleOptions.slice(0, 5).map((sale) => (
              <button
                key={sale.id}
                type="button"
                onClick={() => loadSale(sale.id)}
                className="text-xs font-medium text-[var(--theme-primary)] hover:underline"
              >
                {formatReceiptNumber(sale)}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Customer">
          <input
            className={inputClassName()}
            value={customerName || (customerNum ? `Customer #${customerNum}` : "")}
            readOnly
            placeholder="Loads when invoice is found"
          />
        </Field>
        <Field label="Return date">
          <input
            type="date"
            className={inputClassName()}
            value={returnDate}
            onChange={(e) => setReturnDate(e.target.value)}
            required
          />
        </Field>
        <Field label="Refund method">
          <select
            className={inputClassName()}
            value={refundMethod}
            onChange={(e) => setRefundMethod(e.target.value)}
          >
            {REFUND_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <ReturnReasonFields
          preset={reasonPreset}
          otherText={reasonOther}
          onPresetChange={setReasonPreset}
          onOtherTextChange={setReasonOther}
        />
        <Field label="Restock location">
          <select
            className={inputClassName()}
            value={stockLocation}
            onChange={(e) => setStockLocation(e.target.value)}
          >
            <option value="shop">Shop floor</option>
            <option value="store">Store / warehouse</option>
          </select>
        </Field>
      </div>

      {lines.length > 0 ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
            <input
              type="checkbox"
              checked={returnAll}
              onChange={(e) => handleReturnAllToggle(e.target.checked)}
              disabled={loadingSale || !lines.some((line) => Number(line.max_return_qty) > 0)}
              className="h-4 w-4 rounded border-slate-300 text-[var(--theme-primary)] focus:ring-[var(--theme-primary)]"
            />
            Return all
          </label>
          <p className="text-xs text-slate-500">
            {returnAll
              ? "All returnable quantities are filled. Uncheck to enter partial returns."
              : "Check to return the full remaining order without entering each quantity."}
          </p>
        </div>
      ) : null}

      <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2.5">Product</th>
              <th className="px-3 py-2.5 text-right">Qty sold</th>
              <th className="px-3 py-2.5 text-right">Already returned</th>
              <th className="px-3 py-2.5 text-right">Return qty</th>
              <th className="px-3 py-2.5 text-right">Unit price</th>
              <th className="px-3 py-2.5 text-right">Amount</th>
              <th className="w-10 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {loadingSale ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  Loading invoice lines…
                </td>
              </tr>
            ) : lines.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  Enter an invoice number and press Enter or Load to fetch products.
                </td>
              </tr>
            ) : (
              lines.map((line, index) => (
                <tr key={`${line.product_code}-${index}`} className="border-t border-slate-100">
                  <td className="px-3 py-3">
                    <p className="font-medium text-slate-900">{line.product_name}</p>
                    <p className="font-mono text-xs text-slate-400">{line.product_code}</p>
                    <p className="text-xs text-slate-500">
                      Unit: {customerReturnLineUnitLabel(line, uomById)}
                    </p>
                    {Number(line.max_return_qty) <= 0 ? (
                      <p className="mt-1 text-xs text-amber-700">Fully returned</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-right text-slate-600">
                    {customerReturnLineQtyLabel(line, uomById, "quantity_sold")}
                  </td>
                  <td className="px-3 py-3 text-right text-slate-500">
                    {customerReturnLineQtyLabel(line, uomById, "already_returned")}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <CustomerReturnQtyInputs
                      line={line}
                      uomById={uomById}
                      counts={returnCounts}
                      onCountsChange={(key, value) => updateLineFromCounts(index, key, value)}
                      onSimpleQtyChange={(value) => updateLine(index, value)}
                      disabled={Number(line.max_return_qty) <= 0 || returnAll}
                    />
                    {Number(line.return_qty) > 0 ? (
                      <p className="mt-1 text-xs text-slate-500">
                        {customerReturnLineQtyLabel(line, uomById, "return_qty")}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-right text-slate-600">{formatSaleKes(line.unit_price)}</td>
                  <td className="px-3 py-3 text-right font-medium text-slate-900">
                    {formatSaleKes(line.amount)}
                  </td>
                  <td className="px-2 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <ReturnProofField
          file={proofFile}
          onChange={setProofFile}
          existingProof={editing?.proof ?? null}
          disabled={saving || loadingSale}
        />
      </div>

      <div className="mt-4">
        <Field label="Notes">
          <textarea
            className={inputClassName()}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes for this return"
          />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-violet-50 px-4 py-3">
        <span className="text-sm font-medium text-violet-900">Total refund</span>
        <span className="text-xl font-semibold text-violet-900">{formatSaleKes(totalRefund)}</span>
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <PrimaryButton type="submit" showIcon={false} disabled={saving || loadingSale}>
          {saving ? "Saving…" : editing ? "Update return" : "Submit return"}
        </PrimaryButton>
      </div>
    </form>
  );
}
