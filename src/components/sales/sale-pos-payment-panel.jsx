"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { PosPaymentPanel } from "@/components/sales/pos-payment-panel";
import { getCheckoutPaymentConfig } from "@/lib/sales-settings";
import { getOrderWorkflow } from "@/lib/order-workflow";
import { isPlatformMpesaStkEnabled } from "@/lib/platform-org-features";
import { resolvePaymentMethodByCode } from "@/lib/sales";

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
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [methodsError, setMethodsError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const workflow = useMemo(() => getOrderWorkflow(capabilities, sale), [capabilities, sale]);
  const channel = sale?.channel ?? "backend";
  const paymentConfig = useMemo(() => {
    const base = getCheckoutPaymentConfig(capabilities?.module_settings, {
      checkoutContext: "order_payment",
      capabilities,
    });
    if (!isPlatformMpesaStkEnabled(capabilities)) {
      return { ...base, enableMpesaAmount: false, enableMpesaCode: false };
    }
    return base;
  }, [capabilities]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setMethodsError(null);
    apiRequest("/payment-methods", { searchParams: { per_page: 50, "filter[is_active]": 1 } })
      .then((res) => {
        setPaymentMethods(res.data ?? []);
        if (!(res.data ?? []).length) {
          setMethodsError("No active payment methods are available for this organization.");
        }
      })
      .catch((e) => {
        setPaymentMethods([]);
        setMethodsError(e instanceof ApiError ? e.message : "Could not load payment methods.");
      });
  }, [open]);

  const handleComplete = useCallback(
    async (body) => {
      if (!sale?.id) return null;
      setSaving(true);
      setError(null);
      try {
        if (!paymentMethods.length) {
          throw new ApiError(
            methodsError || "No payment methods available. Ask an admin to enable Cash / M-Pesa / Bank.",
            422,
          );
        }
        const code = String(body.payment_method_code ?? "CASH").toUpperCase();
        const method = resolvePaymentMethodByCode(paymentMethods, code);
        if (!method) {
          throw new ApiError(
            `Payment method "${code}" is not set up. Add it under Admin → Payment methods, or use Cash / M-Pesa / Bank.`,
            422,
          );
        }
        const updated = await apiRequest(`/sales/${sale.id}/payments`, {
          method: "POST",
          body: {
            payment_method_id: method.id,
            amount: body.pay_now,
            reference_number: body.payment_reference || null,
            ...(floatSessionId ? { float_session_id: floatSessionId } : {}),
          },
        });
        await onPaid?.(updated);
        return updated;
      } catch (e) {
        const message = e instanceof ApiError ? e.message : "Payment failed";
        setError(message);
        return null;
      } finally {
        setSaving(false);
      }
    },
    [sale?.id, paymentMethods, methodsError, floatSessionId, onPaid],
  );

  const billTotal = balanceDue ?? Math.max(0, Number(sale?.order_total ?? 0) - Number(sale?.amount_paid ?? 0));

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
    />
  );
}
