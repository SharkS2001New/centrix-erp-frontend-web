"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { CatalogPageShell, formatShortDate } from "@/components/catalog/catalog-shared";
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";
import { formatAccountingAmount } from "@/lib/accounting-shared";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";

function confidenceBadge(confidence) {
  if (confidence === "high") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (confidence === "medium") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export function MpesaReconciliationScreen() {
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [details, setDetails] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/accounting/mpesa-reconciliation");
      setData(res);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load M-Pesa reconciliation");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const payments = data?.payments ?? [];
  const hint = data?.settings?.payment_account_hint;

  const totalUnmatched = useMemo(
    () => payments.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
    [payments],
  );

  const loadDetails = useCallback(async (paymentId) => {
    if (details[paymentId]) return;
    try {
      const res = await apiRequest(`/accounting/mpesa-reconciliation/${paymentId}`);
      setDetails((current) => ({ ...current, [paymentId]: res }));
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load payment suggestions");
    }
  }, [details]);

  const toggleExpanded = async (paymentId) => {
    if (expandedId === paymentId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(paymentId);
    await loadDetails(paymentId);
  };

  const applyPayment = async (paymentId, saleId) => {
    setBusyId(paymentId);
    try {
      await apiRequest(`/accounting/mpesa-reconciliation/${paymentId}/apply`, {
        method: "POST",
        body: { sale_id: saleId },
      });
      notifySuccess("Payment applied to order");
      setExpandedId(null);
      setDetails((current) => {
        const next = { ...current };
        delete next[paymentId];
        return next;
      });
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to apply payment");
    } finally {
      setBusyId(null);
    }
  };

  const ignorePayment = async (payment) => {
    const ok = await confirm({
      title: "Ignore payment?",
      description: `Hide ${payment.transaction_id} from the unmatched queue. It will remain in records.`,
      confirmLabel: "Ignore",
    });
    if (!ok) return;

    setBusyId(payment.id);
    try {
      await apiRequest(`/accounting/mpesa-reconciliation/${payment.id}/ignore`, {
        method: "POST",
        body: {},
      });
      notifySuccess("Payment ignored");
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to ignore payment");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <CatalogPageShell
      title="M-Pesa reconciliation"
      description="Match paybill and till payments to sales orders. Customers should use their order number as the account reference."
      breadcrumb={
        <AppBreadcrumb
          items={[
            { label: "Accounting", href: "/accounting" },
            { label: "M-Pesa reconciliation" },
          ]}
        />
      }
    >
      <div className="mb-6 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <p>
          Account reference hint for customers: <strong>{hint || "Enter your order number (e.g. S12)"}</strong>
        </p>
        <p className="mt-1 text-xs text-sky-800">
          Enable or change this under Admin → Settings → Finance → M-Pesa payments.
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Unmatched payments</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{payments.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total amount</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{formatAccountingAmount(totalUnmatched)}</p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading unmatched payments…</p>
      ) : payments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
          No unmatched M-Pesa payments right now.
        </div>
      ) : (
        <div className="space-y-3">
          {payments.map((payment) => {
            const expanded = expandedId === payment.id;
            const detail = details[payment.id];
            const candidates = detail?.candidates ?? [];

            return (
              <div key={payment.id} className="rounded-xl border border-slate-200 bg-white">
                <div className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">{payment.transaction_id}</p>
                      {payment.match_confidence ? (
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${confidenceBadge(payment.match_confidence)}`}>
                          {payment.match_confidence} match
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatAccountingAmount(payment.amount)} · {payment.phone_number}
                      {payment.payer_name ? ` · ${payment.payer_name}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Received {formatShortDate(payment.received_at)}
                      {payment.bill_ref_number ? ` · Ref: ${payment.bill_ref_number}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      onClick={() => void toggleExpanded(payment.id)}
                    >
                      {expanded ? "Hide matches" : "Review matches"}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      disabled={busyId === payment.id}
                      onClick={() => void ignorePayment(payment)}
                    >
                      Ignore
                    </button>
                  </div>
                </div>

                {expanded ? (
                  <div className="border-t border-slate-100 px-4 py-4">
                    {!detail ? (
                      <p className="text-sm text-slate-500">Loading suggested orders…</p>
                    ) : candidates.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        No suggested orders. Search sales orders manually and apply from the order screen, or ignore this payment.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {candidates.map((candidate) => (
                          <div
                            key={candidate.sale_id}
                            className="flex flex-col gap-3 rounded-lg border border-slate-200 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Link
                                  href={`/sales/orders/${candidate.sale_id}`}
                                  className="font-medium text-sky-700 hover:underline"
                                >
                                  Order #{candidate.order_num}
                                </Link>
                                <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${confidenceBadge(candidate.confidence)}`}>
                                  {candidate.method.replaceAll("_", " ")}
                                </span>
                              </div>
                              <p className="mt-1 text-sm text-slate-600">
                                Balance {formatAccountingAmount(candidate.balance_due)} of {formatAccountingAmount(candidate.order_total)}
                                {candidate.customer_name ? ` · ${candidate.customer_name}` : ""}
                              </p>
                            </div>
                            <button
                              type="button"
                              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                              disabled={busyId === payment.id}
                              onClick={() => void applyPayment(payment.id, candidate.sale_id)}
                            >
                              Apply payment
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </CatalogPageShell>
  );
}
