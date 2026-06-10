"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiRequest } from "@/lib/api";
import { parseDecimalInput } from "@/components/catalog/catalog-shared";
import { formatSaleKes } from "@/lib/sales";
import { resolveCheckoutStatus } from "@/lib/sales-settings";
import { PosSearchableSelect } from "@/components/sales/pos-searchable-select";

function PosField({ label, children }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-bold uppercase tracking-wide text-[#4a5d23]">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded border border-[#c4b89a] bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-[#185FA5]";

function buildConfirmPaymentMessage({ billTotal, payNow, balanceDue, isCredit }) {
  if (billTotal <= 0.01) {
    return "Complete this order?";
  }
  if (isCredit && payNow <= 0.01) {
    return (
      <>
        Record credit sale for <strong>{formatSaleKes(billTotal)}</strong>?
      </>
    );
  }
  if (isCredit && payNow > 0.01 && balanceDue > 0.01) {
    return (
      <>
        Collect <strong>{formatSaleKes(payNow)}</strong> now and record{" "}
        <strong>{formatSaleKes(balanceDue)}</strong> on credit?
      </>
    );
  }
  if (payNow + 0.01 >= billTotal) {
    return (
      <>
        Complete payment of <strong>{formatSaleKes(billTotal)}</strong>?
      </>
    );
  }
  return (
    <>
      Complete payment of <strong>{formatSaleKes(payNow)}</strong> against a bill of{" "}
      <strong>{formatSaleKes(billTotal)}</strong>?
    </>
  );
}

function isCheckoutProcessing(saving, step) {
  return saving || step === "saving";
}

function PosDialogShell({ title, children, footer, overlay, onClose, saving }) {
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape" && !saving) onClose?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-[#8a7a5c] bg-[#f3ebe0] shadow-2xl"
      >
        <div className="bg-[#1e3a5f] px-4 py-3 text-white">
          <h2 className="text-center text-sm font-bold tracking-wide">{title}</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer}
        {overlay}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Centered checkout popup driven by admin sales payment settings.
 */
export function PosPaymentPanel({
  open,
  onClose,
  billTotal,
  channel = "pos",
  workflow,
  paymentConfig,
  prefillMpesaAmount = 0,
  prefillMpesaCode = "",
  lockMpesaFields = false,
  saving,
  error,
  onComplete,
  onContinueNextOrder,
}) {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState("payment");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cashAmount, setCashAmount] = useState("0");
  const [mpesaAmount, setMpesaAmount] = useState("0");
  const [mpesaCode, setMpesaCode] = useState("");
  const [bankType, setBankType] = useState("");
  const [bankAmount, setBankAmount] = useState("0");
  const [bankRef, setBankRef] = useState("");
  const [equityAmount, setEquityAmount] = useState("0");
  const [kcbAmount, setKcbAmount] = useState("0");
  const [otherBankAmount, setOtherBankAmount] = useState("0");
  const [chequeAmount, setChequeAmount] = useState("0");
  const [chequeNo, setChequeNo] = useState("");
  const [walkInCustomerName, setWalkInCustomerName] = useState("");
  const [sessionBillTotal, setSessionBillTotal] = useState(0);
  const [confirmSummary, setConfirmSummary] = useState(null);
  const [localError, setLocalError] = useState(null);

  const [customers, setCustomers] = useState([]);
  const [customerNum, setCustomerNum] = useState("");
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [completedOrder, setCompletedOrder] = useState(null);
  const confirmYesRef = useRef(null);
  const walkInNameRef = useRef(null);
  const completeOkRef = useRef(null);
  const cashAmountRef = useRef(null);
  const enterActionRef = useRef(() => {});
  const prevOpenRef = useRef(false);

  const cfg = paymentConfig ?? {};

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    prevOpenRef.current = Boolean(open);
    if (!open || !justOpened) return;

    const total = Number(billTotal) || 0;
    setStep("payment");
    setCompletedOrder(null);
    setConfirmSummary(null);
    setLocalError(null);
    setCustomerNum("");
    setSessionBillTotal(total);
    setPaymentDate(todayDateString());
    setCashAmount("0");
    const mpesaPrefill = Math.max(0, Number(prefillMpesaAmount) || 0);
    setMpesaAmount(mpesaPrefill > 0 ? String(mpesaPrefill) : "0");
    setMpesaCode(String(prefillMpesaCode ?? "").trim());
    setBankType("");
    setBankAmount("0");
    setBankRef("");
    setEquityAmount("0");
    setKcbAmount("0");
    setOtherBankAmount("0");
    setChequeAmount("0");
    setChequeNo("");
    setWalkInCustomerName("");
  }, [open, billTotal, prefillMpesaAmount, prefillMpesaCode]);

  useEffect(() => {
    if (!open || !cfg.enableCreditPayment) return;
    setLoadingCustomers(true);
    apiRequest("/customers", { searchParams: { per_page: 200 } })
      .then((res) => setCustomers(res.data ?? []))
      .catch(() => setLocalError("Failed to load customers."))
      .finally(() => setLoadingCustomers(false));
  }, [open, cfg.enableCreditPayment]);

  const amountPaid = useMemo(() => {
    let bankTotal = 0;
    if (cfg.useBankSelect) {
      bankTotal = parseDecimalInput(bankAmount);
    } else {
      bankTotal =
        parseDecimalInput(equityAmount) +
        parseDecimalInput(kcbAmount) +
        parseDecimalInput(otherBankAmount);
    }
    return (
      parseDecimalInput(cashAmount) +
      (cfg.enableMpesaAmount ? parseDecimalInput(mpesaAmount) : 0) +
      bankTotal +
      (cfg.showCheque ? parseDecimalInput(chequeAmount) : 0)
    );
  }, [
    cashAmount,
    mpesaAmount,
    bankAmount,
    equityAmount,
    kcbAmount,
    otherBankAmount,
    chequeAmount,
    cfg.useBankSelect,
    cfg.showCheque,
    cfg.enableMpesaAmount,
  ]);

  const checkoutTotal = sessionBillTotal || Number(billTotal) || 0;

  const balanceDue = Math.max(0, checkoutTotal - amountPaid);
  const changeDue = Math.max(0, amountPaid - checkoutTotal);
  const hasCreditCustomer = Boolean(customerNum);

  function needsWalkInCustomerName() {
    return cfg.enableCheckoutCustomerName && !hasCreditCustomer;
  }

  const creditCustomer = hasCreditCustomer
    ? customers.find((c) => String(c.customer_num) === customerNum)
    : null;

  const creditCustomerOptions = useMemo(
    () =>
      customers.map((c) => {
        const name = c.customer_name?.trim() || `Customer #${c.customer_num}`;
        return {
          value: String(c.customer_num),
          label: `${name} (#${c.customer_num})`,
          searchText: `${name} ${c.customer_num} ${c.customer_code ?? ""} ${c.phone ?? ""}`,
        };
      }),
    [customers],
  );

  function todayDateString() {
    return new Date().toISOString().slice(0, 10);
  }

  function resolvedPaymentDate() {
    return cfg.enablePaymentDate ? paymentDate : todayDateString();
  }

  function primaryMethodCode() {
    const parts = [
      { code: "CASH", amount: parseDecimalInput(cashAmount) },
      { code: "MPESA", amount: cfg.enableMpesaAmount ? parseDecimalInput(mpesaAmount) : 0 },
      { code: "CHEQUE", amount: cfg.showCheque ? parseDecimalInput(chequeAmount) : 0 },
    ];
    if (cfg.useBankSelect) {
      parts.push({
        code: bankType || "BANK",
        amount: parseDecimalInput(bankAmount),
      });
    } else {
      if (cfg.showEquityBank) parts.push({ code: "EQUITY", amount: parseDecimalInput(equityAmount) });
      if (cfg.showKcbBank) parts.push({ code: "KCB", amount: parseDecimalInput(kcbAmount) });
      if (cfg.showOtherBank) parts.push({ code: "OTHER", amount: parseDecimalInput(otherBankAmount) });
    }
    const top = parts.sort((a, b) => b.amount - a.amount).find((p) => p.amount > 0);
    return top?.code ?? "CASH";
  }

  function paymentReferenceForPrimary() {
    const code = primaryMethodCode();
    if (code === "MPESA") return mpesaCode.trim() || null;
    if (code === "CHEQUE") return chequeNo.trim() || null;
    if (["EQUITY", "KCB", "OTHER", "BANK"].includes(code)) return bankRef.trim() || null;
    return mpesaCode.trim() || chequeNo.trim() || bankRef.trim() || null;
  }

  function validatePaymentFieldDetails() {
    const mpesa = cfg.enableMpesaAmount ? parseDecimalInput(mpesaAmount) : 0;
    if (mpesa > 0 && cfg.enableMpesaCode && !mpesaCode.trim()) {
      return "Enter the M-Pesa transaction code.";
    }

    if (cfg.useBankSelect && cfg.showBankAmount) {
      const bank = parseDecimalInput(bankAmount);
      if (bank > 0) {
        if (!bankType) return "Select a bank for the bank payment.";
        if (!bankRef.trim()) return "Enter the bank reference number.";
      }
    }

    if (cfg.showCheque) {
      const cheque = parseDecimalInput(chequeAmount);
      if (cheque > 0 && !chequeNo.trim()) {
        return "Enter the cheque number.";
      }
    }

    return null;
  }

  function buildCheckoutBody() {
    const payNow = Math.min(amountPaid, checkoutTotal);
    const creditSale = hasCreditCustomer;
    const paymentMethodCode = creditSale && payNow <= 0 ? "CREDIT" : primaryMethodCode();
    const status = resolveCheckoutStatus({
      channel,
      isCredit: creditSale,
      payNow,
      total: checkoutTotal,
      workflow,
      paymentMethodCode,
      allowPartialPayment: cfg.allowPartialPayment,
    });

    const body = {
      pay_now: payNow,
      payment_method_code: paymentMethodCode,
      payment_reference: paymentReferenceForPrimary(),
      payment_date: resolvedPaymentDate(),
      status,
      is_credit_sale: creditSale,
    };

    if (creditCustomer) {
      body.customer_num = creditCustomer.customer_num;
      body.customer_name_override = creditCustomer.customer_name;
    } else if (needsWalkInCustomerName() && walkInCustomerName.trim()) {
      body.customer_name_override = walkInCustomerName.trim();
    }

    return body;
  }

  function validatePayment() {
    const fieldErr = validatePaymentFieldDetails();
    if (fieldErr) return fieldErr;

    if (showCreditPaymentField && hasCreditCustomer && !creditCustomer) {
      return "Select a valid credit customer.";
    }
    if (hasCreditCustomer) {
      return null;
    }
    if (cfg.allowPartialPayment && amountPaid > 0 && amountPaid + 0.01 < checkoutTotal) {
      return null;
    }
    if (amountPaid <= 0 && checkoutTotal > 0) {
      return "Enter payment amounts, select a credit customer, or enable partial payment in admin settings.";
    }
    if (amountPaid + 0.01 < checkoutTotal) {
      return "Full payment required. Enable Allow pay-now on credit in admin settings, or select a credit customer.";
    }
    return null;
  }

  function handleRequestComplete() {
    setLocalError(null);
    const err = validatePayment();
    if (err) {
      setLocalError(err);
      return;
    }
    const total = Number(billTotal) || 0;
    setSessionBillTotal(total);
    const paid = amountPaid;
    const payNow = Math.min(paid, total);
    setConfirmSummary({
      billTotal: total,
      amountPaid: paid,
      payNow,
      balanceDue: Math.max(0, total - paid),
      changeDue: Math.max(0, paid - total),
      isCredit: hasCreditCustomer,
    });
    setStep("confirm");
  }

  function checkoutStatusLabel(sale) {
    if (sale.status === "completed") return "Sale completed";
    if (sale.status === "paid") return "Order paid";
    if (sale.payment_status === "partial") return "Order partially paid";
    return "Order saved";
  }

  async function submitCheckout() {
    setStep("saving");
    const sale = await onComplete?.(buildCheckoutBody());
    if (!sale) {
      setStep(needsWalkInCustomerName() ? "customerName" : "confirm");
      return;
    }
    setCompletedOrder({
      orderNum: sale.order_num,
      statusLabel: checkoutStatusLabel(sale),
    });
    setStep("complete");
  }

  function handleConfirmYes() {
    setLocalError(null);
    if (needsWalkInCustomerName()) {
      setWalkInCustomerName("");
      setStep("customerName");
      return;
    }
    void submitCheckout();
  }

  function handleCustomerNameContinue() {
    if (!walkInCustomerName.trim()) {
      setLocalError("Enter the walk-in customer name.");
      return;
    }
    setLocalError(null);
    void submitCheckout();
  }

  function handleOrderCompleteOk() {
    onContinueNextOrder?.();
  }

  function isTypingContext() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    return el.getAttribute("role") === "combobox" && el.getAttribute("aria-expanded") === "true";
  }

  const canComplete =
    hasCreditCustomer ||
    amountPaid + 0.01 >= checkoutTotal ||
    (cfg.allowPartialPayment && amountPaid > 0);

  /** Credit customer field is shown whenever credit payment is enabled in admin settings. */
  const showCreditPaymentField = cfg.enableCreditPayment;

  useEffect(() => {
    if (!open || step !== "payment") return;
    const t = window.setTimeout(() => cashAmountRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open, step]);

  useEffect(() => {
    if (!open || step !== "confirm") return;
    const t = window.setTimeout(() => confirmYesRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open, step]);

  useEffect(() => {
    if (!open || step !== "customerName") return;
    const t = window.setTimeout(() => walkInNameRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open, step]);

  useEffect(() => {
    if (!open || step !== "complete") return;
    const t = window.setTimeout(() => completeOkRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open, step]);

  enterActionRef.current = (e) => {
    if (e.key !== "Enter" || saving || step === "saving") return;
    if (step === "complete") {
      e.preventDefault();
      handleOrderCompleteOk();
      return;
    }
    if (step === "customerName") {
      e.preventDefault();
      handleCustomerNameContinue();
      return;
    }
    if (step === "confirm") {
      e.preventDefault();
      handleConfirmYes();
      return;
    }
    if (step === "payment" && canComplete && !isTypingContext()) {
      e.preventDefault();
      handleRequestComplete();
    }
  };

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      enterActionRef.current(e);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function formatPaymentFillAmount(amount, { ceil = false } = {}) {
    if (amount <= 0) return "0";
    if (ceil) return String(Math.ceil(amount));
    const rounded = Math.round(amount * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  }

  function remainingForPaymentField(currentAmount) {
    const current = parseDecimalInput(currentAmount);
    return Math.max(0, checkoutTotal - (amountPaid - current));
  }

  function handlePaymentAmountKeyDown(e, currentAmount, setAmount, { ceil = false } = {}) {
    if (e.key !== "Enter" || step !== "payment" || saving) return;
    e.preventDefault();

    const current = parseDecimalInput(currentAmount);
    const remaining = remainingForPaymentField(currentAmount);

    if (current <= 0 && remaining > 0.009) {
      setAmount(formatPaymentFillAmount(remaining, { ceil }));
      setLocalError(null);
      return;
    }

    if (current > 0 && canComplete) {
      handleRequestComplete();
    }
  }

  function handleCreditCustomerChange(value) {
    setCustomerNum(value);
    setLocalError(null);
  }

  function handleShellClose() {
    if (saving || step === "saving" || step === "complete") return;
    if (step === "customerName") {
      setStep("confirm");
      setLocalError(null);
      return;
    }
    if (step === "confirm") {
      setStep("payment");
      return;
    }
    onClose?.();
  }

  if (!open || !mounted) return null;

  const confirmOverlay =
    step === "confirm" ? (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-payment-title"
        className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 p-4"
      >
        <div className="w-full max-w-sm overflow-hidden rounded-lg border border-[#8a7a5c] bg-[#f3ebe0] shadow-2xl">
          <div className="bg-[#1e3a5f] px-4 py-3 text-white">
            <h3 id="confirm-payment-title" className="text-center text-sm font-bold tracking-wide">
              CONFIRM PAYMENT
            </h3>
          </div>
          <div className="p-4">
            <p className="text-sm text-slate-800">
              {confirmSummary
                ? buildConfirmPaymentMessage(confirmSummary)
                : buildConfirmPaymentMessage({
                    billTotal: checkoutTotal,
                    payNow: Math.min(amountPaid, checkoutTotal),
                    balanceDue,
                    isCredit: hasCreditCustomer,
                  })}
            </p>
            {confirmSummary && confirmSummary.balanceDue > 0.01 ? (
              <p className="mt-2 text-sm text-amber-800">
                Balance due: {formatSaleKes(confirmSummary.balanceDue)}
                {confirmSummary.isCredit
                  ? " — recorded as debtor for the selected customer."
                  : cfg.allowPartialPayment
                    ? " — partial payment; balance remains on this order."
                    : ""}
              </p>
            ) : null}
            {confirmSummary && confirmSummary.changeDue > 0 ? (
              <p className="mt-2 text-sm text-slate-600">
                Change: {formatSaleKes(confirmSummary.changeDue)}
              </p>
            ) : null}
            <p className="mt-3 text-xs text-slate-500">Press Enter to complete payment.</p>
            {(error || localError) ? (
              <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error || localError}
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-[#c4b89a] bg-[#ebe3d4] p-3">
            <button
              ref={confirmYesRef}
              type="button"
              disabled={isCheckoutProcessing(saving, step)}
              onClick={handleConfirmYes}
              className="rounded border border-[#6b8f3c] bg-[#e8f5d8] px-3 py-3 text-xs font-bold uppercase text-[#2d5016] hover:bg-[#d4edc0] disabled:opacity-50"
            >
              Yes, complete
            </button>
            <button
              type="button"
              disabled={isCheckoutProcessing(saving, step)}
              onClick={() => setStep("payment")}
              className="rounded border border-[#a04040] bg-[#fde8e8] px-3 py-3 text-xs font-bold uppercase text-[#7a2020] hover:bg-[#fcd4d4] disabled:opacity-50"
            >
              No, go back
            </button>
          </div>
        </div>
      </div>
    ) : null;

  const customerNameOverlay =
    step === "customerName" ? (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-name-title"
        className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 p-4"
      >
        <div className="w-full max-w-sm overflow-hidden rounded-lg border border-[#8a7a5c] bg-[#f3ebe0] shadow-2xl">
          <div className="bg-[#1e3a5f] px-4 py-3 text-white">
            <h3 id="customer-name-title" className="text-center text-sm font-bold tracking-wide">
              CUSTOMER NAME
            </h3>
          </div>
          <div className="p-4">
            <p className="mb-3 text-sm text-slate-800">
              Enter the walk-in customer name for this order.
            </p>
            <PosField label="Customer name">
              <input
                ref={walkInNameRef}
                type="text"
                className={inputCls}
                value={walkInCustomerName}
                onChange={(e) => {
                  setWalkInCustomerName(e.target.value);
                  setLocalError(null);
                }}
                placeholder="Walk-in customer name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCustomerNameContinue();
                  }
                }}
              />
            </PosField>
            {(error || localError) ? (
              <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error || localError}
              </p>
            ) : null}
            <p className="mt-3 text-xs text-slate-500">Press Enter to continue.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-[#c4b89a] bg-[#ebe3d4] p-3">
            <button
              type="button"
              onClick={handleCustomerNameContinue}
              className="rounded border border-[#6b8f3c] bg-[#e8f5d8] px-3 py-3 text-xs font-bold uppercase text-[#2d5016] hover:bg-[#d4edc0]"
            >
              Continue
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("confirm");
                setLocalError(null);
              }}
              className="rounded border border-[#a04040] bg-[#fde8e8] px-3 py-3 text-xs font-bold uppercase text-[#7a2020] hover:bg-[#fcd4d4]"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    ) : null;

  const savingOverlay =
    step === "saving" ? (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className="absolute inset-0 z-30 flex items-center justify-center bg-black/45 p-4"
      >
        <div className="w-full max-w-sm overflow-hidden rounded-lg border border-[#8a7a5c] bg-[#f3ebe0] shadow-2xl">
          <div className="bg-[#1e3a5f] px-4 py-3 text-white">
            <h3 className="text-center text-sm font-bold tracking-wide">COMPLETING ORDER</h3>
          </div>
          <div className="flex flex-col items-center px-6 py-8 text-center">
            <div
              className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[#c4b89a] border-t-[#185FA5]"
              aria-hidden
            />
            <p className="text-sm font-semibold text-slate-800">Saving…</p>
            <p className="mt-2 text-sm text-slate-600">Please wait.</p>
          </div>
        </div>
      </div>
    ) : null;

  const completeOverlay =
    step === "complete" ? (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-complete-title"
        className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 p-4"
      >
        <div className="w-full max-w-sm overflow-hidden rounded-lg border border-[#8a7a5c] bg-[#f3ebe0] shadow-2xl">
          <div className="bg-[#1e3a5f] px-4 py-3 text-white">
            <h3 id="order-complete-title" className="text-center text-sm font-bold tracking-wide">
              ORDER COMPLETE
            </h3>
          </div>
          <div className="p-4 text-sm text-slate-800">
            {completedOrder?.orderNum ? (
              <p>
                Order <strong>#{completedOrder.orderNum}</strong>
                {completedOrder.statusLabel ? ` — ${completedOrder.statusLabel}` : ""}.
              </p>
            ) : null}
            <p className="mt-2">Press Enter or OK to continue to the next order.</p>
          </div>
          <div className="border-t border-[#c4b89a] bg-[#ebe3d4] p-3">
            <button
              ref={completeOkRef}
              type="button"
              onClick={handleOrderCompleteOk}
              className="w-full rounded border border-[#6b8f3c] bg-[#e8f5d8] px-3 py-3 text-xs font-bold uppercase text-[#2d5016] hover:bg-[#d4edc0]"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    ) : null;

  const dialogOverlay =
    completeOverlay ?? savingOverlay ?? customerNameOverlay ?? confirmOverlay;

  return (
    <PosDialogShell
      title="CHECKOUT"
      saving={isCheckoutProcessing(saving, step)}
      onClose={handleShellClose}
      overlay={dialogOverlay}
      footer={
        <div className="relative z-10 grid grid-cols-2 gap-2 border-t border-[#c4b89a] bg-[#ebe3d4] p-3">
          <button
            type="button"
            disabled={isCheckoutProcessing(saving, step) || !canComplete || step !== "payment"}
            onClick={handleRequestComplete}
            className="flex items-center justify-center gap-2 rounded border border-[#6b8f3c] bg-[#e8f5d8] px-3 py-3 text-xs font-bold uppercase text-[#2d5016] hover:bg-[#d4edc0] disabled:opacity-50"
          >
            <span className="text-lg text-emerald-600">✓</span>
            Complete payment
          </button>
          <button
            type="button"
            disabled={isCheckoutProcessing(saving, step) || step !== "payment"}
            onClick={onClose}
            className="flex items-center justify-center gap-2 rounded border border-[#a04040] bg-[#fde8e8] px-3 py-3 text-xs font-bold uppercase text-[#7a2020] hover:bg-[#fcd4d4] disabled:opacity-50"
          >
            <span className="text-lg text-red-600">✕</span>
            Cancel payment
          </button>
        </div>
      }
    >
      <dl className="mb-4 space-y-1 text-xs text-slate-800">
        <div className="flex justify-between">
          <dt>Bill Total</dt>
          <dd className="font-bold">{formatSaleKes(checkoutTotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Amount Paid</dt>
          <dd className="font-bold">{formatSaleKes(amountPaid)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Balance Due</dt>
          <dd className="font-bold">{formatSaleKes(balanceDue)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Change Due</dt>
          <dd className="font-bold">{formatSaleKes(changeDue)}</dd>
        </div>
      </dl>

      <fieldset className="mt-3 rounded border-2 border-[#8a7a5c] bg-[#faf6ef] p-3">
        <legend className="px-1 text-xs font-bold uppercase text-[#4a5d23]">Payment methods</legend>
        <div className="space-y-3">
          {cfg.enablePaymentDate ? (
            <PosField label="Payment date">
              <input
                type="date"
                className={inputCls}
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </PosField>
          ) : null}
          <PosField label="Cash amount">
            <input
              ref={cashAmountRef}
              type="number"
              min="0"
              step="any"
              className={inputCls}
              value={cashAmount}
              onChange={(e) => setCashAmount(e.target.value)}
              onKeyDown={(e) => handlePaymentAmountKeyDown(e, cashAmount, setCashAmount, { ceil: true })}
            />
          </PosField>
          {cfg.enableMpesaAmount ? (
            <PosField label="M-Pesa amount">
              <input
                type="number"
                min="0"
                step="any"
                className={`${inputCls} ${lockMpesaFields ? "cursor-not-allowed bg-slate-100" : ""}`}
                value={mpesaAmount}
                readOnly={lockMpesaFields}
                disabled={lockMpesaFields}
                onChange={(e) => setMpesaAmount(e.target.value)}
                onKeyDown={(e) => handlePaymentAmountKeyDown(e, mpesaAmount, setMpesaAmount)}
              />
            </PosField>
          ) : null}
          {cfg.enableMpesaAmount && cfg.enableMpesaCode ? (
            <PosField label="M-Pesa code">
              <input
                className={`${inputCls} ${lockMpesaFields ? "cursor-not-allowed bg-slate-100" : ""}`}
                value={mpesaCode}
                readOnly={lockMpesaFields}
                disabled={lockMpesaFields}
                onChange={(e) => setMpesaCode(e.target.value)}
                placeholder="Transaction code"
              />
            </PosField>
          ) : null}

          {cfg.useBankSelect && cfg.bankOptions?.length > 0 ? (
            <>
              <PosField label="Bank type">
                <select
                  className={inputCls}
                  value={bankType}
                  onChange={(e) => setBankType(e.target.value)}
                >
                  {cfg.bankOptions.map((o) => (
                    <option key={o.value || "none"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </PosField>
              {cfg.showBankAmount ? (
                <>
                  <PosField label="Bank amount">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      className={inputCls}
                      value={bankAmount}
                      onChange={(e) => setBankAmount(e.target.value)}
                      onKeyDown={(e) => handlePaymentAmountKeyDown(e, bankAmount, setBankAmount)}
                    />
                  </PosField>
                  <PosField label="Bank ref number">
                    <input
                      className={inputCls}
                      value={bankRef}
                      onChange={(e) => setBankRef(e.target.value)}
                      placeholder="Bank reference / transaction no."
                    />
                  </PosField>
                </>
              ) : null}
            </>
          ) : null}

          {!cfg.useBankSelect && cfg.showEquityBank ? (
            <PosField label="Equity Bank amount">
              <input
                type="number"
                min="0"
                step="any"
                className={inputCls}
                value={equityAmount}
                onChange={(e) => setEquityAmount(e.target.value)}
                onKeyDown={(e) => handlePaymentAmountKeyDown(e, equityAmount, setEquityAmount)}
              />
            </PosField>
          ) : null}
          {!cfg.useBankSelect && cfg.showKcbBank ? (
            <PosField label="KCB amount">
              <input
                type="number"
                min="0"
                step="any"
                className={inputCls}
                value={kcbAmount}
                onChange={(e) => setKcbAmount(e.target.value)}
                onKeyDown={(e) => handlePaymentAmountKeyDown(e, kcbAmount, setKcbAmount)}
              />
            </PosField>
          ) : null}
          {!cfg.useBankSelect && cfg.showOtherBank ? (
            <PosField label={`${cfg.otherBankLabel ?? "Other bank"} amount`}>
              <input
                type="number"
                min="0"
                step="any"
                className={inputCls}
                value={otherBankAmount}
                onChange={(e) => setOtherBankAmount(e.target.value)}
                onKeyDown={(e) => handlePaymentAmountKeyDown(e, otherBankAmount, setOtherBankAmount)}
              />
            </PosField>
          ) : null}

          {cfg.showCheque ? (
            <>
              <PosField label="Cheque amount">
                <input
                  type="number"
                  min="0"
                  step="any"
                  className={inputCls}
                  value={chequeAmount}
                  onChange={(e) => setChequeAmount(e.target.value)}
                  onKeyDown={(e) => handlePaymentAmountKeyDown(e, chequeAmount, setChequeAmount)}
                />
              </PosField>
              {cfg.showChequeNumber ? (
                <PosField label="Cheque no">
                  <input
                    className={inputCls}
                    value={chequeNo}
                    onChange={(e) => setChequeNo(e.target.value)}
                    placeholder="Required when cheque amount is entered"
                  />
                </PosField>
              ) : null}
            </>
          ) : null}
        </div>
      </fieldset>

      {showCreditPaymentField ? (
        <div className="mt-3">
          <PosField label="Credit payment">
            <PosSearchableSelect
              value={customerNum}
              onChange={handleCreditCustomerChange}
              options={creditCustomerOptions}
              loading={loadingCustomers}
              placeholder="— Select customer for credit —"
              searchPlaceholder="Search customers…"
              emptyLabel="No matching customers"
              inputClassName={inputCls}
            />
          <span className="mt-1 block text-[11px] text-slate-600">
            Select a customer to record the unpaid balance as accounts receivable.
          </span>
          </PosField>
        </div>
      ) : null}

      {(error || localError) ? (
        <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error || localError}
        </p>
      ) : null}
    </PosDialogShell>
  );
}
