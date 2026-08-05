"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  buildKraFiscalBlockHtml,
  extractKraReceiptData,
  kraReceiptQrDataUrl,
} from "@/lib/kra-receipt-qr";
import { formatReportKes } from "@/lib/reports/format";
import { salesChannelLabel } from "@/lib/user-facing-labels";

/**
 * Popup preview of the KRA fiscal invoice block only (CU / SCU / QR / signature).
 */
export function KraInvoicePreviewDialog({ open, row, onClose }) {
  const [qrDataUrl, setQrDataUrl] = useState(null);

  const kra = useMemo(() => {
    if (!row) return null;
    return extractKraReceiptData(null, {
      invoice_number: row.invoice_number,
      signature_link: row.signature_link,
      receipt_signature: row.receipt_signature,
      serial_number: row.serial_number,
      kra_timestamp: row.kra_timestamp,
      status: row.status,
      response_payload: row.response_payload,
    });
  }, [row]);

  useEffect(() => {
    if (!open || !kra?.signatureLink) {
      setQrDataUrl(null);
      return undefined;
    }
    let cancelled = false;
    kraReceiptQrDataUrl(kra.signatureLink, { size: 160 }).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [open, kra?.signatureLink]);

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

  const fiscalHtml = buildKraFiscalBlockHtml(kra, {
    layout: "document",
    qrDataUrl,
    title: "KRA FISCAL INVOICE",
  });

  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kra-invoice-preview-title"
      onClick={() => onClose?.()}
    >
      <div
        className="theme-modal max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="kra-invoice-preview-title" className="theme-heading text-base font-semibold">
              KRA invoice preview
            </h2>
            <p className="theme-subtext mt-1 text-sm">
              Order #{row.order_no ?? row.sale_order_num ?? row.sale_id ?? "—"}
              {row.receipt_date ? ` · ${row.receipt_date}` : null}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onClose?.()}
            className="theme-secondary-btn rounded-lg px-3 py-1.5 text-sm font-medium"
          >
            Close
          </button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">CU number</dt>
            <dd className="font-mono text-xs text-slate-900">{row.invoice_number || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">SCU / serial</dt>
            <dd className="font-mono text-xs text-slate-900">{row.serial_number || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Status</dt>
            <dd className="capitalize text-slate-900">{row.status || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Order total</dt>
            <dd className="text-slate-900">{formatReportKes(row.order_total)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Branch</dt>
            <dd className="text-slate-900">{row.branch_name || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Channel</dt>
            <dd className="text-slate-900">{salesChannelLabel(row.channel) || row.channel || "—"}</dd>
          </div>
        </dl>

        <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          {fiscalHtml ? (
            <div dangerouslySetInnerHTML={{ __html: fiscalHtml }} />
          ) : (
            <p className="text-center text-sm text-slate-500">
              No KRA fiscal details are available for this receipt
              {row.error_message ? `: ${row.error_message}` : "."}
            </p>
          )}
        </div>

        {row.signature_link ? (
          <p className="mt-3 text-center text-xs">
            <a
              href={row.signature_link}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-[#185FA5] hover:underline"
            >
              Open KRA verification link
            </a>
          </p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
