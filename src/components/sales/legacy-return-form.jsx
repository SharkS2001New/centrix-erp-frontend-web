"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { formatReceiptNumber, formatSaleKes } from "@/lib/sales";
import {
  REFUND_METHODS,
  RETURN_REASONS,
  customerReturnLineQtyLabel,
  recalcReturnLine,
  totalReturnAmount,
} from "@/components/sales/customer-returns-shared";
import { isKraDeviceEnabled } from "@/lib/finance-settings";

export function LegacyReturnForm({
  initialSaleId = "",
  onSaved,
  backHref = "/sales/legacy-returns",
  backLabel = "← Back to legacy returns",
}) {
  const router = useRouter();
  const { capabilities } = useAuth();
  const kraEnabled = isKraDeviceEnabled(capabilities?.module_settings, capabilities);

  const [saleId, setSaleId] = useState(initialSaleId);
  const [sale, setSale] = useState(null);
  const [kraHint, setKraHint] = useState(null);
  const [kraInvoiceNumber, setKraInvoiceNumber] = useState("");
  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10));
  const [refundMethod, setRefundMethod] = useState("CASH");
  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([]);
  const [loadingSale, setLoadingSale] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [uoms, setUoms] = useState([]);

  const uomById = useMemo(() => new Map(uoms.map((u) => [u.id, u])), [uoms]);
  const totalRefund = useMemo(() => totalReturnAmount(lines), [lines]);
  const needsManualKraInvoice = Boolean(kraHint?.requires_manual_invoice_number);

  useEffect(() => {
    apiRequest("/uoms", { searchParams: { per_page: 200 } })
      .then((res) => setUoms(res.data ?? []))
      .catch(() => setUoms([]));
  }, []);

  const loadSaleContext = useCallback(async (id) => {
    if (!id) {
      setSale(null);
      setLines([]);
      setKraHint(null);
      return;
    }

    setLoadingSale(true);
    setError(null);
    try {
      const [saleRes, linesRes] = await Promise.all([
        apiRequest(`/legacy-orders/${id}`),
        apiRequest(`/legacy-orders/${id}/return-lines`),
      ]);
      setSale(saleRes);
      setKraHint(linesRes.kra_invoice_hint ?? saleRes.kra_invoice_hint ?? null);
      const known = linesRes.kra_invoice_hint?.known_invoice_number ?? "";
      setKraInvoiceNumber(known);
      setLines(
        (linesRes.lines ?? []).map((line) =>
          recalcReturnLine({
            ...line,
            return_qty: 0,
            amount: 0,
          }),
        ),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load legacy order");
      setSale(null);
      setLines([]);
    } finally {
      setLoadingSale(false);
    }
  }, []);

  useEffect(() => {
    if (initialSaleId) {
      setSaleId(String(initialSaleId));
      loadSaleContext(String(initialSaleId));
    }
  }, [initialSaleId, loadSaleContext]);

  function updateLine(index, patch) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? recalcReturnLine({ ...line, ...patch }) : line)),
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!saleId) {
      setError("Select a legacy order first.");
      return;
    }
    if (!kraEnabled) {
      setError("KRA device must be enabled in finance settings before legacy returns.");
      return;
    }
    if (needsManualKraInvoice && !kraInvoiceNumber.trim()) {
      setError("Enter the original KRA CU invoice number for this legacy sale.");
      return;
    }

    const payloadLines = lines
      .filter((line) => Number(line.return_qty) > 0)
      .map((line) => ({
        sale_item_id: line.sale_item_id,
        product_code: line.product_code,
        product_name: line.product_name,
        uom: line.uom,
        quantity_sold: line.quantity_sold,
        return_qty: line.return_qty,
        unit_price: line.unit_price,
        amount: line.amount,
        line_no: line.line_no,
      }));

    if (!payloadLines.length) {
      setError("Add at least one line with a return quantity.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const body = {
        sale_id: Number(saleId),
        return_date: returnDate,
        refund_method: refundMethod,
        reason,
        notes: notes || null,
        auto_approve: true,
        lines: payloadLines,
      };
      if (needsManualKraInvoice || kraInvoiceNumber.trim()) {
        body.kra_original_invoice_number = kraInvoiceNumber.trim();
      }

      const created = await apiRequest("/legacy-returns", { method: "POST", body });
      onSaved?.(created);
      router.push(`/sales/legacy-returns?return_id=${created.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to create legacy return");
    } finally {
      setSaving(false);
    }
  }

  const customerName =
    sale?.customer?.customer_name ?? sale?.customer_name_override ?? "Walk-in customer";
  const legacyLabel = sale?.fulfillment_meta?.legacy_order_label ?? null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={backHref} className="text-sm text-slate-600 hover:text-slate-900">
          {backLabel}
        </Link>
        {!kraEnabled ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Enable the KRA device under Finance settings to process legacy returns.
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {sale ? (
        <div className="theme-panel rounded-lg border p-4 text-sm">
          <div className="font-semibold">{formatReceiptNumber(sale)}</div>
          {legacyLabel ? <div className="text-slate-600">Legacy ref: {legacyLabel}</div> : null}
          <div className="text-slate-600">Customer: {customerName}</div>
          <div className="text-slate-600">Order total: {formatSaleKes(sale.order_total)}</div>
        </div>
      ) : null}

      {needsManualKraInvoice ? (
        <Field label="Original KRA CU invoice number" required>
          <input
            className={inputClassName}
            value={kraInvoiceNumber}
            onChange={(e) => setKraInvoiceNumber(e.target.value)}
            placeholder="e.g. 00001234"
          />
          <p className="mt-1 text-xs text-slate-500">
            Required for Comstore credit notes when the legacy sale was not fiscalized in Centrix.
          </p>
        </Field>
      ) : kraHint?.known_invoice_number ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          Original KRA invoice: <strong>{kraHint.known_invoice_number}</strong>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Return date">
          <input
            type="date"
            className={inputClassName}
            value={returnDate}
            onChange={(e) => setReturnDate(e.target.value)}
          />
        </Field>
        <Field label="Refund method">
          <select
            className={inputClassName}
            value={refundMethod}
            onChange={(e) => setRefundMethod(e.target.value)}
          >
            {REFUND_METHODS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reason">
          <select
            className={inputClassName}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            {RETURN_REASONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Notes">
        <textarea
          className={inputClassName}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>

      {loadingSale ? (
        <p className="text-sm text-slate-500">Loading returnable lines…</p>
      ) : lines.length ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Sold</th>
                <th className="px-3 py-2">Already returned</th>
                <th className="px-3 py-2">Return qty</th>
                <th className="px-3 py-2 text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={`${line.product_code}-${index}`} className="border-t">
                  <td className="px-3 py-2">{line.product_name ?? line.product_code}</td>
                  <td className="px-3 py-2">
                    {customerReturnLineQtyLabel(line, uomById, "quantity_sold")}
                  </td>
                  <td className="px-3 py-2">
                    {customerReturnLineQtyLabel(line, uomById, "already_returned")}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      max={line.max_return_qty}
                      className={`${inputClassName} w-24`}
                      value={line.return_qty}
                      onChange={(e) => updateLine(index, { return_qty: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">{formatSaleKes(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : saleId ? (
        <p className="text-sm text-slate-500">No returnable lines on this order.</p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold">Total credit: {formatSaleKes(totalRefund)}</div>
        <PrimaryButton type="submit" disabled={saving || !kraEnabled || loadingSale}>
          {saving ? "Processing…" : "Issue legacy return & credit note"}
        </PrimaryButton>
      </div>
    </form>
  );
}
