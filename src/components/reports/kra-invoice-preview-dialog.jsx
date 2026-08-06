"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiRequest } from "@/lib/api";
import {
  buildKraFiscalReceiptHtml,
  enrichKraReportRow,
  formatKraReceiptPreviewSummary,
  kraDocumentTypeLabel,
  kraReportRowId,
  normalizeKraResponseRow,
  printKraFiscalReceipts,
} from "@/lib/kra-fiscal-receipt-print";
import { kraReceiptQrDataUrl } from "@/lib/kra-receipt-qr";
import { formatReportKes } from "@/lib/reports/format";
import { notifyError, notifySuccess } from "@/lib/notify";
import { salesChannelLabel } from "@/lib/user-facing-labels";
import { useAuth } from "@/contexts/auth-context";

function payloadNeedsFetch(row) {
  if (!row) return false;
  const request = row.request_payload;
  const response = row.response_payload;
  const requestMissing =
    request == null ||
    (typeof request === "object" && !Array.isArray(request) && Object.keys(request).length === 0);
  const responseMissing =
    response == null ||
    (typeof response === "object" && !Array.isArray(response) && Object.keys(response).length === 0);
  return requestMissing && responseMissing;
}

/**
 * KRA response detail — invoice preview by default.
 * Device payload tabs are for Admin KRA device log only (`showDevicePayload`).
 */
