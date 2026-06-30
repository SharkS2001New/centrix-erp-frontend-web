"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useQueuedTask } from "@/lib/use-queued-task";
import { useAuth } from "@/contexts/auth-context";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { formatReceiptNumber, formatSaleKes } from "@/lib/sales";
import {
  REFUND_METHODS,
  RETURN_REASONS,
  legacyFullReturnLine,
  legacyReturnLineQtyLabel,
  totalLegacyReturnCredit,
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
  const { runQueuedTask } = useQueuedTask(
    "Please wait while the credit note is submitted to the KRA device…",
  );

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
  const [returnBlockedReason, setReturnBlockedReason] = useState(null);

  const totalCredit = useMemo(() => totalLegacyReturnCredit(lines), [lines]);
  const needsManualKraInvoice = Boolean(kraHint?.requires_manual_invoice_number);
  const returnSummary = sale?.legacy_return_summary ?? null;
  const returnBlocked =
    Boolean(returnBlockedReason) ||
    returnSummary?.can_create_return === false ||
    Boolean(returnSummary?.fully_returned) ||
    (returnSummary?.return_count_all ?? 0) > 0;

  const loadSaleContext = useCallback(async (id) => {
    if (!id) {
      setSale(null);
      setLines([]);
      setKraHint(null);
      setReturnBlockedReason(null);
      return;
    }

    setLoadingSale(true);
    setError(null);
    setReturnBlockedReason(null);
    try {
      const [saleRes, linesRes] = await Promise.all([
        apiRequest(`/legacy-orders/${id}`),
        apiRequest(`/legacy-orders/${id}/return-lines`),
      ]);
      setSale({
        ...saleRes,
        legacy_return_summary: linesRes.legacy_return_summary ?? saleRes.legacy_return_summary,
      });
      setKraHint(linesRes.kra_invoice_hint ?? saleRes.kra_invoice_hint ?? null);
      setReturnBlockedReason(linesRes.return_blocked_reason ?? null);
      const known = linesRes.kra_invoice_hint?.known_invoice_number ?? "";
      setKraInvoiceNumber(known);
      setLines((linesRes.lines ?? []).map((line) => legacyFullReturnLine(line)));
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

  async function handleSubmit(event) {
    event.preventDefault();
    if (!saleId) {
      setError("Select a legacy order first.");
      return;
    }
    if (returnBlocked) {
      setError(returnBlockedReason ?? "A legacy return has already been completed for this order.");
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
        uom: line.uom ?? line.sold_uom ?? null,
        quantity_sold: line.quantity_sold,
        return_qty: line.return_qty,
        unit_price: line.unit_price,
        amount: line.amount ?? line.line_total ?? 0,
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

      const created = await runQueuedTask(
        () => apiRequest("/legacy-returns", { method: "POST", body }),
        { message: "Please wait while the credit note is submitted to the KRA device…" },
      );
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

      {returnBlocked ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
          <p className="font-medium">Legacy return already completed</p>
          <p className="mt-1">
            {returnBlockedReason ??
              (returnSummary?.legacy_return_no
                ? `Return ${returnSummary.legacy_return_no} is already on file for this order.`
                : "This order already has a legacy return. A second return is not allowed.")}
          </p>
          {returnSummary?.legacy_return_id ? (
            <Link
              href={`/sales/legacy-returns?return_id=${returnSummary.legacy_return_id}`}
              className="mt-2 inline-block font-medium text-emerald-800 underline"
            >
              View legacy return
            </Link>
          ) : (
            <Link
              href="/sales/legacy-returns"
              className="mt-2 inline-block font-medium text-emerald-800 underline"
            >
              Open legacy returns
            </Link>
          )}
        </div>
      ) : null}

      {sale ? (
        <div className="theme-panel rounded-lg border p-4 text-sm">
          <div className="font-semibold">{formatReceiptNumber(sale)}</div>
          {legacyLabel ? <div className="text-slate-600">Legacy ref: {legacyLabel}</div> : null}
          <div className="text-slate-600">Customer: {customerName}</div>
          <div className="text-slate-600">Order total: {formatSaleKes(sale.order_total)}</div>
          {lines.length ? (
            <div className="mt-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-violet-900">
              Full legacy return — quantities and credits match the original order.
            </div>
          ) : null}
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
              <option key={method.value} value={method.value}>
                {method.label}
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
                <th className="px-3 py-2 text-right">Original line total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={`${line.product_code}-${index}`} className="border-t">
                  <td className="px-3 py-2">
                    <p className="font-medium">{line.product_name ?? line.product_code}</p>
                    <p className="text-xs text-slate-500">Full return only</p>
                  </td>
                  <td className="px-3 py-2">{legacyReturnLineQtyLabel(line, "quantity_sold")}</td>
                  <td className="px-3 py-2">{legacyReturnLineQtyLabel(line, "already_returned")}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-900">
                      {legacyReturnLineQtyLabel(line, "return_qty")}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {formatSaleKes(line.line_total ?? line.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : saleId ? (
        <p className="text-sm text-slate-500">No returnable lines on this order.</p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-violet-50 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-violet-900">
            Total credit: {formatSaleKes(totalCredit)}
          </div>
          {sale?.order_total != null ? (
            <div className="text-xs text-violet-800">
              Original order total: {formatSaleKes(sale.order_total)}
            </div>
          ) : null}
        </div>
        <PrimaryButton type="submit" disabled={saving || !kraEnabled || loadingSale || returnBlocked}>
          {saving ? "Processing…" : "Issue legacy return & credit note"}
        </PrimaryButton>
      </div>
    </form>
  );
}
