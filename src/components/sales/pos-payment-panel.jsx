"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiRequest, ApiError } from "@/lib/api";
import { posModalOverlayClass, posModalPanelClass, renderPosModalPortal } from "@/lib/pos-modal-shell";
import { parseDecimalInput, INPUT_CLASS } from "@/components/catalog/catalog-shared";
import { SearchableSelect } from "@/components/catalog/searchable-select";
import { formatSaleKes } from "@/lib/sales";
import { resolveCheckoutStatus } from "@/lib/order-workflow";
import {
  alignPaymentSplitsToPayNow,
  buildCheckoutPaymentSplits,
  buildReceiptTenderSnapshot,
  isPosCashChangeExcessive,
  MAX_POS_CASH_CHANGE,
  posCashChangeDue,
} from "@/lib/checkout-payment-splits";
import {
  customerCreditSummary,
  validateCustomerCreditSale,
} from "@/lib/customer-credit";
import {
  creditCustomerToOption,
  searchCreditCustomers,
} from "@/lib/credit-customer-search";
import { PosSearchableSelect } from "@/components/sales/pos-searchable-select";
import { LOCAL_PRINTING_ADMIN_LABEL } from "@/lib/local-printing";

function normalizeKenyanPhoneInput(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function phoneForMpesaApi(phone) {
  const digits = normalizeKenyanPhoneInput(phone);
  if (digits.startsWith("254") && digits.length === 12) return `0${digits.slice(3)}`;
  if (digits.startsWith("7") && digits.length === 9) return `0${digits}`;
  return digits;
}

function isValidKenyanMobile(phone) {
  return /^(0?7\d{8}|2547\d{8})$/.test(normalizeKenyanPhoneInput(phone));
}

/** Local M-Pesa entry: 07XXXXXXXX, digits only, max 10. */
function formatMpesaPhoneLocal(value) {
  let digits = normalizeKenyanPhoneInput(value);
  if (digits.startsWith("254") && digits.length >= 12) {
    digits = `0${digits.slice(3)}`;
  } else if (digits.startsWith("7") && !digits.startsWith("07")) {
    digits = `0${digits}`;
  }
  return digits.slice(0, 10);
}

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

function buildConfirmPaymentMessage({ billTotal, payNow, balanceDue, isCredit, isReturnAdjustment }) {
  if (isReturnAdjustment) {
    return (
      <>
        Record refund of <strong>{formatSaleKes(Math.abs(billTotal))}</strong> on this order edit?
      </>
    );
  }
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
  prefillWalkInCustomerName = "",
  prefillMpesaPhone = "",
  /** Restored held-order tenders (cash / equity / etc.). */
  prefillCashAmount = 0,
  prefillEquityAmount = 0,
  prefillKcbAmount = 0,
  prefillChequeAmount = 0,
  prefillBankAmount = 0,
  prefillBankType = "",
  lockMpesaFields = false,
  cartId = null,
  enableStkPush = false,
  onCartUpdated,
  onStkFullyPaid,
  saving,
  error,
  onComplete,
  onContinueNextOrder,
  receiptPrintStatus = null,
  onReprintReceipt,
  embedded = false,
  /** Offline / outage: STK and network prompts off; cashier still enters all tender methods manually. */
  cashOnlyOffline = false,
  /** KRA-on previous-order edit: collect only the top-up / return delta. */
  previousOrderEditAdjustment = null,
}) {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState("payment");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cashAmount, setCashAmount] = useState("0");
  const [mpesaAmount, setMpesaAmount] = useState("0");
  const [mpesaCode, setMpesaCode] = useState("");
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [stkBusy, setStkBusy] = useState(false);
  const [stkWatching, setStkWatching] = useState(false);
  const [stkInfo, setStkInfo] = useState(null);
  /** idle | sending | waiting_pin | applying | completing */
  const [stkPhase, setStkPhase] = useState("idle");
  const [stkAppliedLock, setStkAppliedLock] = useState(false);
  const [stkPromptOpen, setStkPromptOpen] = useState(false);
  const [stkPromptPhone, setStkPromptPhone] = useState("");
  const [stkPromptAmount, setStkPromptAmount] = useState("0");
  const [stkCandidates, setStkCandidates] = useState(null);
  const [mpesaPayerName, setMpesaPayerName] = useState("");
  const [bankType, setBankType] = useState("");
  const [bankAmount, setBankAmount] = useState("0");
  const [bankRef, setBankRef] = useState("");
  const [equityAmount, setEquityAmount] = useState("0");
  const [kcbAmount, setKcbAmount] = useState("0");
  const [otherBankAmount, setOtherBankAmount] = useState("0");
  const [chequeAmount, setChequeAmount] = useState("0");
  const [chequeNo, setChequeNo] = useState("");
  const [walkInCustomerName, setWalkInCustomerName] = useState("");
  /** Customer-name step: walk-in name vs registered customer (KRA / receipt link). */
  const [customerNameMode, setCustomerNameMode] = useState("walkin");
  const [receiptCustomerNum, setReceiptCustomerNum] = useState("");
  const [selectedReceiptCustomer, setSelectedReceiptCustomer] = useState(null);
  const [receiptCustomerOptions, setReceiptCustomerOptions] = useState([]);
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
  const mpesaPhoneRef = useRef(null);
  const equityAmountRef = useRef(null);
  const kcbAmountRef = useRef(null);
  const bankAmountRef = useRef(null);
  const creditTriggerRef = useRef(null);
  const creditSelectRef = useRef(null);
  const receiptCustomerSelectRef = useRef(null);
  const enterActionRef = useRef(() => {});
  const prevOpenRef = useRef(false);
  const stkPollRef = useRef(null);
  const lastStkAmountRef = useRef(null);
  /** Last tender field the cashier focused (C/M/E/K) — drives payment_method_code when mixed. */
  const preferredMethodRef = useRef("CASH");

  const cfg = paymentConfig ?? {};
  const adjustmentMode = Boolean(previousOrderEditAdjustment);
  const signedEditDelta = adjustmentMode
    ? Number(previousOrderEditAdjustment.signedDelta ?? 0)
    : 0;
  const isReturnAdjustment = adjustmentMode && signedEditDelta < -0.01;
  const isTopupAdjustment = adjustmentMode && signedEditDelta > 0.01;
  const stkPushAvailable = Boolean(enableStkPush && cartId && !cashOnlyOffline && !adjustmentMode);
  const mpesaFieldsLocked = Boolean(lockMpesaFields || stkAppliedLock);
  /** Credit can settle unpaid/partial; available offline when the cashier can pick a customer. */
  const showCreditPaymentField = cfg.enableCreditPayment && !adjustmentMode;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    prevOpenRef.current = Boolean(open);
    if (!open || !justOpened) return;

    const total = adjustmentMode
      ? Math.abs(signedEditDelta)
      : Number(billTotal) || 0;
    setStep("payment");
    setCompletedOrder(null);
    setConfirmSummary(null);
    setLocalError(null);
    setCustomerNum("");
    setSelectedCreditCustomer(null);
    setCreditSearchOptions([]);
    setSessionBillTotal(total);
    setPaymentDate(todayDateString());
    preferredMethodRef.current = "CASH";
    const cashPrefill = Math.max(0, Number(prefillCashAmount) || 0);
    setCashAmount(
      adjustmentMode && total > 0
        ? String(Math.ceil(total))
        : cashPrefill > 0
          ? String(cashPrefill)
          : "0",
    );
    const mpesaPrefill = Math.max(0, Number(prefillMpesaAmount) || 0);
    setMpesaAmount(mpesaPrefill > 0 ? String(mpesaPrefill) : "0");
    setMpesaCode(String(prefillMpesaCode ?? "").trim());
    setMpesaPhone(formatMpesaPhoneLocal(prefillMpesaPhone ?? ""));
    setStkAppliedLock(mpesaPrefill > 0);
    setStkBusy(false);
    setStkWatching(false);
    setStkInfo(null);
    setStkPhase("idle");
    setStkPromptOpen(false);
    setStkPromptPhone("");
    setStkPromptAmount("0");
    setStkCandidates(null);
    setMpesaPayerName("");
    lastStkAmountRef.current = null;
    const equityPrefill = Math.max(0, Number(prefillEquityAmount) || 0);
    const kcbPrefill = Math.max(0, Number(prefillKcbAmount) || 0);
    const chequePrefill = Math.max(0, Number(prefillChequeAmount) || 0);
    const bankPrefill = Math.max(0, Number(prefillBankAmount) || 0);
    setBankType(String(prefillBankType ?? "").trim());
    setBankAmount(bankPrefill > 0 ? String(bankPrefill) : "0");
    setBankRef("");
    setEquityAmount(equityPrefill > 0 ? String(equityPrefill) : "0");
    setKcbAmount(kcbPrefill > 0 ? String(kcbPrefill) : "0");
    setOtherBankAmount(bankPrefill > 0 && !equityPrefill && !kcbPrefill ? String(bankPrefill) : "0");
    setChequeAmount(chequePrefill > 0 ? String(chequePrefill) : "0");
    setChequeNo("");
    setWalkInCustomerName(String(prefillWalkInCustomerName ?? "").trim());
    setCustomerNameMode("walkin");
    setReceiptCustomerNum("");
    setSelectedReceiptCustomer(null);
    setReceiptCustomerOptions([]);
  }, [
    open,
    billTotal,
    prefillMpesaAmount,
    prefillMpesaCode,
    prefillMpesaPhone,
    prefillCashAmount,
    prefillEquityAmount,
    prefillKcbAmount,
    prefillChequeAmount,
    prefillBankAmount,
    prefillBankType,
    prefillWalkInCustomerName,
    previousOrderEditAdjustment,
    signedEditDelta,
  ]);

  useEffect(() => {
    if (!open) {
      setStkWatching(false);
      if (stkPollRef.current) {
        window.clearTimeout(stkPollRef.current);
        stkPollRef.current = null;
      }
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (stkPollRef.current) {
        window.clearTimeout(stkPollRef.current);
        stkPollRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!stkWatching || !cartId || !open || step !== "payment") {
      return undefined;
    }
    let cancelled = false;
    let delayMs = 3000;

    async function tick() {
      if (cancelled) return;
      const result = await pollStkStatus({ silent: true });
      if (cancelled || !result?.continue) {
        stopStkWatch();
        return;
      }
      stkPollRef.current = window.setTimeout(() => {
        void tick();
      }, delayMs);
      delayMs = Math.min(12000, Math.floor(delayMs * 1.25));
    }

    void tick();

    return () => {
      cancelled = true;
      if (stkPollRef.current) {
        window.clearTimeout(stkPollRef.current);
        stkPollRef.current = null;
      }
    };
    // pollStkStatus closes over latest amounts; re-bind when watch toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional watch-session scope
  }, [stkWatching, cartId, open, step]);

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

  const searchReceiptCustomersForSelect = useCallback(async (query) => {
    const rows = await searchCreditCustomers(query);
    setReceiptCustomerOptions(rows);
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
    // Cart-applied M-Pesa is already deducted from billTotal/amount due — do not
    // count the locked field toward the remaining balance again.
    const mpesaTender =
      cfg.enableMpesaAmount && !mpesaFieldsLocked ? parseDecimalInput(mpesaAmount) : 0;
    return (
      parseDecimalInput(cashAmount) +
      mpesaTender +
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
    mpesaFieldsLocked,
  ]);

  const checkoutTotal = adjustmentMode
    ? Math.abs(signedEditDelta)
    : sessionBillTotal || Number(billTotal) || 0;

  const balanceDue = Math.max(0, checkoutTotal - amountPaid);
  const changeDue = Math.max(0, amountPaid - checkoutTotal);
  const hasCreditCustomer = Boolean(customerNum);

  const linkedReceiptCustomer =
    customerNameMode === "existing" && selectedReceiptCustomer
      ? selectedReceiptCustomer
      : null;

  function needsCustomerNameStep() {
    return (
      cfg.enableCheckoutCustomerName &&
      !hasCreditCustomer &&
      !linkedReceiptCustomer
    );
  }

  /** @deprecated use needsCustomerNameStep — kept for walk-in-only name body path */
  function needsWalkInCustomerName() {
    return needsCustomerNameStep() && customerNameMode === "walkin";
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
      {
        code: "MPESA",
        amount:
          cfg.enableMpesaAmount && !mpesaFieldsLocked ? parseDecimalInput(mpesaAmount) : 0,
      },
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
    const preferred = String(preferredMethodRef.current ?? "").trim().toUpperCase();
    const preferredPart = parts.find(
      (p) => p.code === preferred && Number(p.amount) > 0.009,
    );
    if (preferredPart) return preferredPart.code;
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
    const mpesa =
      cfg.enableMpesaAmount && !mpesaFieldsLocked ? parseDecimalInput(mpesaAmount) : 0;
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
    const payNow = adjustmentMode ? 0 : Math.min(amountPaid, checkoutTotal);
    const creditSale = hasCreditCustomer && !adjustmentMode;
    const paymentMethodCode = creditSale && payNow <= 0 ? "CREDIT" : primaryMethodCode();
    // External POS: only credit-customer sales may be unpaid/partial.
    const allowPartial = creditSale && Boolean(cfg.allowPartialPayment);
    const status = resolveCheckoutStatus({
      channel,
      isCredit: creditSale,
      payNow,
      total: checkoutTotal,
      workflow,
      paymentMethodCode,
      allowPartialPayment: allowPartial,
    });

    const cartMpesa = mpesaFieldsLocked
      ? Math.max(0, parseDecimalInput(mpesaAmount) || Number(prefillMpesaAmount) || 0)
      : 0;
    const tenderAmounts = {
      cashAmount,
      mpesaAmount: mpesaFieldsLocked ? String(cartMpesa) : mpesaAmount,
      chequeAmount,
      equityAmount,
      kcbAmount,
      otherBankAmount,
      bankAmount,
      bankType,
      mpesaCode,
      chequeNo,
      bankRef,
    };
    const paymentSplits = alignPaymentSplitsToPayNow(
      buildCheckoutPaymentSplits(cfg, tenderAmounts),
      adjustmentMode ? amountPaid : payNow + cartMpesa,
    );
    const receiptTenders = buildReceiptTenderSnapshot(tenderAmounts, {
      changeDue: adjustmentMode ? 0 : Math.max(0, amountPaid - checkoutTotal),
      amountPaid,
    });

    const body = {
      pay_now: payNow,
      payment_method_code: paymentMethodCode,
      payment_reference: paymentReferenceForPrimary(),
      payment_date: resolvedPaymentDate(),
      status,
      is_credit_sale: creditSale,
      ...(adjustmentMode ? { __previous_order_edit_adjustment: true } : {}),
      ...(paymentSplits.length > 0 ? { payment_splits: paymentSplits } : {}),
      // Frontend-only: full amount tendered by the customer (may exceed order total for cash).
      // Stripped before the API call; used to print the correct change on the receipt.
      __cash_tendered: amountPaid,
      __receipt_tenders: receiptTenders,
      ...(receiptTenders.change > 0 ? { order_change: receiptTenders.change } : {}),
    };

    if (creditCustomer) {
      body.customer_num = creditCustomer.customer_num;
      body.customer_name_override = creditCustomer.customer_name;
      const creditPin = String(creditCustomer.kra_pin ?? "").trim();
      if (creditPin) body.customer_kra_pin = creditPin;
    } else if (linkedReceiptCustomer) {
      // Paid sale linked to a registered customer (receipt / KRA PIN) — not credit A/R.
      body.customer_num = linkedReceiptCustomer.customer_num;
      body.customer_name_override = linkedReceiptCustomer.customer_name;
      const receiptPin = String(linkedReceiptCustomer.kra_pin ?? "").trim();
      if (receiptPin) body.customer_kra_pin = receiptPin;
    } else {
      const mpesaName = String(mpesaPayerName || walkInCustomerName || "").trim();
      if (mpesaName) {
        body.customer_name_override = mpesaName;
      }
    }

    return body;
  }

  function validatePayment() {
    const fieldErr = validatePaymentFieldDetails();
    if (fieldErr) return fieldErr;

    if (adjustmentMode) {
      if (checkoutTotal <= 0.01) {
        return null;
      }
      if (amountPaid + 0.01 < checkoutTotal) {
        return isReturnAdjustment
          ? "Enter how the refund was paid — amounts must match the return total."
          : "Enter how the top-up was paid — amounts must match the extra due.";
      }
      if (cfg.rejectOverpayment && amountPaid - checkoutTotal > 0.01) {
        return `Payment of ${formatSaleKes(amountPaid)} exceeds the ${isReturnAdjustment ? "return" : "top-up"} amount of ${formatSaleKes(checkoutTotal)}.`;
      }
      return null;
    }

    if (showCreditPaymentField && hasCreditCustomer && !creditCustomer) {
      return "Select a valid credit customer.";
    }
    if (hasCreditCustomer) {
      return validateCustomerCreditSale({
        customer: creditCustomer,
        creditAmount: creditAmountDue,
      });
    }
    if (cfg.rejectOverpayment && amountPaid - checkoutTotal > 0.01) {
      return `Payment of ${formatSaleKes(amountPaid)} exceeds the amount due of ${formatSaleKes(checkoutTotal)}. Enter the correct amount to continue.`;
    }
    if (!cfg.rejectOverpayment && isPosCashChangeExcessive(amountPaid, checkoutTotal)) {
      const change = posCashChangeDue(amountPaid, checkoutTotal);
      return (
        `Overpay too large — change would be ${formatSaleKes(change)}. ` +
        `Only reasonable change is allowed (max ${formatSaleKes(MAX_POS_CASH_CHANGE)}). ` +
        `Enter the amount the customer actually tendered.`
      );
    }
    // Partial / unpaid only for credit customers — never for Cash/M-Pesa/bank walk-ups.
    if (
      hasCreditCustomer &&
      cfg.allowPartialPayment &&
      amountPaid > 0 &&
      amountPaid + 0.01 < checkoutTotal
    ) {
      return null;
    }
    if (amountPaid <= 0 && checkoutTotal > 0) {
      return cfg.enableCreditPayment
        ? "Enter payment amounts or select a credit customer."
        : "Enter payment amounts to cover the full total.";
    }
    if (amountPaid + 0.01 < checkoutTotal) {
      return "Full payment required for Cash, M-Pesa, bank, and cheque — or select a credit customer to bill the balance.";
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
    const total = adjustmentMode ? checkoutTotal : Number(billTotal) || 0;
    setSessionBillTotal(total);
    const paid = amountPaid;
    const payNow = adjustmentMode ? 0 : Math.min(paid, total);
    setConfirmSummary({
      billTotal: total,
      amountPaid: paid,
      payNow,
      balanceDue: Math.max(0, total - paid),
      changeDue: adjustmentMode ? 0 : Math.max(0, paid - total),
      isCredit: hasCreditCustomer,
      isReturnAdjustment,
    });
    setStep("confirm");
  }

  function formatPaymentFillAmount(amount, { ceil = false } = {}) {
    if (amount <= 0) return "0";
    if (ceil) return String(Math.ceil(amount));
    const rounded = Math.round(amount * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  }

  /** Replace leading 0 when cashier starts typing (0 → 5, not 05). Keeps 0.5 decimals. */
  function normalizePaymentAmountInput(nextValue, previousValue = "0") {
    let next = String(nextValue ?? "");
    if (next === "") return "";

    const prev = String(previousValue ?? "0");
    if (
      (prev === "0" || prev === "0.0" || prev === "0.00") &&
      /^0\d/.test(next) &&
      !next.startsWith("0.")
    ) {
      next = next.replace(/^0+/, "") || "0";
    }

    if (/^\d+$/.test(next)) {
      next = next.replace(/^0+(?=\d)/, "") || "0";
    }

    return next;
  }

  function handlePaymentAmountFocus(e, methodCode = null) {
    if (methodCode) {
      preferredMethodRef.current = String(methodCode).trim().toUpperCase();
    }
    e.target.select?.();
  }

  function handlePaymentAmountChange(setAmount, nextValue, previousValue) {
    setAmount(normalizePaymentAmountInput(nextValue, previousValue));
    setLocalError(null);
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
    preferredMethodRef.current = "CREDIT";
    setLocalError(null);
    window.requestAnimationFrame(() => {
      creditSelectRef.current?.openAndFocus?.();
    });
  }

  function focusPaymentField(ref, methodCode = null) {
    if (methodCode) {
      preferredMethodRef.current = String(methodCode).trim().toUpperCase();
    }
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
      focusPaymentField(cashAmountRef, "CASH");
      return true;
    }
    if (key === "m" && cfg.enableMpesaAmount) {
      e.preventDefault();
      focusPaymentField(mpesaAmountRef, "MPESA");
      return true;
    }
    if (key === "e" && !cfg.useBankSelect && cfg.showEquityBank) {
      e.preventDefault();
      focusPaymentField(equityAmountRef, "EQUITY");
      return true;
    }
    if (key === "k" && !cfg.useBankSelect && cfg.showKcbBank) {
      e.preventDefault();
      focusPaymentField(kcbAmountRef, "KCB");
      return true;
    }
    if (key === "b" && cfg.useBankSelect && cfg.showBankAmount) {
      e.preventDefault();
      focusPaymentField(bankAmountRef, bankType || "BANK");
      return true;
    }
    if (key === "i" && showCreditPaymentField) {
      e.preventDefault();
      activateInvoiceMode();
      return true;
    }

    return false;
  }

  function requestPaymentStepComplete() {
    if (step !== "payment" || saving) return;
    if (!canComplete) {
      setLocalError(
        validatePayment() || "Please check the amount — payment is less than the bill total.",
      );
      return;
    }
    handleRequestComplete();
  }

  function handlePaymentAmountKeyDown(e, currentAmount, setAmount, { ceil = false, methodCode = null } = {}) {
    if (step !== "payment" || saving) return;

    if (methodCode) {
      preferredMethodRef.current = String(methodCode).trim().toUpperCase();
    }

    if (e.key === "PageDown") {
      e.preventDefault();
      requestPaymentStepComplete();
      return;
    }

    if (handlePaymentNavigationKey(e)) return;

    if (e.key === "Enter") {
      e.preventDefault();

      const current = parseDecimalInput(currentAmount);
      const remaining = remainingForPaymentField(currentAmount);

      if (current <= 0 && remaining > 0.009) {
        if (methodCode) {
          preferredMethodRef.current = String(methodCode).trim().toUpperCase();
        }
        setAmount(formatPaymentFillAmount(remaining, { ceil }));
        setLocalError(null);
        return;
      }

      if (current > 0 && !canComplete) {
        setLocalError(
          validatePayment() || "Please check the amount — payment is less than the bill total.",
        );
      }
      // Amount entered — use Page Down to open confirm; Enter only prefills balance.
    }
  }

  function handleAuxiliaryPaymentKeyDown(e) {
    if (step !== "payment" || saving) return;

    if (e.key === "PageDown") {
      e.preventDefault();
      requestPaymentStepComplete();
      return;
    }

    handlePaymentNavigationKey(e);
  }

  function stopStkWatch() {
    setStkWatching(false);
    setStkPhase((phase) => (phase === "waiting_pin" ? "idle" : phase));
    if (stkPollRef.current) {
      window.clearTimeout(stkPollRef.current);
      stkPollRef.current = null;
    }
  }

  function resolveStkPushAmount() {
    const due = Math.max(0, Math.ceil(checkoutTotal - amountPaid));
    if (due < 1) return 0;
    if (mpesaFieldsLocked) return due;
    const entered = Math.ceil(parseDecimalInput(mpesaAmount) || 0);
    if (entered >= 1) return Math.min(entered, due);
    return due;
  }

  /** Remaining bill excluding typed (unapplied) M-Pesa — used to prefill the STK popup. */
  function resolveStkPromptPrefillAmount() {
    const typedMpesa = mpesaFieldsLocked ? 0 : parseDecimalInput(mpesaAmount);
    return Math.max(0, Math.ceil(checkoutTotal - (amountPaid - typedMpesa)));
  }

  function openStkPrompt() {
    if (!stkPushAvailable || stkBusy || stkWatching || saving) return;
    const remaining = resolveStkPromptPrefillAmount();
    if (remaining < 1) {
      setLocalError("Nothing left to pay on this order.");
      return;
    }
    setLocalError(null);
    setStkPromptPhone(formatMpesaPhoneLocal(mpesaPhone || prefillMpesaPhone || ""));
    setStkPromptAmount(String(remaining));
    setStkPromptOpen(true);
    window.requestAnimationFrame(() => focusPaymentField(mpesaPhoneRef));
  }

  function closeStkPrompt() {
    if (stkBusy) return;
    setStkPromptOpen(false);
  }

  function syncPanelFromAppliedCart(nextCart, amountDue) {
    const applied = Math.max(0, Number(nextCart?.mpesa_payment_amount ?? 0));
    const remaining = Math.max(0, Number(amountDue ?? 0));
    setMpesaAmount(applied > 0 ? String(applied) : "0");
    setMpesaCode(String(nextCart?.mpesa_transaction_code ?? "").trim());
    if (nextCart?.mpesa_phone) {
      setMpesaPhone(formatMpesaPhoneLocal(nextCart.mpesa_phone));
    }
    setStkAppliedLock(applied > 0);
    setSessionBillTotal(remaining);
    onCartUpdated?.(nextCart);
    return { applied, remaining };
  }

  async function completeAfterFullMpesa(nextCart, { customerName } = {}) {
    const payerName = String(customerName || mpesaPayerName || "").trim();
    if (payerName) {
      setMpesaPayerName(payerName);
      setWalkInCustomerName(payerName);
    }
    stopStkWatch();
    setStkCandidates(null);
    setStkBusy(true);
    setStkPhase("completing");
    setLocalError(null);
    setStep("saving");
    try {
      if (onStkFullyPaid) {
        const sale = await onStkFullyPaid(nextCart, { customerName: payerName || null });
        if (!sale) {
          setStep("payment");
          setStkPhase("idle");
          setStkInfo(
            payerName
              ? `M-Pesa received in full from ${payerName}. Complete the order to finish.`
              : "M-Pesa received in full. Complete the order to finish.",
          );
          return;
        }
        setCompletedOrder({
          orderNum: sale.order_num,
          statusLabel: checkoutStatusLabel(sale),
        });
        setStkPhase("idle");
        setStep("complete");
        return;
      }
      setStep("payment");
      setStkPhase("idle");
      setStkInfo(
        payerName
          ? `M-Pesa received in full from ${payerName}. Press Complete to finish and print.`
          : "M-Pesa received in full. Press Complete to finish and print.",
      );
    } catch (err) {
      setStep("payment");
      setStkPhase("idle");
      setLocalError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setStkBusy(false);
    }
  }

  function rememberMpesaPayerName(payment) {
    const name = String(payment?.payer_name ?? "").trim();
    if (!name) return "";
    setMpesaPayerName(name);
    setWalkInCustomerName(name);
    return name;
  }

  async function applyStkCandidate(paymentOrId, paymentAmount) {
    if (!cartId) return false;
    const paymentId = typeof paymentOrId === "object" ? paymentOrId?.id : paymentOrId;
    const paymentMeta = typeof paymentOrId === "object" ? paymentOrId : null;
    if (!paymentId) return false;
    const paymentCeil = Math.max(0, Math.ceil(Number(paymentAmount ?? paymentMeta?.amount) || 0));
    const stkCeil = Math.max(0, Math.ceil(Number(lastStkAmountRef.current) || 0));
    const toApply = Math.min(paymentCeil || stkCeil, stkCeil || paymentCeil);
    if (toApply < 1) {
      setLocalError("Payment amount is too small to apply.");
      return false;
    }

    const payerName = rememberMpesaPayerName(paymentMeta);

    setStkBusy(true);
    setStkPhase("applying");
    setLocalError(null);
    setStkCandidates(null);
    try {
      const res = await apiRequest(`/sales/carts/${cartId}/payment/mpesa/apply`, {
        method: "POST",
        body: { payment_id: paymentId, amount: toApply },
      });
      const appliedName = rememberMpesaPayerName(res.payment) || payerName;
      const { applied, remaining } = syncPanelFromAppliedCart(res.cart, res.amount_due);
      const txn = res.payment?.transaction_id ? ` (${res.payment.transaction_id})` : "";
      const who = appliedName ? ` from ${appliedName}` : "";

      if (remaining <= 0.01) {
        setStkInfo(`M-Pesa ${formatSaleKes(applied)}${who}${txn} received — completing order…`);
        await completeAfterFullMpesa(res.cart, { customerName: appliedName });
      } else {
        stopStkWatch();
        setStkPhase("idle");
        setStkInfo(
          `M-Pesa ${formatSaleKes(applied)}${who}${txn} applied. Collect balance ${formatSaleKes(remaining)} then complete to print.`,
        );
        window.requestAnimationFrame(() => focusPaymentField(cashAmountRef, "CASH"));
      }
      return true;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to apply M-Pesa payment.";
      setLocalError(msg);
      setStkPhase("idle");
      stopStkWatch();
      return false;
    } finally {
      setStkBusy(false);
    }
  }

  function filterStkCandidates(candidates, expectedAmount) {
    const list = Array.isArray(candidates) ? candidates : [];
    const expected = Math.ceil(Number(expectedAmount) || 0);
    if (expected < 1) return list;
    const matched = list.filter((c) => Math.ceil(Number(c.amount) || 0) === expected);
    return matched.length > 0 ? matched : list;
  }

  async function pollStkStatus({ silent = true } = {}) {
    if (!cartId) return { continue: false };
    const phone = phoneForMpesaApi(mpesaPhone);
    if (!phone) return { continue: false };
    try {
      const res = await apiRequest(`/sales/carts/${cartId}/payment/mpesa/status`, {
        searchParams: { phone },
      });
      if (res.cart) {
        onCartUpdated?.(res.cart);
        if (res.cart.mpesa_phone) setMpesaPhone(formatMpesaPhoneLocal(res.cart.mpesa_phone));
      }

      if (res.stk_error) {
        setLocalError(res.stk_error);
        stopStkWatch();
        return { continue: false, res };
      }
      if (res.status === "failed") {
        setLocalError(res.result_desc || "M-Pesa STK push failed or was cancelled.");
        stopStkWatch();
        return { continue: false, res };
      }

      const expectedAmount =
        Number(res.stk_paid_amount ?? res.stk_amount ?? lastStkAmountRef.current) || 0;
      const candidates = filterStkCandidates(res.candidates ?? [], expectedAmount);

      if (res.status === "completed" && candidates.length > 1) {
        stopStkWatch();
        setStkPhase("idle");
        setStkCandidates(candidates);
        setStkInfo(
          `${candidates.length} M-Pesa payments of ${formatSaleKes(expectedAmount)} found — select the customer.`,
        );
        return { continue: false, res };
      }

      if (res.status === "completed" && candidates.length === 1) {
        setStkPhase("applying");
        setStkInfo("M-Pesa payment received — applying…");
        await applyStkCandidate(candidates[0], candidates[0].amount);
        return { continue: false, res };
      }

      if (res.status === "completed" && Number(res.amount_due ?? 1) <= 0.01 && res.cart) {
        const { applied } = syncPanelFromAppliedCart(res.cart, res.amount_due);
        setStkInfo(`M-Pesa ${formatSaleKes(applied)} received — completing order…`);
        await completeAfterFullMpesa(res.cart);
        return { continue: false, res };
      }

      if (res.status === "pending") {
        setStkPhase("waiting_pin");
        setStkInfo("Waiting for the customer to enter their M-Pesa PIN…");
      }
      return { continue: true, res };
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not check M-Pesa payment status.";
      setLocalError(msg);
      setStkPhase("idle");
      stopStkWatch();
      return { continue: false };
    }
  }

  async function handlePromptUserStk() {
    if (!stkPushAvailable || stkBusy || saving) return;
    const phoneRaw = normalizeKenyanPhoneInput(stkPromptPhone);
    if (!isValidKenyanMobile(phoneRaw) || formatMpesaPhoneLocal(stkPromptPhone).length !== 10) {
      setLocalError("Enter a valid M-Pesa number like 0712345678 (10 digits).");
      focusPaymentField(mpesaPhoneRef);
      return;
    }
    const maxDue = resolveStkPromptPrefillAmount();
    const payAmount = Math.min(
      Math.max(0, Math.ceil(parseDecimalInput(stkPromptAmount) || 0)),
      maxDue,
    );
    if (payAmount < 1) {
      setLocalError("Enter an M-Pesa amount of at least 1.");
      return;
    }

    const phoneLocal = formatMpesaPhoneLocal(stkPromptPhone);
    setMpesaPhone(phoneLocal);
    if (!mpesaFieldsLocked) {
      setMpesaAmount(String(payAmount));
    }

    setStkPromptOpen(false);
    setStkBusy(true);
    setStkPhase("sending");
    setLocalError(null);
    setStkInfo(null);
    try {
      const res = await apiRequest(`/sales/carts/${cartId}/payment/mpesa/stk-push`, {
        method: "POST",
        body: {
          phone_number: phoneForMpesaApi(phoneLocal),
          amount: payAmount,
        },
      });

      if (res.error?.errorMessage) {
        setLocalError(res.error.errorMessage);
        setStkPhase("idle");
        return;
      }

      if (res.cart) onCartUpdated?.(res.cart);
      lastStkAmountRef.current = payAmount;
      const customerMessage =
        res.success?.CustomerMessage ||
        `STK push sent to ${phoneForMpesaApi(phoneLocal)}. Ask the customer to enter their M-Pesa PIN.`;
      setStkInfo(customerMessage);
      setStkPhase("waiting_pin");
      setStkWatching(true);
    } catch (e) {
      setLocalError(e instanceof ApiError ? e.message : "Failed to send M-Pesa STK push.");
      setStkPhase("idle");
    } finally {
      setStkBusy(false);
    }
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
    if (cfg.enableCheckoutCustomerName && !hasCreditCustomer && !linkedReceiptCustomer) {
      if (customerNameMode === "walkin" && !walkInCustomerName.trim()) {
        const prefill = String(prefillWalkInCustomerName ?? "").trim();
        if (prefill) setWalkInCustomerName(prefill);
      }
      setStep("customerName");
      return;
    }
    void submitCheckout();
  }

  function handleCustomerNameContinue() {
    if (customerNameMode === "existing") {
      if (!selectedReceiptCustomer) {
        setLocalError("Search and select an existing customer.");
        return;
      }
      setLocalError(null);
      void submitCheckout();
      return;
    }
    if (!walkInCustomerName.trim()) {
      setLocalError("Enter the walk-in customer name.");
      return;
    }
    setLocalError(null);
    void submitCheckout();
  }

  async function handleOrderCompleteOk() {
    // Parent prepares next workspace (progress bar) then closes payment.
    await onContinueNextOrder?.();
  }

  const creditValidationError = hasCreditCustomer
    ? validateCustomerCreditSale({
        customer: creditCustomer,
        creditAmount: creditAmountDue,
      })
    : null;

  const changeExcessive =
    !adjustmentMode &&
    !cfg.rejectOverpayment &&
    isPosCashChangeExcessive(amountPaid, checkoutTotal);

  const canComplete =
    adjustmentMode
      ? checkoutTotal <= 0.01 || amountPaid + 0.01 >= checkoutTotal
      : !changeExcessive &&
        ((hasCreditCustomer && !creditValidationError) ||
          amountPaid + 0.01 >= checkoutTotal ||
          (hasCreditCustomer && cfg.allowPartialPayment && amountPaid > 0));

  useEffect(() => {
    if (!open || step !== "payment") return;
    const t = window.setTimeout(() => focusPaymentField(cashAmountRef, "CASH"), 0);
    return () => window.clearTimeout(t);
  }, [open, step]);

  useEffect(() => {
    if (!open || !cashOnlyOffline) return;
    // Offline: keep STK/network state clear, but do not wipe manual M-Pesa/bank/cheque amounts.
    setStkAppliedLock(false);
    setStkWatching(false);
    setStkInfo(null);
    setStkPhase("idle");
  }, [open, cashOnlyOffline]);

  useEffect(() => {
    if (!open || step !== "confirm") return;
    const t = window.setTimeout(() => confirmYesRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open, step]);

  useEffect(() => {
    if (!open || step !== "customerName") return;
    const t = window.setTimeout(() => {
      if (customerNameMode === "existing") {
        receiptCustomerSelectRef.current?.openAndFocus?.();
        return;
      }
      walkInNameRef.current?.focus();
      walkInNameRef.current?.select?.();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, step, customerNameMode]);

  useEffect(() => {
    if (!open || step !== "complete") return;
    const t = window.setTimeout(() => completeOkRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open, step]);

  useEffect(() => {
    enterActionRef.current = (e) => {
      if (e.key !== "Enter" || saving || step === "saving") return;
      if (step === "complete") {
        if (receiptPrintStatus === "pending") return;
        e.preventDefault();
        void handleOrderCompleteOk();
        return;
      }
      if (step === "customerName") {
        // Let PosSearchableSelect handle Enter while picking from search results.
        const active = document.activeElement;
        if (
          active?.closest?.(".pos-search-select-panel") ||
          active?.classList?.contains("pos-search-select-search")
        ) {
          return;
        }
        e.preventDefault();
        handleCustomerNameContinue();
        return;
      }
      if (step === "confirm") {
        e.preventDefault();
        handleConfirmYes();
        return;
      }
      // Payment step: Enter only prefills amounts in field handlers — Page Down completes.
    };
  });

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (step === "payment" && !saving) {
        if (e.key === "PageDown") {
          e.preventDefault();
          requestPaymentStepComplete();
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
    if (stkCandidates?.length) {
      setStkCandidates(null);
      return;
    }
    if (stkPromptOpen) {
      closeStkPrompt();
      return;
    }
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
        <p className="text-base">
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
          <p className="mt-2 text-base font-semibold text-amber-600 dark:text-amber-400">
            Balance due: {formatSaleKes(confirmSummary.balanceDue)}
            {confirmSummary.isCredit
              ? " — recorded as debtor for the selected customer."
              : ""}
          </p>
        ) : null}
        {confirmSummary && confirmSummary.changeDue > 0 ? (
          <p className="mt-2 text-[1.1025rem] font-semibold tabular-nums tracking-tight">
            Change: {formatSaleKes(confirmSummary.changeDue)}
          </p>
        ) : null}
        <p className="theme-text-muted mt-3 text-xs">Press Enter to continue.</p>
        {(error || localError) ? (
          <p className="theme-alert-error mt-3 rounded px-3 py-2 text-sm">{error || localError}</p>
        ) : null}
      </PosNestedDialog>
    ) : null;

  const customerNameOverlay =
    step === "customerName" ? (
      <PosNestedDialog
        title="CUSTOMER"
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
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setCustomerNameMode("walkin");
              setReceiptCustomerNum("");
              setSelectedReceiptCustomer(null);
              setReceiptCustomerOptions([]);
              setLocalError(null);
            }}
            className={`rounded-lg border px-3 py-2 text-xs font-bold uppercase ${
              customerNameMode === "walkin"
                ? "border-[var(--theme-primary)] bg-[var(--theme-primary)]/10 text-[var(--theme-primary)]"
                : "theme-secondary-btn"
            }`}
          >
            Walk-in
          </button>
          <button
            type="button"
            onClick={() => {
              setCustomerNameMode("existing");
              setLocalError(null);
              window.requestAnimationFrame(() => {
                receiptCustomerSelectRef.current?.openAndFocus?.();
              });
            }}
            className={`rounded-lg border px-3 py-2 text-xs font-bold uppercase ${
              customerNameMode === "existing"
                ? "border-[var(--theme-primary)] bg-[var(--theme-primary)]/10 text-[var(--theme-primary)]"
                : "theme-secondary-btn"
            }`}
          >
            Existing customer
          </button>
        </div>

        {customerNameMode === "walkin" ? (
          <>
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
          </>
        ) : (
          <>
            <p className="mb-3 text-sm">
              Search a registered customer so the receipt and KRA documents use their PIN.
            </p>
            <PosField label="Existing customer">
              <PosSearchableSelect
                ref={receiptCustomerSelectRef}
                value={receiptCustomerNum}
                onChange={(nextValue, option) => {
                  setReceiptCustomerNum(nextValue);
                  setSelectedReceiptCustomer(option?.customer ?? null);
                  setLocalError(null);
                }}
                options={receiptCustomerOptions}
                loadOptions={searchReceiptCustomersForSelect}
                minSearchLength={1}
                placeholder="Search by name, phone, PIN, or #"
                searchPlaceholder="Search by name, phone, KRA PIN, or customer #…"
                idleSearchLabel="Type a name, phone, KRA PIN, or customer #"
                emptyLabel="No matching customers"
                inputClassName={inputCls}
              />
            </PosField>
            {selectedReceiptCustomer ? (
              <p className="theme-text-muted mt-2 text-[11px]">
                KRA PIN:{" "}
                <strong className="text-[var(--theme-text)]">
                  {String(selectedReceiptCustomer.kra_pin ?? "").trim() || "— not on file"}
                </strong>
              </p>
            ) : null}
          </>
        )}
        {(error || localError) ? (
          <p className="theme-alert-error mt-3 rounded px-3 py-2 text-sm">{error || localError}</p>
        ) : null}
        <p className="theme-text-muted mt-3 text-xs">Press Enter to continue.</p>
      </PosNestedDialog>
    ) : null;

  const stkWaitCopy = (() => {
    switch (stkPhase) {
      case "sending":
        return {
          title: "SENDING M-PESA PROMPT",
          heading: "Sending prompt…",
          detail: "Please wait while the payment request is sent to the customer phone.",
        };
      case "waiting_pin":
        return {
          title: "WAITING FOR M-PESA",
          heading: "Waiting for PIN…",
          detail:
            stkInfo ||
            "Ask the customer to enter their M-Pesa PIN. This screen will update when payment arrives.",
        };
      case "applying":
        return {
          title: "APPLYING M-PESA",
          heading: "Applying payment…",
          detail: "Matching the M-Pesa payment to this order.",
        };
      case "completing":
        return {
          title: "COMPLETING ORDER",
          heading: "Completing sale…",
          detail: "Saving the order and preparing the receipt.",
        };
      default:
        return null;
    }
  })();

  const stkWaitOverlay =
    step === "payment" &&
    stkWaitCopy &&
    (stkBusy || stkWatching) &&
    !(Array.isArray(stkCandidates) && stkCandidates.length > 1) ? (
      <PosNestedDialog
        title={stkWaitCopy.title}
        titleId="mpesa-stk-wait-title"
        role="status"
        ariaLive="polite"
        footer={
          stkPhase === "waiting_pin" ? (
            <div className={POS_DIALOG_FOOTER_SINGLE}>
              <button
                type="button"
                disabled={stkBusy}
                onClick={() => {
                  stopStkWatch();
                  setStkPhase("idle");
                  setStkInfo(
                    "M-Pesa wait cancelled. You can prompt again or complete with other methods.",
                  );
                }}
                className={`${POS_DIALOG_SECONDARY_BTN} w-full`}
              >
                Cancel wait
              </button>
            </div>
          ) : null
        }
      >
        <div className="flex flex-col items-center px-2 py-4 text-center">
          <div
            className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[var(--theme-border)] border-t-[var(--theme-primary)]"
            aria-hidden
          />
          <p className="text-sm font-semibold">{stkWaitCopy.heading}</p>
          <p className="theme-text-muted mt-2 text-sm">{stkWaitCopy.detail}</p>
          {(error || localError) ? (
            <p className="theme-alert-error mt-3 w-full rounded px-3 py-2 text-sm">
              {error || localError}
            </p>
          ) : null}
        </div>
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
                onClick={() => {
                  setStkPhase("idle");
                  setStep("payment");
                }}
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
            <p className="text-sm font-semibold">
              {stkPhase === "completing" ? "Completing M-Pesa sale…" : "Saving…"}
            </p>
            <p className="theme-text-muted mt-2 text-sm">
              {stkPhase === "completing"
                ? "Please wait while the order is saved and the receipt is prepared."
                : "Please wait."}
            </p>
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
              disabled={receiptPrintStatus === "pending"}
              onClick={() => void handleOrderCompleteOk()}
              className={`${POS_DIALOG_PRIMARY_BTN}${receiptPrintStatus === "failed" ? "" : " w-full"} disabled:opacity-50`}
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
            <strong>Administration → {LOCAL_PRINTING_ADMIN_LABEL}</strong>.
          </p>
        ) : null}
        <p className="mt-2 text-sm font-medium">
          {receiptPrintStatus === "pending"
            ? "Wait for print, then press OK to open the next order."
            : "Press Enter or OK to continue to the next order."}
        </p>
      </PosNestedDialog>
    ) : null;

  const stkPromptOverlay =
    step === "payment" && stkPromptOpen ? (
      <PosNestedDialog
        title="M-PESA PROMPT"
        titleId="mpesa-stk-prompt-title"
        footer={
          <div className={POS_DIALOG_FOOTER}>
            <button
              type="button"
              disabled={stkBusy || saving}
              onClick={() => void handlePromptUserStk()}
              className={POS_DIALOG_PRIMARY_BTN}
            >
              {stkBusy ? "Sending…" : "Send prompt"}
            </button>
            <button
              type="button"
              disabled={stkBusy}
              onClick={closeStkPrompt}
              className={POS_DIALOG_SECONDARY_BTN}
            >
              Cancel
            </button>
          </div>
        }
      >
        <p className="mb-3 text-sm">Enter the customer M-Pesa number and amount to request.</p>
        <div className="space-y-3">
          <PosField label="M-Pesa number">
            <input
              ref={mpesaPhoneRef}
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={10}
              className={inputCls}
              value={stkPromptPhone}
              disabled={stkBusy || saving}
              onChange={(e) => {
                setStkPromptPhone(formatMpesaPhoneLocal(e.target.value));
                setLocalError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handlePromptUserStk();
                }
              }}
              placeholder="07XXXXXXXX"
            />
          </PosField>
          <PosField label="Amount">
            <input
              type="number"
              min="1"
              step="1"
              className={inputCls}
              value={stkPromptAmount}
              disabled={stkBusy || saving}
              onFocus={handlePaymentAmountFocus}
              onChange={(e) => {
                handlePaymentAmountChange(setStkPromptAmount, e.target.value, stkPromptAmount);
                setLocalError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handlePromptUserStk();
                  return;
                }
                handlePaymentAmountKeyDown(e, stkPromptAmount, setStkPromptAmount, { ceil: true });
              }}
            />
          </PosField>
          <p className="theme-text-muted text-[11px]">
            Prefills the balance due ({formatSaleKes(resolveStkPromptPrefillAmount())}). Edit if the
            customer pays only part via M-Pesa.
          </p>
        </div>
        {(error || localError) ? (
          <p className="theme-alert-error mt-3 rounded px-3 py-2 text-sm">{error || localError}</p>
        ) : null}
      </PosNestedDialog>
    ) : null;

  const stkCandidateOverlay =
    step === "payment" && Array.isArray(stkCandidates) && stkCandidates.length > 1 ? (
      <PosNestedDialog
        title="SELECT M-PESA PAYMENT"
        titleId="mpesa-candidate-title"
        footer={
          <div className={POS_DIALOG_FOOTER_SINGLE}>
            <button
              type="button"
              disabled={stkBusy}
              onClick={() => setStkCandidates(null)}
              className={`${POS_DIALOG_SECONDARY_BTN} w-full`}
            >
              Cancel
            </button>
          </div>
        }
      >
        <p className="mb-3 text-sm">
          Several customers paid the same amount. Select the payment for this receipt.
        </p>
        <ul className="space-y-2">
          {stkCandidates.map((payment) => {
            const name = String(payment.payer_name ?? "").trim() || "Unknown customer";
            const phone = String(payment.phone_number ?? "").trim();
            const amount = Number(payment.amount) || 0;
            return (
              <li
                key={payment.id}
                className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-3"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-[var(--theme-text)]">{name}</p>
                    <p className="theme-text-muted text-[11px]">
                      {formatSaleKes(amount)}
                      {phone ? ` · ${phone}` : ""}
                      {payment.transaction_id ? ` · ${payment.transaction_id}` : ""}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={stkBusy || saving}
                  onClick={() => void applyStkCandidate(payment, payment.amount)}
                  className={`${POS_DIALOG_PRIMARY_BTN} w-full`}
                >
                  Select this payment
                </button>
              </li>
            );
          })}
        </ul>
        {(error || localError) ? (
          <p className="theme-alert-error mt-3 rounded px-3 py-2 text-sm">{error || localError}</p>
        ) : null}
      </PosNestedDialog>
    ) : null;

  const dialogOverlay =
    completeOverlay ??
    savingOverlay ??
    stkWaitOverlay ??
    customerNameOverlay ??
    confirmOverlay ??
    stkCandidateOverlay ??
    stkPromptOverlay;

  return (
    <PosDialogShell
      title={adjustmentMode ? "PREVIOUS ORDER ADJUSTMENT" : "CHECKOUT"}
      saving={isCheckoutProcessing(saving, step)}
      onClose={handleShellClose}
      overlay={dialogOverlay}
      embedded={embedded}
      footer={
        <div className={`relative z-10 ${POS_DIALOG_FOOTER}`}>
          <button
            type="button"
            disabled={
              isCheckoutProcessing(saving, step) ||
              stkBusy ||
              stkWatching ||
              !canComplete ||
              step !== "payment"
            }
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
      {adjustmentMode ? (
        <div className="theme-panel mb-4 rounded-lg border px-3 py-2 text-xs">
          {previousOrderEditAdjustment.orderNum != null ? (
            <p className="theme-subtext mb-1">
              Cash Sales #{previousOrderEditAdjustment.orderNum}
            </p>
          ) : null}
          <p>
            Was <strong>{formatSaleKes(previousOrderEditAdjustment.originalTotal ?? 0)}</strong>
            {" → "}
            <strong>{formatSaleKes(previousOrderEditAdjustment.newTotal ?? 0)}</strong>
          </p>
          <p className="mt-1 font-medium text-[var(--theme-text)]">
            {isReturnAdjustment
              ? `Refund ${formatSaleKes(checkoutTotal)} to the customer.`
              : isTopupAdjustment
                ? `Collect ${formatSaleKes(checkoutTotal)} extra on this order.`
                : "Confirm this order update."}
          </p>
        </div>
      ) : null}
      <dl className="mb-4 space-y-2 text-base leading-snug">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="theme-subtext font-medium">
            {adjustmentMode
              ? isReturnAdjustment
                ? "Return amount"
                : isTopupAdjustment
                  ? "Top-up amount"
                  : "Adjustment"
              : "Bill Total"}
          </dt>
          <dd className="text-[1.1025rem] font-semibold tabular-nums tracking-tight">
            {isReturnAdjustment ? `−${formatSaleKes(checkoutTotal)}` : formatSaleKes(checkoutTotal)}
          </dd>
        </div>
        {mpesaFieldsLocked && parseDecimalInput(mpesaAmount) > 0 ? (
          <div className="flex items-baseline justify-between gap-3 text-emerald-800 dark:text-emerald-400">
            <dt className="font-medium">M-Pesa applied</dt>
            <dd className="text-[1.1025rem] font-semibold tabular-nums tracking-tight">
              {formatSaleKes(parseDecimalInput(mpesaAmount))}
            </dd>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between gap-3">
          <dt className="theme-subtext font-medium">Amount Paid</dt>
          <dd className="text-[1.225rem] font-semibold tabular-nums tracking-tight">
            {formatSaleKes(amountPaid)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="theme-subtext font-medium">Balance Due</dt>
          <dd className="text-[1.225rem] font-semibold tabular-nums tracking-tight">
            {formatSaleKes(balanceDue)}
          </dd>
        </div>
        {!adjustmentMode ? (
        <div className="flex items-baseline justify-between gap-3">
          <dt className="theme-subtext font-medium">Change Due</dt>
          <dd
            className={`text-[1.225rem] font-semibold tabular-nums tracking-tight${
              changeExcessive ? " text-amber-700 dark:text-amber-400" : ""
            }`}
          >
            {formatSaleKes(changeDue)}
          </dd>
        </div>
        ) : null}
        {changeExcessive ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-sm font-medium text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
            Overpay — change of {formatSaleKes(changeDue)} is too high. Max change is{" "}
            {formatSaleKes(MAX_POS_CASH_CHANGE)}. Enter a realistic tender amount.
          </p>
        ) : null}
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
            {cashOnlyOffline ? (
              <p className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-900">
                Offline — enter Cash, M-Pesa, bank, or cheque amounts manually. STK push and KRA are skipped; receipt prints now and the sale syncs when online. Only credit sales may stay unpaid or partially paid.
              </p>
            ) : null}
            <input
              ref={cashAmountRef}
              type="number"
              min="0"
              step="any"
              className={inputCls}
              value={cashAmount}
              onFocus={(e) => handlePaymentAmountFocus(e, "CASH")}
              onChange={(e) => handlePaymentAmountChange(setCashAmount, e.target.value, cashAmount)}
              onKeyDown={(e) =>
                handlePaymentAmountKeyDown(e, cashAmount, setCashAmount, {
                  ceil: true,
                  methodCode: "CASH",
                })
              }
            />
          </PosField>
          {cfg.enableMpesaAmount ? (
            <PosField label="M-Pesa amount (M)">
              <input
                ref={mpesaAmountRef}
                type="number"
                min="0"
                step="any"
                className={`${inputCls} ${mpesaFieldsLocked ? "theme-input-readonly cursor-not-allowed" : ""}`}
                value={mpesaAmount}
                readOnly={mpesaFieldsLocked}
                disabled={mpesaFieldsLocked}
                onFocus={(e) => handlePaymentAmountFocus(e, "MPESA")}
                onChange={(e) => handlePaymentAmountChange(setMpesaAmount, e.target.value, mpesaAmount)}
                onKeyDown={(e) =>
                  handlePaymentAmountKeyDown(e, mpesaAmount, setMpesaAmount, {
                    methodCode: "MPESA",
                  })
                }
              />
            </PosField>
          ) : null}
          {!cashOnlyOffline && cfg.enableMpesaAmount && stkPushAvailable ? (
            <div className="space-y-2">
              <button
                type="button"
                disabled={stkBusy || stkWatching || saving || resolveStkPromptPrefillAmount() < 1}
                onClick={openStkPrompt}
                className={POS_DIALOG_PRIMARY_BTN}
              >
                {stkWatching ? "Waiting for PIN…" : stkBusy ? "Sending…" : "Prompt User"}
              </button>
              {stkInfo ? (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] font-medium text-emerald-900">
                  {stkInfo}
                </p>
              ) : null}
            </div>
          ) : null}
          {cfg.enableMpesaAmount && cfg.enableMpesaCode ? (
            <PosField label="M-Pesa code">
              <input
                className={`${inputCls} ${mpesaFieldsLocked ? "theme-input-readonly cursor-not-allowed" : ""}`}
                value={mpesaCode}
                readOnly={mpesaFieldsLocked}
                disabled={mpesaFieldsLocked}
                onChange={(e) => setMpesaCode(e.target.value)}
                onKeyDown={handleAuxiliaryPaymentKeyDown}
                placeholder="Transaction code"
              />
            </PosField>
          ) : null}

          {cfg.useBankSelect && cfg.bankOptions?.length > 0 ? (
            <>
              <PosField label="Bank type">
                <SearchableSelect
                  className={inputCls}
                  value={bankType}
                  onChange={setBankType}
                  options={cfg.bankOptions.map((o) => ({ value: o.value, label: o.label }))}
                />
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
                      onFocus={(e) => handlePaymentAmountFocus(e, bankType || "BANK")}
                      onChange={(e) => handlePaymentAmountChange(setBankAmount, e.target.value, bankAmount)}
                      onKeyDown={(e) =>
                        handlePaymentAmountKeyDown(e, bankAmount, setBankAmount, {
                          methodCode: bankType || "BANK",
                        })
                      }
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
                onFocus={(e) => handlePaymentAmountFocus(e, "EQUITY")}
                onChange={(e) => handlePaymentAmountChange(setEquityAmount, e.target.value, equityAmount)}
                onKeyDown={(e) =>
                  handlePaymentAmountKeyDown(e, equityAmount, setEquityAmount, {
                    methodCode: "EQUITY",
                  })
                }
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
                onFocus={(e) => handlePaymentAmountFocus(e, "KCB")}
                onChange={(e) => handlePaymentAmountChange(setKcbAmount, e.target.value, kcbAmount)}
                onKeyDown={(e) =>
                  handlePaymentAmountKeyDown(e, kcbAmount, setKcbAmount, {
                    methodCode: "KCB",
                  })
                }
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
                onFocus={(e) => handlePaymentAmountFocus(e, "OTHER")}
                onChange={(e) =>
                  handlePaymentAmountChange(setOtherBankAmount, e.target.value, otherBankAmount)
                }
                onKeyDown={(e) =>
                  handlePaymentAmountKeyDown(e, otherBankAmount, setOtherBankAmount, {
                    methodCode: "OTHER",
                  })
                }
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
                  onFocus={(e) => handlePaymentAmountFocus(e, "CHEQUE")}
                  onChange={(e) => handlePaymentAmountChange(setChequeAmount, e.target.value, chequeAmount)}
                  onKeyDown={(e) =>
                    handlePaymentAmountKeyDown(e, chequeAmount, setChequeAmount, {
                      methodCode: "CHEQUE",
                    })
                  }
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
              ref={creditSelectRef}
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
                  requestPaymentStepComplete();
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
          "Enter — fill remaining balance",
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