export function KraResponseDetailDialog({
  open,
  row,
  onClose,
  apiBasePath = "/kra-responses",
  showDevicePayload = false,
}) {
  const { organization } = useAuth();
  const [detailRow, setDetailRow] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [viewMode, setViewMode] = useState("preview");
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!open) {
      setDetailRow(null);
      setViewMode("preview");
      return undefined;
    }

    setViewMode("preview");
    const normalized = normalizeKraResponseRow(row);
    setDetailRow(normalized);

    const responseId = kraReportRowId(normalized);
    if (!responseId || !payloadNeedsFetch(normalized)) {
      return undefined;
    }

    let cancelled = false;
    setDetailLoading(true);
    void apiRequest(`${apiBasePath}/${responseId}`, { loading: false, reportIssues: false })
      .then((loaded) => {
        if (cancelled) return;
        setDetailRow(normalizeKraResponseRow({ ...normalized, ...loaded }));
      })
      .catch(() => {
        if (!cancelled) setDetailRow(normalized);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, row, apiBasePath]);

  const effectiveViewMode = showDevicePayload ? viewMode : "preview";

  const activeRow = detailRow ?? normalizeKraResponseRow(row);
  const enriched = useMemo(() => enrichKraReportRow(activeRow), [activeRow]);
  const summary = useMemo(() => formatKraReceiptPreviewSummary(enriched), [enriched]);

  useEffect(() => {
    if (!open || effectiveViewMode !== "preview" || !enriched?.kra?.signatureLink) {
      setQrDataUrl(null);
      return undefined;
    }
    let cancelled = false;
    kraReceiptQrDataUrl(enriched.kra.signatureLink, { size: 160 }).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [open, effectiveViewMode, enriched?.kra?.signatureLink]);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      }
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, onClose]);

  if (!open || !row || typeof document === "undefined") return null;

  const receiptHtml = buildKraFiscalReceiptHtml(enriched, {
    qrDataUrl,
    orgName: organization?.org_name,
  });

  async function handlePrint() {
    if (!activeRow) return;
    setPrinting(true);
    try {
      await printKraFiscalReceipts([activeRow], {
        orgName: organization?.org_name,
        title: `KRA receipt ${summary?.orderLabel ?? ""}`.trim(),
      });
      notifySuccess("KRA receipt sent to printer.");
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to print KRA receipt");
    } finally {
      setPrinting(false);
    }
  }

  const responseId = kraReportRowId(activeRow);

  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kra-response-detail-title"
      onClick={() => onClose?.()}
    >
      <div
        className="theme-modal max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="kra-response-detail-title" className="theme-heading text-base font-semibold">
              {enriched?.isCreditNote ? "KRA credit note" : "KRA response"}
              {responseId != null ? ` #${responseId}` : ""}
            </h2>
            <p className="theme-subtext mt-1 text-sm">
              Order {summary?.orderLabel ?? "—"} · {kraDocumentTypeLabel(activeRow)} ·{" "}
              {activeRow?.status ?? "—"}
              {activeRow?.receipt_date ? ` · ${activeRow.receipt_date}` : null}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {effectiveViewMode === "preview" ? (
              <button
                type="button"
                disabled={printing || String(activeRow?.status ?? "").toLowerCase() !== "success"}
                onClick={() => void handlePrint()}
                className="theme-primary-btn rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                {printing ? "Printing…" : "Print"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onClose?.()}
              className="theme-secondary-btn rounded-lg px-3 py-1.5 text-sm font-medium"
            >
              Close
            </button>
          </div>
        </div>

        {showDevicePayload ? (
          <div className="mt-4 flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setViewMode("preview")}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
                effectiveViewMode === "preview"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Invoice preview
            </button>
            <button
              type="button"
              onClick={() => setViewMode("payload")}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
                effectiveViewMode === "payload"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Device payload
            </button>
          </div>
        ) : null}

        {effectiveViewMode === "preview" ? (
          <>
            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Order #</dt>
                <dd className="text-slate-900">{summary?.orderLabel ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Type</dt>
                <dd className="text-slate-900">{kraDocumentTypeLabel(activeRow)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Customer</dt>
                <dd className="text-slate-900">{enriched?.customerName || activeRow?.customer_name || "—"}</dd>
              </div>
              {enriched?.buyerPin ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Customer PIN</dt>
                  <dd className="font-mono text-xs text-slate-900">{enriched.buyerPin}</dd>
                </div>
              ) : null}
              {enriched?.servedBy ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Served by</dt>
                  <dd className="text-slate-900">{enriched.servedBy}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">CU number</dt>
                <dd className="font-mono text-xs text-slate-900">{activeRow?.invoice_number || "—"}</dd>
              </div>
              {enriched?.relevantInvoiceNumber ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Original CU</dt>
                  <dd className="font-mono text-xs text-slate-900">{enriched.relevantInvoiceNumber}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Status</dt>
                <dd className="capitalize text-slate-900">{activeRow?.status || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Order total</dt>
                <dd className="text-slate-900">{formatReportKes(activeRow?.order_total)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">VAT</dt>
                <dd className="text-slate-900">{formatReportKes(activeRow?.total_vat)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Channel</dt>
                <dd className="text-slate-900">
                  {salesChannelLabel(activeRow?.channel) || activeRow?.channel || "—"}
                </dd>
              </div>
            </dl>

            <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              {detailLoading ? (
                <p className="text-center text-sm text-slate-500">Loading receipt details…</p>
              ) : receiptHtml ? (
                <div
                  className="mx-auto max-w-[72mm] overflow-hidden"
                  dangerouslySetInnerHTML={{ __html: receiptHtml }}
                />
              ) : (
                <p className="text-center text-sm text-slate-500">
                  No KRA fiscal details are available for this receipt
                  {activeRow?.error_message ? `: ${activeRow.error_message}` : "."}
                </p>
              )}
            </div>

            {activeRow?.signature_link ? (
              <p className="mt-3 text-center text-xs">
                <a
                  href={activeRow.signature_link}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-[#185FA5] hover:underline"
                >
                  Open KRA verification link
                </a>
              </p>
            ) : null}
          </>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 text-sm">
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">Request payload</p>
              <pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">
                {detailLoading
                  ? "Loading…"
                  : JSON.stringify(enriched?.requestPayload ?? activeRow?.request_payload ?? {}, null, 2)}
              </pre>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">Response payload</p>
              <pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">
                {detailLoading
                  ? "Loading…"
                  : JSON.stringify(enriched?.responsePayload ?? activeRow?.response_payload ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** @deprecated use KraResponseDetailDialog */
export function KraInvoicePreviewDialog(props) {
  return <KraResponseDetailDialog {...props} />;
}
