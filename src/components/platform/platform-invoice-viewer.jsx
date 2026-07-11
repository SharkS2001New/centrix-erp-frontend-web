"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  formatBillingDate,
  formatBillingMoney,
} from "@/lib/platform-billing";
import {
  buildPlatformInvoiceHtml,
  printPlatformInvoice,
} from "@/lib/platform-invoice-print";
import { PrimaryButton } from "@/components/catalog/catalog-shared";

function downloadInvoiceHtml(invoice) {
  const html = buildPlatformInvoiceHtml(invoice);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${invoice.invoice_number || invoice.id || "invoice"}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * In-app invoice viewer (same modal pattern as contracts): print, download, optional email.
 */
export function PlatformInvoiceViewer({
  invoice,
  open,
  onClose,
  expanded = false,
  allowEmail = true,
}) {
  const [record, setRecord] = useState(invoice ?? null);
  const [loading, setLoading] = useState(false);
  const [emailing, setEmailing] = useState(false);

  useEffect(() => {
    if (!open) {
      setRecord(null);
      return;
    }
    if (!invoice) {
      setRecord(null);
      return;
    }

    const hasLines = Array.isArray(invoice.line_items) && invoice.line_items.length > 0;
    if (hasLines || !invoice.id || allowEmail === false) {
      setRecord(invoice);
      return;
    }

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await apiRequest(`/admin/platform-invoices/${invoice.id}`, { loading: false });
        if (!cancelled) setRecord(res.data ?? invoice);
      } catch {
        if (!cancelled) setRecord(invoice);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, invoice, allowEmail]);

  const htmlDoc = useMemo(
    () => (record ? buildPlatformInvoiceHtml(record) : ""),
    [record],
  );

  if (!open || !invoice) return null;

  async function handleSendEmail() {
    if (!record?.id) {
      notifyError("Save the invoice before sending email.");
      return;
    }
    const to =
      record.bill_to_email ||
      record.organization?.org_email ||
      record.organization?.email;
    if (!to) {
      notifyError("No recipient email on this invoice.");
      return;
    }
    setEmailing(true);
    try {
      const res = await apiRequest(`/admin/platform-invoices/${record.id}/email`, {
        method: "POST",
        body: { to },
      });
      notifySuccess(res.message ?? `Sent to ${to}.`);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to send email.");
    } finally {
      setEmailing(false);
    }
  }

  function handleDownload() {
    if (!record) return;
    downloadInvoiceHtml(record);
    notifySuccess("Downloaded printable invoice document.");
  }

  const panelClass = expanded
    ? "theme-modal flex h-[min(92vh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border shadow-2xl"
    : "theme-modal flex h-[min(88vh,820px)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border shadow-2xl";

  const title = record?.invoice_number || invoice.invoice_number || `Invoice #${invoice.id}`;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/50 p-4">
      <div className={panelClass} role="dialog" aria-modal="true" aria-labelledby="invoice-viewer-title">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <h2 id="invoice-viewer-title" className="theme-heading text-base font-semibold">
              {title}
            </h2>
            <p className="theme-subtext mt-1 text-xs">
              Invoice · {(record?.status || invoice.status || "draft").toString()} ·{" "}
              {formatBillingMoney(record?.total ?? invoice.total, record?.currency ?? invoice.currency)} ·{" "}
              {formatBillingDate(record?.issue_date || invoice.issue_date)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
              disabled={!record}
              onClick={() => record && printPlatformInvoice(record)}
            >
              Print
            </button>
            {allowEmail ? (
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
                disabled={emailing || !record?.id}
                onClick={() => void handleSendEmail()}
              >
                {emailing ? "Sending…" : "Send email"}
              </button>
            ) : null}
            <PrimaryButton type="button" showIcon={false} disabled={!record} onClick={handleDownload}>
              Download
            </PrimaryButton>
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-slate-100 dark:bg-slate-950">
          {loading || !record ? (
            <p className="p-8 text-center text-sm text-slate-500">Loading document…</p>
          ) : (
            <iframe title="Invoice document" srcDoc={htmlDoc} className="h-full w-full border-0 bg-white" />
          )}
        </div>
      </div>
    </div>
  );
}
