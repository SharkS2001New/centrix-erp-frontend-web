"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { PosPaymentPanel } from "@/components/sales/pos-payment-panel";
import { getCheckoutPaymentConfig, isTillFloatWorkflowEnabled } from "@/lib/sales-settings";
import { getOrderWorkflow } from "@/lib/order-workflow";
import { isStkPushEnabled } from "@/lib/finance-settings";
import { isPosMpesaPaymentsEnabled } from "@/lib/platform-org-features";
import { filterPaymentMethodsForOrg } from "@/lib/org-payment-methods";
import {
  collectPaymentSplitsFromCheckoutBody,
  resolveCollectPaymentMethods,
  saleCollectableBalance,
} from "@/lib/collect-sale-payment";
import { useAuth } from "@/contexts/auth-context";
import { usePosSession } from "@/contexts/pos-session-context";

/**
 * POS checkout payment UI for an existing sale (orders list / order summary).
 * Records payment via the sale payments API instead of cart checkout.
 */
export function SalePosPaymentPanel({
  open,
  onClose,
  sale,
  balanceDue,
  capabilities,
  floatSessionId = null,
  onPaid,
  embedded = true,
}) {
  const { user } = useAuth();
  const { floatSessionId: contextFloatSessionId, refreshActiveSession } = usePosSession();
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [methodsError, setMethodsError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const tillFloatEnabled = isTillFloatWorkflowEnabled(capabilities?.module_settings);

  const workflow = useMemo(() => getOrderWorkflow(capabilities, sale), [capabilities, sale]);
  const channel = sale?.channel ?? "backend";
  const paymentConfig = useMemo(() => {
    const base = getCheckoutPaymentConfig(capabilities?.module_settings, {
      checkoutContext: "order_payment",
      capabilities,
    });
    const withMpesa = !isPosMpesaPaymentsEnabled(capabilities)
      ? { ...base, enableMpesaAmount: false, enableMpesaCode: false }
      : base;
    const paymentStatus = String(sale?.payment_status ?? "").toLowerCase();
    const hasOutstanding =
      Number(balanceDue ?? 0) > 0.01 ||
      Number(sale?.amount_paid ?? 0) > 0.01 ||
      Boolean(sale?.is_credit_sale) ||
      paymentStatus === "unpaid" ||
      paymentStatus === "partial" ||
      paymentStatus === "pending_payment";
    // Collect payment on unpaid / partially paid orders — installments when org allows.
    return {
      ...withMpesa,
      checkoutContext: "order_payment",
      allowPartialPayment: Boolean(withMpesa.allowPartialPayment && hasOutstanding),
    };
  }, [
    capabilities,
    sale?.is_credit_sale,
    sale?.amount_paid,
    sale?.payment_status,
    balanceDue,
  ]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setMethodsError(null);
    apiRequest("/payment-methods", { searchParams: { per_page: 200, "filter[is_active]": 1 } })
      .then((res) => {
        // Settings → Sales → Recording payments for this organization.
        const methods = filterPaymentMethodsForOrg(
          res.data ?? [],
          capabilities?.module_settings,
          { capabilities, checkoutContext: "order_payment" },
        );
        setPaymentMethods(methods);
        if (!methods.length) {
          setMethodsError(
            "No payment methods enabled. Turn them on under Settings → Sales → Recording payments.",
          );
        }
      })
      .catch((e) => {
        setPaymentMethods([]);
        setMethodsError(e instanceof ApiError ? e.message : "Could not load payment methods.");
      });
  }, [open, capabilities]);

  // Shop Debtors / All Orders: ensure we have the cashier's open till before Collect payment.
  useEffect(() => {
    if (!open || !tillFloatEnabled) return;
    if (floatSessionId || contextFloatSessionId) return;
    void refreshActiveSession?.();
  }, [open, tillFloatEnabled, floatSessionId, contextFloatSessionId, refreshActiveSession]);

  const resolveFloatSessionId = useCallback(async () => {
    const fromProp = floatSessionId != null && Number(floatSessionId) > 0 ? Number(floatSessionId) : null;
    if (fromProp) return fromProp;
    const fromCtx =
      contextFloatSessionId != null && Number(contextFloatSessionId) > 0
        ? Number(contextFloatSessionId)
        : null;
    if (fromCtx) return fromCtx;
    if (!tillFloatEnabled || !user?.id) return null;
    try {
      const refreshed = await refreshActiveSession?.();
      if (refreshed?.id) return Number(refreshed.id);
      const res = await apiRequest("/till-float-sessions", {
        searchParams: {
          per_page: 10,
          "filter[status]": "open",
          "filter[cashier_id]": user.id,
        },
        loading: false,
        reportIssues: false,
      });
      const openSession =
        (res.data ?? []).find((row) => String(row.status).toLowerCase() === "open") ?? null;
      return openSession?.id != null ? Number(openSession.id) : null;
    } catch {
      return null;
    }
  }, [floatSessionId, contextFloatSessionId, tillFloatEnabled, user?.id, refreshActiveSession]);

  const handleComplete = useCallback(
    async (body) => {
      if (!sale?.id) return null;
      setSaving(true);
      setError(null);
      try {
        if (!paymentMethods.length) {
          throw new ApiError(
            methodsError ||
              "No payment methods available. Enable them under Settings → Sales → Recording payments.",
            422,
          );
        }

        const due = saleCollectableBalance(sale, balanceDue);
        const { splits } = collectPaymentSplitsFromCheckoutBody(body, due);
        // Resolve every method first — posting cash then failing M-Pesa left the order paid.
        const resolved = resolveCollectPaymentMethods(splits, paymentMethods);
        const sessionId = await resolveFloatSessionId();

        const updated = await apiRequest(`/sales/${sale.id}/payments`, {
          method: "POST",
          body: {
            ...(sessionId ? { float_session_id: sessionId } : {}),
            payments: resolved.map((row) => ({
              payment_method_id: row.payment_method_id,
              amount: row.amount,
              reference_number: row.reference_number,
            })),
          },
        });
        try {
          await onPaid?.(updated);
        } catch {
          // Tenders are already on the sale — do not tell the cashier payment failed.
        }
        return updated;
      } catch (e) {
        const message =
          e instanceof ApiError || e instanceof Error ? e.message : "Payment failed";
        setError(message);
        return null;
      } finally {
        setSaving(false);
      }
    },
    [sale, balanceDue, paymentMethods, methodsError, resolveFloatSessionId, onPaid],
  );

  const billTotal = saleCollectableBalance(sale, balanceDue);

  return (
    <PosPaymentPanel
      open={open}
      onClose={onClose}
      billTotal={billTotal}
      channel={channel}
      workflow={workflow}
      paymentConfig={paymentConfig}
      prefillWalkInCustomerName={sale?.customer_name_override ?? ""}
      saving={saving}
      error={error}
      onComplete={handleComplete}
      onContinueNextOrder={onClose}
      embedded={embedded}
      enableStkPush={isStkPushEnabled(capabilities?.module_settings, capabilities)}
    />
  );
}
