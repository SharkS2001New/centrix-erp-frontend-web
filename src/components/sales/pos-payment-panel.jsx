"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { posModalOverlayClass, posModalPanelClass, renderPosModalPortal } from "@/lib/pos-modal-shell";
import { parseDecimalInput, INPUT_CLASS } from "@/components/catalog/catalog-shared";
import { formatSaleKes } from "@/lib/sales";
import { resolveCheckoutStatus } from "@/lib/sales-settings";
import {
  customerCreditSummary,
  validateCustomerCreditSale,
} from "@/lib/customer-credit";
import {
  creditCustomerToOption,
  searchCreditCustomers,
} from "@/lib/credit-customer-search";
import { PosSearchableSelect } from "@/components/sales/pos-searchable-select";

function PosField({ label, children }) {
  return (
    <label className="block">
      <span className="theme-accent-label mb-0.5 block text-[11px] font-bold uppercase tracking-wide">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputCls = INPUT_CLASS;

const POS_DIALOG_SHELL =
  "theme-modal relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border shadow-2xl";
const POS_DIALOG_CARD = "theme-modal w-full max-w-sm overflow-hidden rounded-lg border shadow-2xl";
const POS_DIALOG_HEADER = "theme-dialog-header px-4 py-3";
const POS_DIALOG_FOOTER = "theme-dialog-footer grid grid-cols-2 gap-2 p-3";
const POS_DIALOG_FOOTER_SINGLE = "theme-dialog-footer p-3";
const POS_DIALOG_PRIMARY_BTN =
  "theme-primary-btn flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-xs font-bold uppercase disabled:cursor-not-allowed disabled:opacity-50";
const POS_DIALOG_SECONDARY_BTN =
  "theme-secondary-btn flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-xs font-bold uppercase disabled:cursor-not-allowed disabled:opacity-50";

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

function PosDialogShell({ title, children, footer, overlay, onClose, saving, embedded = false }) {
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape" && !saving) onClose?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

  return renderPosModalPortal(
    <div className={`${posModalOverlayClass(embedded)}${embedded ? "" : " bg-black/40"}`}>
      {!embedded ? (
        <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      ) : null}
      <div role="dialog" aria-modal="true" className={`${posModalPanelClass(embedded)} ${POS_DIALOG_SHELL}`}>
        <div className={POS_DIALOG_HEADER}>
          <h2 className="text-center text-sm font-bold tracking-wide">{title}</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer}
        {overlay}
      </div>
    </div>,
  );
}

function PosNestedDialog({ title, titleId, children, footer, role = "dialog", ariaLive }) {
  return (
    <div
      role={role}
      aria-modal={role === "dialog" ? "true" : undefined}
      aria-labelledby={titleId}
      aria-live={ariaLive}
      aria-busy={role === "status" ? "true" : undefined}
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 p-4"
    >
      <div className={POS_DIALOG_CARD}>
        <div className={POS_DIALOG_HEADER}>
          <h3 id={titleId} className="text-center text-sm font-bold tracking-wide">
            {title}
          </h3>
        </div>
        <div className="p-4">{children}</div>
        {footer}
      </div>
    </div>
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
  receiptPrintStatus = null,
  onReprintReceipt,
  embedded = false,
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

  const [creditSearchOptions, setCreditSearchOptions] = useState([]);
  const [selectedCreditCustomer, setSelectedCreditCustomer] = useState(null);
  const [customerNum, setCustomerNum] = useState("");
  const [completedOrder, setCompletedOrder] = useState(null);
  const confirmYesRef = useRef(null);
  const walkInNameRef = useRef(null);
  const completeOkRef = useRef(null);
  const cashAmountRef = useRef(null);
  const mpesaAmountRef = useRef(null);
  const equityAmountRef = useRef(null);
  const kcbAmountRef = useRef(null);
  const bankAmountRef = useRef(null);
  const creditTriggerRef = useRef(null);
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
    setSelectedCreditCustomer(null);
    setCreditSearchOptions([]);
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
    if (!open || step !== "saving" || !error) return;
    setLocalError(error);
    setStep("payment");
  }, [error, open, step]);

  const searchCreditCustomersForSelect = useCallback(async (query) => {
    const rows = await searchCreditCustomers(query);
    setCreditSearchOptions(rows);
    return rows;
  }, []);

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

  const creditCustomer = hasCreditCustomer ? selectedCreditCustomer : null;

  const creditCustomerSummary = useMemo(
    () => customerCreditSummary(creditCustomer),
    [creditCustomer],
  );

  const creditAmountDue = hasCreditCustomer
    ? Math.max(0, checkoutTotal - amountPaid)
    : 0;

  const creditCustomerOptions = useMemo(() => {
    const pinned =
      selectedCreditCustomer &&
      !creditSearchOptions.some(
        (o) => String(o.value) === String(selectedCreditCustomer.customer_num),
      )
        ? [creditCustomerToOption(selectedCreditCustomer)]
        : [];
    return [...pinned, ...creditSearchOptions];
  }, [creditSearchOptions, selectedCreditCustomer]);

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
      return validateCustomerCreditSale({
        customer: creditCustomer,
        creditAmount: creditAmountDue,
      });
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

  function activateInvoiceMode() {
    setCashAmount("0");
    setMpesaAmount("0");
    setEquityAmount("0");
    setKcbAmount("0");
    setOtherBankAmount("0");
    setBankAmount("0");
    setChequeAmount("0");
    setLocalError(null);
    window.requestAnimationFrame(() => {
      creditTriggerRef.current?.focus();
      creditTriggerRef.current?.click();
    });
  }

  function focusPaymentField(ref) {
    if (!ref?.current) return;
    ref.current.focus();
    ref.current.select?.();
  }

  function shouldAllowPaymentLetterShortcut() {
    const el = document.activeElement;
    if (!el) return true;
    if (el.getAttribute("role") === "combobox" && el.getAttribute("aria-expanded") === "true") {
      return false;
    }
    if (el.tagName === "INPUT") {
      const type = el.type?.toLowerCase() ?? "text";
      if (type === "number") return true;
      return false;
    }
    if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return false;
    return true;
  }

  function handlePaymentNavigationKey(e) {
    if (step !== "payment" || saving) return false;

    if (e.altKey || e.ctrlKey || e.metaKey) return false;

    const key = e.key.length === 1 ? e.key.toLowerCase() : "";
    if (!key || !shouldAllowPaymentLetterShortcut()) return false;

    if (key === "c") {
      e.preventDefault();
      focusPaymentField(cashAmountRef);
      return true;
    }
    if (key === "m" && cfg.enableMpesaAmount) {
      e.preventDefault();
      focusPaymentField(mpesaAmountRef);
      return true;
    }
    if (key === "e" && !cfg.useBankSelect && cfg.showEquityBank) {
      e.preventDefault();
      focusPaymentField(equityAmountRef);
      return true;
    }
    if (key === "k" && !cfg.useBankSelect && cfg.showKcbBank) {
      e.preventDefault();
      focusPaymentField(kcbAmountRef);
      return true;
    }
    if (key === "b" && cfg.useBankSelect && cfg.showBankAmount) {
      e.preventDefault();
      focusPaymentField(bankAmountRef);
      return true;
    }
    if (key === "i" && showCreditPaymentField) {
      e.preventDefault();
      activateInvoiceMode();
      return true;
    }

    return false;
  }

  function requestCompleteFromKeyboard() {
    if (!canComplete) {
      setLocalError(
        validatePayment() || "Please check the amount — payment is less than the bill total.",
      );
      return;
    }
    handleRequestComplete();
  }

  function handlePaymentAmountKeyDown(e, currentAmount, setAmount, { ceil = false } = {}) {
    if (step !== "payment" || saving) return;

    if (e.key === "PageDown") {
      e.preventDefault();
      requestCompleteFromKeyboard();
      return;
    }

    if (handlePaymentNavigationKey(e)) return;

    if (e.key === "Enter") {
      e.preventDefault();

      const current = parseDecimalInput(currentAmount);
      const remaining = remainingForPaymentField(currentAmount);

      if (current <= 0 && remaining > 0.009) {
        setAmount(formatPaymentFillAmount(remaining, { ceil }));
        setLocalError(null);
        return;
      }

      if (current > 0 && canComplete) {
        requestCompleteFromKeyboard();
      } else if (current > 0) {
        setLocalError(
          validatePayment() || "Please check the amount — payment is less than the bill total.",
        );
      }
    }
  }

  function handleAuxiliaryPaymentKeyDown(e) {
    if (step !== "payment" || saving) return;

    if (e.key === "PageDown") {
      e.preventDefault();
      requestCompleteFromKeyboard();
      return;
    }

    handlePaymentNavigationKey(e);
  }

  function checkoutStatusLabel(sale) {
    if (sale.status === "completed") return "Sale completed";
    if (sale.status === "paid") return "Order paid";
    if (sale.payment_status === "partial") return "Order partially paid";
    return "Order saved";
  }

  async function submitCheckout() {
    setStep("saving");
    setLocalError(null);
    try {
      const sale = await onComplete?.(buildCheckoutBody());
      if (!sale) {
        setStep("payment");
        return;
      }
      setCompletedOrder({
        orderNum: sale.order_num,
        statusLabel: checkoutStatusLabel(sale),
      });
      setStep("complete");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Checkout failed");
      setStep("payment");
    }
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

  const creditValidationError = hasCreditCustomer
    ? validateCustomerCreditSale({
        customer: creditCustomer,
        creditAmount: creditAmountDue,
      })
    : null;

  const canComplete =
    (hasCreditCustomer && !creditValidationError) ||
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
      if (step === "payment" && !saving) {
        if (e.key === "PageDown") {
          e.preventDefault();
          requestCompleteFromKeyboard();
          return;
        }
        if (handlePaymentNavigationKey(e)) return;
      }
      enterActionRef.current(e);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, step, saving, canComplete, checkoutTotal, amountPaid]);

  function handleCreditCustomerChange(value, option) {
    setCustomerNum(value);
    setSelectedCreditCustomer(option?.customer ?? null);
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
      <PosNestedDialog
        title="CONFIRM PAYMENT"
        titleId="confirm-payment-title"
        footer={
          <div className={POS_DIALOG_FOOTER}>
            <button
              ref={confirmYesRef}
              type="button"
              disabled={isCheckoutProcessing(saving, step)}
              onClick={handleConfirmYes}
              className={POS_DIALOG_PRIMARY_BTN}
            >
              Yes, complete
            </button>
            <button
              type="button"
              disabled={isCheckoutProcessing(saving, step)}
              onClick={() => setStep("payment")}
              className={POS_DIALOG_SECONDARY_BTN}
            >
              No, go back
            </button>
          </div>
        }
      >
        <p className="text-sm">
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
          <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
            Balance due: {formatSaleKes(confirmSummary.balanceDue)}
            {confirmSummary.isCredit
              ? " — recorded as debtor for the selected customer."
              : cfg.allowPartialPayment
                ? " — partial payment; balance remains on this order."
                : ""}
          </p>
        ) : null}
        {confirmSummary && confirmSummary.changeDue > 0 ? (
          <p className="theme-text-muted mt-2 text-sm">
            Change: {formatSaleKes(confirmSummary.changeDue)}
          </p>
        ) : null}
        <p className="theme-text-muted mt-3 text-xs">Press Enter to complete payment.</p>
        {(error || localError) ? (
          <p className="theme-alert-error mt-3 rounded px-3 py-2 text-sm">{error || localError}</p>
        ) : null}
      </PosNestedDialog>
    ) : null;

  const customerNameOverlay =
    step === "customerName" ? (
      <PosNestedDialog
        title="CUSTOMER NAME"
        titleId="customer-name-title"
        footer={
          <div className={POS_DIALOG_FOOTER}>
            <button type="button" onClick={handleCustomerNameContinue} className={POS_DIALOG_PRIMARY_BTN}>
              Continue
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("confirm");
                setLocalError(null);
              }}
              className={POS_DIALOG_SECONDARY_BTN}
            >
              Back
            </button>
          </div>
        }
      >
        <p className="mb-3 text-sm">Enter the walk-in customer name for this order.</p>
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
          <p className="theme-alert-error mt-3 rounded px-3 py-2 text-sm">{error || localError}</p>
        ) : null}
        <p className="theme-text-muted mt-3 text-xs">Press Enter to continue.</p>
      </PosNestedDialog>
    ) : null;

  const savingOverlay =
    step === "saving" ? (
      <PosNestedDialog
        title="COMPLETING ORDER"
        titleId="saving-order-title"
        role="status"
        ariaLive="polite"
        footer={
          error || localError ? (
            <div className={POS_DIALOG_FOOTER_SINGLE}>
              <button
                type="button"
                onClick={() => setStep("payment")}
                className={`${POS_DIALOG_SECONDARY_BTN} w-full`}
              >
                Go back
              </button>
            </div>
          ) : null
        }
      >
        {error || localError ? (
          <p className="theme-alert-error rounded px-3 py-2 text-sm">{error || localError}</p>
        ) : (
          <div className="flex flex-col items-center px-2 py-4 text-center">
            <div
              className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[var(--theme-border)] border-t-[var(--theme-primary)]"
              aria-hidden
            />
            <p className="text-sm font-semibold">Saving…</p>
            <p className="theme-text-muted mt-2 text-sm">Please wait.</p>
          </div>
        )}
      </PosNestedDialog>
    ) : null;

  const completeOverlay =
    step === "complete" ? (
      <PosNestedDialog
        title="ORDER COMPLETE"
        titleId="order-complete-title"
        footer={
          <div className={`${receiptPrintStatus === "failed" ? POS_DIALOG_FOOTER : POS_DIALOG_FOOTER_SINGLE} gap-2`}>
            {receiptPrintStatus === "failed" && onReprintReceipt ? (
              <button
                type="button"
                onClick={() => onReprintReceipt()}
                className={POS_DIALOG_SECONDARY_BTN}
              >
                Reprint receipt
              </button>
            ) : null}
            <button
              ref={completeOkRef}
              type="button"
              onClick={handleOrderCompleteOk}
              className={`${POS_DIALOG_PRIMARY_BTN}${receiptPrintStatus === "failed" ? "" : " w-full"}`}
            >
              OK
            </button>
          </div>
        }
      >
        {completedOrder?.orderNum ? (
          <p>
            Order <strong>#{completedOrder.orderNum}</strong>
            {completedOrder.statusLabel ? ` — ${completedOrder.statusLabel}` : ""}.
          </p>
        ) : null}
        {receiptPrintStatus === "pending" ? (
          <p className="theme-text-muted mt-2 text-sm">Printing receipt…</p>
        ) : null}
        {receiptPrintStatus === "printed" ? (
          <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">Receipt sent to printer.</p>
        ) : null}
        {receiptPrintStatus === "failed" ? (
          <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            Receipt did not print. The sale is saved — use <strong>Reprint receipt</strong> or check{" "}
            <strong>Administration → Till printing</strong>.
          </p>
        ) : null}
        <p className="mt-2 text-sm">Press Enter or OK to continue to the next order.</p>
      </PosNestedDialog>
    ) : null;

  const dialogOverlay =
    completeOverlay ?? savingOverlay ?? customerNameOverlay ?? confirmOverlay;

  return (
    <PosDialogShell
      title="CHECKOUT"
      saving={isCheckoutProcessing(saving, step)}
      onClose={handleShellClose}
      overlay={dialogOverlay}
      embedded={embedded}
      footer={
        <div className={`relative z-10 ${POS_DIALOG_FOOTER}`}>
          <button
            type="button"
            disabled={isCheckoutProcessing(saving, step) || !canComplete || step !== "payment"}
            onClick={handleRequestComplete}
            className={POS_DIALOG_PRIMARY_BTN}
          >
            <span className="text-lg">✓</span>
            Complete payment
          </button>
          <button
            type="button"
            disabled={isCheckoutProcessing(saving, step) || step !== "payment"}
            onClick={onClose}
            className={POS_DIALOG_SECONDARY_BTN}
          >
            <span className="text-lg">✕</span>
            Cancel payment
          </button>
        </div>
      }
    >
      <dl className="mb-4 space-y-1 text-xs">
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

      <fieldset className="theme-fieldset mt-3 rounded-lg border p-3">
        <legend className="px-1 text-xs font-bold uppercase">Payment methods</legend>
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
          <PosField label="Cash amount (C)">
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
            <PosField label="M-Pesa amount (M)">
              <input
                ref={mpesaAmountRef}
                type="number"
                min="0"
                step="any"
                className={`${inputCls} ${lockMpesaFields ? "theme-input-readonly cursor-not-allowed" : ""}`}
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
                className={`${inputCls} ${lockMpesaFields ? "theme-input-readonly cursor-not-allowed" : ""}`}
                value={mpesaCode}
                readOnly={lockMpesaFields}
                disabled={lockMpesaFields}
                onChange={(e) => setMpesaCode(e.target.value)}
                onKeyDown={handleAuxiliaryPaymentKeyDown}
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
                  <PosField label="Bank amount (B)">
                    <input
                      ref={bankAmountRef}
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
                      onKeyDown={handleAuxiliaryPaymentKeyDown}
                      placeholder="Bank reference / transaction no."
                    />
                  </PosField>
                </>
              ) : null}
            </>
          ) : null}

          {!cfg.useBankSelect && cfg.showEquityBank ? (
            <PosField label="Equity Bank amount (E)">
              <input
                ref={equityAmountRef}
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
            <PosField label="KCB amount (K)">
              <input
                ref={kcbAmountRef}
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
                    onKeyDown={handleAuxiliaryPaymentKeyDown}
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
          <PosField label="Credit / invoice customer (I)">
            <PosSearchableSelect
              triggerRef={creditTriggerRef}
              value={customerNum}
              onChange={handleCreditCustomerChange}
              options={creditCustomerOptions}
              loadOptions={searchCreditCustomersForSelect}
              minSearchLength={1}
              placeholder="Search customer by name, phone, or #"
              searchPlaceholder="Search by name, phone, or customer #…"
              idleSearchLabel="Type a name, phone number, or customer #"
              emptyLabel="No matching customers"
              inputClassName={inputCls}
              onTriggerKeyDown={(e) => {
                if (e.key === "PageDown") {
                  e.preventDefault();
                  requestCompleteFromKeyboard();
                  return;
                }
                if (handlePaymentNavigationKey(e)) return;
                if (e.key === "Enter") {
                  e.preventDefault();
                  activateInvoiceMode();
                }
              }}
            />
          <span className="mt-1 block text-[11px] text-slate-600">
            Registered customers only — walk-ins cannot be charged to accounts receivable.
          </span>
          {creditCustomer && creditCustomerSummary?.limit > 0 ? (
            <span className="mt-1 block text-[11px] text-slate-600">
              Limit {formatSaleKes(creditCustomerSummary.limit)} · Outstanding{" "}
              {formatSaleKes(creditCustomerSummary.outstanding)} · Available{" "}
              {formatSaleKes(creditCustomerSummary.available ?? 0)}
              {creditAmountDue > 0.009 && creditCustomerSummary.available != null
                ? creditAmountDue > creditCustomerSummary.available + 0.009
                  ? " — exceeds available credit"
                  : ` — ${formatSaleKes(creditAmountDue)} on credit`
                : ""}
            </span>
          ) : creditCustomer ? (
            <span className="mt-1 block text-[11px] text-slate-600">
              No credit limit on this customer — unlimited credit allowed.
            </span>
          ) : null}
          </PosField>
        </div>
      ) : null}

      <p className="theme-text-muted mt-3 text-[11px] leading-relaxed">
        {[
          "Page Down — complete payment",
          "Enter — fill balance or complete",
          "C — cash",
          cfg.enableMpesaAmount ? "M — M-Pesa" : null,
          cfg.useBankSelect && cfg.showBankAmount ? "B — bank" : null,
          !cfg.useBankSelect && cfg.showEquityBank ? "E — Equity" : null,
          !cfg.useBankSelect && cfg.showKcbBank ? "K — KCB" : null,
          showCreditPaymentField ? "I — credit / invoice" : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      {(error || localError) ? (
        <p className="theme-alert-error mt-3 rounded px-3 py-2 text-sm">
          {error || localError}
        </p>
      ) : null}
    </PosDialogShell>
  );
}
