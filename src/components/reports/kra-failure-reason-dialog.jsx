"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiRequest } from "@/lib/api";
import {
  kraReportRowId,
  matchKraFailureLineIndexes,
  normalizeKraResponseRow,
} from "@/lib/kra-fiscal-receipt-print";
import { formatKraReportOrderNo } from "@/lib/sales";
import { formatReportKes } from "@/lib/reports/format";
import {
  formatKraFailureReasonWithItems,
  suggestKraFailureFix,
} from "@/lib/kra-device-errors";

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
  const errorMissing = !String(row.error_message ?? row.last_kra_error ?? "").trim();
  return (requestMissing && responseMissing) || errorMissing;
}

function resolveDisplayReason(row, match = null) {
  const raw = String(row?.error_message ?? row?.last_kra_error ?? "").trim();
  if (!raw && !(match?.lines?.length > 0)) {
    return "No failure reason was recorded for this KRA submission.";
  }
  return formatKraFailureReasonWithItems(raw, {
    lines: match?.lines,
    culpritIndexes: match?.culpritIndexes,
    suspectsAll: match?.suspectsAll,
  });
}

function resolveResponseId(row) {
  return (
    kraReportRowId(row) ??
    row?.last_kra_response_id ??
    row?.kra_response_id ??
    null
  );
}

/**
 * Popup for failed KRA rows — reason, smart fix, and order lines with culprits highlighted.
 */
export function KraFailureReasonDialog({
  open,
  row,
  onClose,
  apiBasePath = "/kra-responses",
}) {
  const [detailRow, setDetailRow] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [itemsExpanded, setItemsExpanded] = useState(false);

  useEffect(() => {
    if (!open) {
      setDetailRow(null);
      setItemsExpanded(false);
      return undefined;
    }

    const normalized = normalizeKraResponseRow({
      ...row,
      error_message: row?.error_message ?? row?.last_kra_error ?? null,
      id: resolveResponseId(row),
      kra_response_id: resolveResponseId(row),
    });
    setDetailRow(normalized);

    const responseId = resolveResponseId(normalized);
    if (!responseId || !payloadNeedsFetch(normalized)) {
      return undefined;
    }

    let cancelled = false;
    setDetailLoading(true);
    void apiRequest(`${apiBasePath}/${responseId}`, { loading: false, reportIssues: false })
      .then((loaded) => {
        if (cancelled) return;
        setDetailRow(
          normalizeKraResponseRow({
            ...normalized,
            ...loaded,
            error_message:
              loaded?.error_message ?? normalized.error_message ?? row?.last_kra_error ?? null,
          }),
        );
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

  const activeRow = detailRow ?? normalizeKraResponseRow(row);
  const { lines, culpritIndexes, suspectsAll } = useMemo(
    () =>
      matchKraFailureLineIndexes(
        activeRow?.error_message ?? activeRow?.last_kra_error,
        activeRow?.request_payload,
        activeRow?.response_payload,
      ),
    [activeRow],
  );
  const reason = useMemo(
    () => resolveDisplayReason(activeRow, { lines, culpritIndexes, suspectsAll }),
    [activeRow, lines, culpritIndexes, suspectsAll],
  );
  const culpritSet = useMemo(() => new Set(culpritIndexes), [culpritIndexes]);
  const suggestion = useMemo(() => {
    const raw = activeRow?.error_message ?? activeRow?.last_kra_error ?? reason;
    const culpritNames = culpritIndexes.map((i) => lines[i]?.name).filter(Boolean);
    return suggestKraFailureFix(raw, { culpritNames });
  }, [activeRow, culpritIndexes, lines, reason]);

  if (!open || !row || typeof document === "undefined") return null;

  const orderLabel = formatKraReportOrderNo(activeRow) || activeRow?.order_no || "—";

  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kra-failure-reason-title"
      onClick={() => onClose?.()}
    >
      <div
        className="theme-modal max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="kra-failure-reason-title" className="theme-heading text-base font-semibold">
              KRA failure reason
            </h2>
            <p className="theme-subtext mt-1 text-sm">Order {orderLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => onClose?.()}
            className="theme-secondary-btn rounded-lg px-3 py-1.5 text-sm font-medium"
          >
            Close
          </button>
        </div>

        <div className="mt-4 whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-900">
          {detailLoading && !String(activeRow?.error_message ?? activeRow?.last_kra_error ?? "").trim()
            ? "Loading reason…"
            : reason}
        </div>

        {suggestion ? (
          <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-950">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">How to fix</p>
            <p className="mt-1 leading-relaxed">{suggestion}</p>
          </div>
        ) : null}

        <div className="mt-5">
          {detailLoading && lines.length === 0 ? (
            <p className="theme-subtext text-sm">Loading items…</p>
          ) : lines.length === 0 ? null : culpritIndexes.length > 0 ? (
            <>
              <h3 className="theme-heading text-sm font-semibold">Order items</h3>
              <ul className="mt-2 space-y-2">
                {lines.map((line, index) => {
                  const isCulprit = culpritSet.has(index);
                  return (
                    <li
                      key={`${line.barcode ?? line.name}-${index}`}
                      className={`rounded-lg border px-3 py-2.5 text-sm ${
                        isCulprit
                          ? "border-red-500 bg-red-50/80 shadow-[0_0_0_1px_rgba(239,68,68,0.35)]"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">{line.name}</p>
                          {line.barcode ? (
                            <p className="mt-0.5 font-mono text-xs text-slate-500">{line.barcode}</p>
                          ) : null}
                          {isCulprit ? (
                            <p className="mt-1 text-xs font-medium text-red-700">
                              {suspectsAll
                                ? "On this failed sale — upload to KRA if missing on the device"
                                : "Likely cause of this failure"}
                            </p>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right text-xs text-slate-600">
                          <p>
                            {line.qty} × {formatReportKes(line.unitPrice)}
                          </p>
                          <p className="mt-0.5 font-medium text-slate-900">
                            {formatReportKes(line.amount)}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => setItemsExpanded((openItems) => !openItems)}
                className="font-medium text-[#185FA5] hover:underline text-sm"
              >
                {itemsExpanded
                  ? "Hide items in this order"
                  : `View items in this order (${lines.length})`}
              </button>
              {itemsExpanded ? (
                <ul className="mt-2 space-y-2">
                  {lines.map((line, index) => (
                    <li
                      key={`${line.barcode ?? line.name}-${index}`}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">{line.name}</p>
                          {line.barcode ? (
                            <p className="mt-0.5 font-mono text-xs text-slate-500">{line.barcode}</p>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right text-xs text-slate-600">
                          <p>
                            {line.qty} × {formatReportKes(line.unitPrice)}
                          </p>
                          <p className="mt-0.5 font-medium text-slate-900">
                            {formatReportKes(line.amount)}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
