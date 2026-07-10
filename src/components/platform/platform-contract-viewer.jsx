"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetchBlob, apiRequest, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  contractKindLabel,
  contractStatusLabel,
  formatBillingDate,
  formatBillingMoney,
  resolveAgreementPrices,
} from "@/lib/platform-billing";
import {
  buildPlatformContractHtml,
  downloadPlatformContractHtml,
  printPlatformContract,
} from "@/lib/platform-contract-print";
import { PrimaryButton } from "@/components/catalog/catalog-shared";

/**
 * In-app contract/quote viewer: expand preview, print, download, email.
 * Prefers API PDF when available; falls back to generated HTML document.
 */
export function PlatformContractViewer({
  contract,
  open,
  onClose,
  expanded = false,
  allowEmail = true,
}) {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [useHtml, setUseHtml] = useState(false);
  const [emailing, setEmailing] = useState(false);

  const htmlDoc = useMemo(
    () => (contract ? buildPlatformContractHtml(contract) : ""),
    [contract],
  );

  const prices = useMemo(
    () => (contract ? resolveAgreementPrices(contract) : null),
    [contract],
  );

  useEffect(() => {
    if (!open || !contract?.id) {
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setUseHtml(false);
      return;
    }

    let cancelled = false;
    setPdfLoading(true);
    setUseHtml(false);

    (async () => {
      try {
        const blob = await apiFetchBlob(`/admin/platform-contracts/${contract.id}/pdf`);
        if (cancelled) return;
        if (blob instanceof Blob && blob.type?.includes("pdf") && blob.size > 0) {
          const url = URL.createObjectURL(blob);
          setPdfUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
        } else {
          setUseHtml(true);
        }
      } catch {
        if (!cancelled) setUseHtml(true);
      } finally {
        if (!cancelled) setPdfLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, contract?.id]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  if (!open || !contract) return null;

  async function handleDownloadPdf() {
    if (pdfUrl) {
      const a = document.createElement("a");
      a.href = pdfUrl;
      a.download = `${contract.reference || contract.id || "contract"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      notifySuccess("Download started.");
      return;
    }
    try {
      const blob = await apiFetchBlob(`/admin/platform-contracts/${contract.id}/pdf`);
      if (blob instanceof Blob && blob.size > 0 && blob.type?.includes("pdf")) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${contract.reference || contract.id || "contract"}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        notifySuccess("Download started.");
        return;
      }
    } catch (e) {
      if (!(e instanceof ApiError)) {
        /* ignore */
      }
    }
    downloadPlatformContractHtml(contract);
    notifySuccess("Downloaded printable contract document.");
  }

  async function handleSendEmail() {
    if (!contract.id) {
      notifyError("Save the contract before sending email.");
      return;
    }
    const to =
      contract.customer_email ||
      contract.organization?.org_email ||
      contract.organization?.email;
    if (!to) {
      notifyError("No recipient email on this contract.");
      return;
    }
    setEmailing(true);
    try {
      const res = await apiRequest(`/admin/platform-contracts/${contract.id}/email`, {
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

  const panelClass = expanded
    ? "theme-modal flex h-[min(92vh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border shadow-2xl"
    : "theme-modal flex h-[min(88vh,820px)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border shadow-2xl";

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/50 p-4">
      <div className={panelClass} role="dialog" aria-modal="true" aria-labelledby="contract-viewer-title">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <h2 id="contract-viewer-title" className="theme-heading text-base font-semibold">
              {contract.title || contractKindLabel(contract.kind)}
            </h2>
            <p className="theme-subtext mt-1 text-xs">
              {contractKindLabel(contract.kind)} · {contractStatusLabel(contract.status)} · First{" "}
              {formatBillingMoney(prices?.first_payment_price, prices?.currency)} · Renewal{" "}
              {formatBillingMoney(prices?.renewal_price, prices?.currency)} ·{" "}
              {formatBillingDate(contract.start_date || contract.created_at)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
              onClick={() => printPlatformContract(contract)}
            >
              Print
            </button>
            {allowEmail ? (
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
                disabled={emailing || !contract.id}
                onClick={() => void handleSendEmail()}
              >
                {emailing ? "Sending…" : "Send email"}
              </button>
            ) : null}
            <PrimaryButton type="button" showIcon={false} onClick={() => void handleDownloadPdf()}>
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
          {pdfLoading ? (
            <p className="p-8 text-center text-sm text-slate-500">Loading document…</p>
          ) : pdfUrl && !useHtml ? (
            <iframe title="Contract PDF" src={pdfUrl} className="h-full w-full border-0" />
          ) : (
            <iframe title="Contract document" srcDoc={htmlDoc} className="h-full w-full border-0 bg-white" />
          )}
        </div>
      </div>
    </div>
  );
}
