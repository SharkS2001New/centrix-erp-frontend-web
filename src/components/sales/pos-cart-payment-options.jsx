"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiRequest, ApiError } from "@/lib/api";
import { formatSaleKes } from "@/lib/sales";

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-black shadow-sm outline-none placeholder:text-slate-500 focus:border-[#185FA5] focus:ring-2 focus:ring-[#185FA5]/20";

function lockBodyScroll() {
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  const prevOverflow = document.body.style.overflow;
  const prevPaddingRight = document.body.style.paddingRight;
  document.body.style.overflow = "hidden";
  if (scrollbarWidth > 0) {
    document.body.style.paddingRight = `${scrollbarWidth}px`;
  }
  return () => {
    document.body.style.overflow = prevOverflow;
    document.body.style.paddingRight = prevPaddingRight;
  };
}

function focusWithoutScroll(el) {
  el?.focus({ preventScroll: true });
}

function PayOptionDialog({ open, title, onClose, children, footer }) {
  useLayoutEffect(() => {
    if (!open) return undefined;
    return lockBodyScroll();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
      >
        <div className="border-b border-slate-200 bg-[#E6F1FB] px-4 py-3">
          <h3 className="text-center text-sm font-bold uppercase tracking-wide text-[#0C447C]">
            {title}
          </h3>
        </div>
        <div className="p-4">{children}</div>
        {footer ? (
          <div className="grid grid-cols-2 gap-2 border-t border-slate-200 bg-slate-50 p-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function PayOptionButton({ icon, label, sublabel, active, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2.5 text-center disabled:opacity-40 ${
        active
          ? "border-[#185FA5] bg-[#E6F1FB] text-[#0C447C]"
          : "border-slate-200 bg-white text-slate-700 hover:border-[#185FA5]/40 hover:bg-slate-50"
      }`}
    >
      <span className="text-2xl leading-none" aria-hidden>
        {icon}
      </span>
      <span className="text-[10px] font-bold uppercase tracking-wide">{label}</span>
      {sublabel ? (
        <span className="line-clamp-1 text-[9px] font-medium normal-case text-slate-500">
          {sublabel}
        </span>
      ) : null}
    </button>
  );
}

function normalizeKenyanPhoneInput(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function formatMpesaTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-KE", {
      hour: "2-digit",
      minute: "2-digit",
      day: "numeric",
      month: "short",
    });
  } catch {
    return "";
  }
}

export function PosCartPaymentOptions({
  cart,
  busy,
  amountDue = 0,
  enableVouchers,
  enablePoints,
  enableMpesa,
  onCartUpdated,
  onMessage,
  onPaymentApplied,
  onCompleteOrder,
}) {
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherAmount, setVoucherAmount] = useState("");
  const [pointsPhone, setPointsPhone] = useState("");
  const [pointsToRedeem, setPointsToRedeem] = useState("");
  const [loyaltyPreview, setLoyaltyPreview] = useState(null);
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [stkAmount, setStkAmount] = useState("");
  const [checkAmount, setCheckAmount] = useState("");
  const [mpesaError, setMpesaError] = useState(null);
  const [mpesaInfo, setMpesaInfo] = useState(null);
  const [mpesaCandidates, setMpesaCandidates] = useState([]);
  const [working, setWorking] = useState(false);
  const [watchingMpesa, setWatchingMpesa] = useState(false);
  const [mpesaMode, setMpesaMode] = useState("check");
  const [activeDialog, setActiveDialog] = useState(null);
  const pollTimerRef = useRef(null);
  const prevDialogRef = useRef(null);
  const lastStkPayAmountRef = useRef(null);
  const mpesaPhoneRef = useRef(null);
  const stkAmountRef = useRef(null);
  const voucherCodeRef = useRef(null);
  const pointsPhoneRef = useRef(null);

  useEffect(() => {
    setMpesaPhone(cart?.mpesa_phone ?? "");
    if (Number(cart?.voucher_payment_amount ?? 0) <= 0) {
      setVoucherCode("");
      setVoucherAmount("");
    }
    if (Number(cart?.points_payment_amount ?? 0) <= 0) {
      setPointsPhone("");
      setPointsToRedeem("");
      setLoyaltyPreview(null);
    }
  }, [
    cart?.id,
    cart?.mpesa_phone,
    cart?.voucher_payment_amount,
    cart?.points_payment_amount,
  ]);

  useEffect(() => {
    const justOpenedMpesa = activeDialog === "mpesa" && prevDialogRef.current !== "mpesa";
    prevDialogRef.current = activeDialog;
    if (justOpenedMpesa) {
      const due = Math.max(0, Math.ceil(Number(amountDue) || 0));
      const dueStr = due > 0 ? String(due) : "";
      setStkAmount(dueStr);
      setCheckAmount(dueStr);
    }
  }, [activeDialog, amountDue]);

  useEffect(() => {
    if (activeDialog !== "mpesa" || mpesaMode !== "check") return;
    if (resolveMpesaApplyAmount(checkAmount)) return;
    const due = Math.max(0, Math.ceil(Number(amountDue) || 0));
    if (due > 0) setCheckAmount(String(due));
  }, [activeDialog, mpesaMode, amountDue, checkAmount]);

  useEffect(() => {
    if (!activeDialog) return;
    const t = window.requestAnimationFrame(() => {
      if (activeDialog === "mpesa") focusWithoutScroll(mpesaPhoneRef.current);
      if (activeDialog === "voucher") focusWithoutScroll(voucherCodeRef.current);
      if (activeDialog === "points") focusWithoutScroll(pointsPhoneRef.current);
    });
    return () => window.cancelAnimationFrame(t);
  }, [activeDialog]);

  const hasVoucher = Number(cart?.voucher_payment_amount ?? 0) > 0;
  const hasPoints = Number(cart?.points_payment_amount ?? 0) > 0;
  const hasMpesaPayment = Number(cart?.mpesa_payment_amount ?? 0) > 0;
  const hasMpesaPhone = Boolean(String(cart?.mpesa_phone ?? "").trim());
  const showSection = enableVouchers || enablePoints || enableMpesa;

  const payButtons = useMemo(() => {
    const items = [];
    if (enableMpesa) {
      items.push({
        id: "mpesa",
        icon: "📲",
        label: "M-Pesa",
        sublabel: hasMpesaPayment
          ? formatSaleKes(cart.mpesa_payment_amount)
          : hasMpesaPhone
            ? cart.mpesa_phone
            : "STK push",
        active: hasMpesaPayment || hasMpesaPhone,
      });
    }
    if (enableVouchers) {
      items.push({
        id: "voucher",
        icon: "🎟",
        label: "Voucher",
        sublabel: hasVoucher ? formatSaleKes(cart.voucher_payment_amount) : "Pay with code",
        active: hasVoucher,
      });
    }
    if (enablePoints) {
      items.push({
        id: "points",
        icon: "⭐",
        label: "Redeem points",
        sublabel: hasPoints
          ? `${cart.points_redeemed ?? 0} pts`
          : "Loyalty card",
        active: hasPoints,
      });
    }
    return items;
  }, [
    enableMpesa,
    enableVouchers,
    enablePoints,
    hasMpesaPhone,
    hasMpesaPayment,
    hasVoucher,
    hasPoints,
    cart?.mpesa_phone,
    cart?.mpesa_payment_amount,
    cart?.voucher_payment_amount,
    cart?.points_redeemed,
  ]);

  if (!showSection) return null;

  const disabled = busy || working || !cart?.lines?.length;

  function stopMpesaWatch() {
    setWatchingMpesa(false);
    if (pollTimerRef.current) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  function closeDialog() {
    stopMpesaWatch();
    setMpesaError(null);
    setMpesaInfo(null);
    setMpesaCandidates([]);
    setMpesaMode("check");
    lastStkPayAmountRef.current = null;
    setActiveDialog(null);
  }

  function switchMpesaMode(mode) {
    if (mode === mpesaMode) return;
    if (mode === "stk") {
      stopMpesaWatch();
      setMpesaInfo(null);
      setMpesaCandidates([]);
    }
    setMpesaError(null);
    setMpesaMode(mode);
  }

  useEffect(() => {
    return () => stopMpesaWatch();
  }, []);

  async function applyVoucher() {
    if (!cart?.id || !voucherCode.trim()) return;
    setWorking(true);
    onMessage?.(null);
    try {
      const body = { voucher_code: voucherCode.trim() };
      if (voucherAmount.trim()) body.amount = Number(voucherAmount);
      const res = await apiRequest(`/sales/carts/${cart.id}/payment/voucher`, {
        method: "POST",
        body,
      });
      onCartUpdated?.(res.cart);
      setVoucherCode(res.voucher?.voucher_code ?? voucherCode);
      onMessage?.(`Voucher applied: ${formatSaleKes(res.voucher?.applied_amount ?? 0)}`);
      closeDialog();
    } catch (e) {
      onMessage?.(e instanceof ApiError ? e.message : "Failed to apply voucher");
    } finally {
      setWorking(false);
    }
  }

  async function lookupPoints() {
    if (!pointsPhone.trim() || !cart?.id) return;
    setWorking(true);
    onMessage?.(null);
    try {
      const res = await apiRequest("/sales/loyalty-cards/lookup", {
        searchParams: { phone: pointsPhone.trim() },
      });
      const attached = await apiRequest(`/sales/carts/${cart.id}/loyalty`, {
        method: "POST",
        body: { phone: pointsPhone.trim() },
      });
      onCartUpdated?.(attached.cart);
      setLoyaltyPreview(res);
      setPointsToRedeem(String(res.points_balance ?? ""));
      const earnRate = Number(res.points_earn_per_kes ?? 1000);
      const earnHint =
        earnRate > 0 ? ` · earns 1 pt per ${formatSaleKes(earnRate)} spent` : "";
      onMessage?.(
        `Found ${res.customer_name} — ${res.points_balance} points available${earnHint}`,
      );
    } catch (e) {
      setLoyaltyPreview(null);
      onMessage?.(e instanceof ApiError ? e.message : "Loyalty lookup failed");
    } finally {
      setWorking(false);
    }
  }

  async function applyPoints() {
    if (!cart?.id || !pointsPhone.trim()) return;
    setWorking(true);
    onMessage?.(null);
    try {
      const body = { phone: pointsPhone.trim() };
      if (pointsToRedeem.trim()) body.points = Number(pointsToRedeem);
      const res = await apiRequest(`/sales/carts/${cart.id}/payment/points`, {
        method: "POST",
        body,
      });
      onCartUpdated?.(res.cart);
      setLoyaltyPreview(res.loyalty ?? loyaltyPreview);
      onMessage?.(`Points applied: ${formatSaleKes(res.loyalty?.applied_amount ?? 0)}`);
      closeDialog();
    } catch (e) {
      onMessage?.(e instanceof ApiError ? e.message : "Failed to redeem points");
    } finally {
      setWorking(false);
    }
  }

  async function clearPayments() {
    if (!cart?.id) return;
    setWorking(true);
    try {
      const updated = await apiRequest(`/sales/carts/${cart.id}/payment`, { method: "DELETE" });
      onCartUpdated?.(updated);
      setLoyaltyPreview(null);
      setVoucherCode("");
      setVoucherAmount("");
      setPointsPhone("");
      setPointsToRedeem("");
      setMpesaPhone("");
      onMessage?.("Alternative payments cleared.");
    } catch (e) {
      onMessage?.(e instanceof ApiError ? e.message : "Failed to clear payments");
    } finally {
      setWorking(false);
    }
  }

  function phoneForApi(phone) {
    const digits = normalizeKenyanPhoneInput(phone);
    if (digits.startsWith("254")) return `0${digits.slice(3)}`;
    if (digits.startsWith("7") && digits.length === 9) return `0${digits}`;
    return digits;
  }

  function resolveMpesaApplyAmount(rawAmount) {
    const maxDue = Math.max(0, Math.ceil(Number(amountDue) || 0));
    const entered = Math.ceil(Number(rawAmount) || 0);
    if (entered < 1 || maxDue < 1) return null;
    return Math.min(entered, maxDue);
  }

  function mpesaApplyAmountForPayment(paymentAmount, rawCheckAmount = checkAmount) {
    const payment = Math.ceil(Number(paymentAmount) || 0);
    if (payment < 1) return null;
    const fromField = resolveMpesaApplyAmount(rawCheckAmount);
    if (fromField != null) return Math.min(fromField, payment);
    const maxDue = Math.max(0, Math.ceil(Number(amountDue) || 0));
    if (maxDue < 1) return null;
    return Math.min(payment, maxDue);
  }

  function syncCheckAmountFromMpesaStatus(res) {
    const candidates = res?.candidates ?? [];
    const due = Math.max(0, Math.ceil(Number(res?.amount_due ?? amountDue) || 0));
    if (due < 1) return;

    const stkPaid = Math.ceil(
      Number(res?.stk_paid_amount ?? res?.stk_amount ?? lastStkPayAmountRef.current ?? 0),
    );
    const candidateAmount =
      candidates.length > 0 ? Math.ceil(Number(candidates[0].amount) || 0) : 0;

    let suggested = null;
    if (res?.status === "completed" && stkPaid > 0) {
      suggested = Math.min(stkPaid, due);
    } else if (candidateAmount > 0) {
      suggested = Math.min(candidateAmount, due);
    } else if (lastStkPayAmountRef.current) {
      suggested = Math.min(Math.ceil(lastStkPayAmountRef.current), due);
    }

    if (suggested != null && suggested >= 1) {
      setCheckAmount(String(suggested));
    }
  }

  async function checkMpesaPayments({ silent = false } = {}) {
    const phone = phoneForApi(mpesaPhone);
    if (!phone || !cart?.id) return null;
    if (!silent) setWorking(true);
    try {
      const res = await apiRequest(`/sales/carts/${cart.id}/payment/mpesa/status`, {
        searchParams: { phone },
      });
      if (res.cart) {
        onCartUpdated?.(res.cart);
        if (res.cart.mpesa_phone) setMpesaPhone(res.cart.mpesa_phone);
      }
      const candidates = res.candidates ?? [];
      setMpesaCandidates(candidates);

      if (candidates.length > 0 || res.status === "completed") {
        syncCheckAmountFromMpesaStatus(res);
      }

      if (res.stk_error) {
        setMpesaError(res.stk_error);
        if (!silent) onMessage?.(res.stk_error);
      } else if (res.status === "failed" && res.result_desc) {
        setMpesaError(res.result_desc);
        if (!silent) onMessage?.(res.result_desc);
      } else {
        setMpesaError(null);
        if (res.status === "completed" && candidates.length > 0) {
          setMpesaInfo("M-Pesa payment received. Tap Use payment to apply it to this order.");
        }
      }

      return res;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not check M-Pesa payments.";
      setMpesaError(msg);
      if (!silent) onMessage?.(msg);
      stopMpesaWatch();
      return null;
    } finally {
      if (!silent) setWorking(false);
    }
  }

  useEffect(() => {
    if (!watchingMpesa || activeDialog !== "mpesa" || mpesaMode !== "check" || !cart?.id) {
      return undefined;
    }
    let cancelled = false;

    async function tick() {
      if (cancelled) return;
      await checkMpesaPayments({ silent: true });
      if (!cancelled) {
        pollTimerRef.current = window.setTimeout(tick, 3000);
      }
    }

    void tick();

    return () => {
      cancelled = true;
      if (pollTimerRef.current) {
        window.clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [watchingMpesa, activeDialog, mpesaMode, cart?.id]);

  function startMpesaWatch() {
    const phone = normalizeKenyanPhoneInput(mpesaPhone);
    if (!phone) {
      onMessage?.("Enter the customer M-Pesa number first.");
      return;
    }
    if (!/^(0?7\d{8}|2547\d{8})$/.test(phone)) {
      onMessage?.("Enter a valid Kenyan mobile number like 0712345678.");
      return;
    }
    if (!resolveMpesaApplyAmount(checkAmount) && !lastStkPayAmountRef.current) {
      onMessage?.("Enter the M-Pesa amount the customer paid.");
      return;
    }
    if (!resolveMpesaApplyAmount(checkAmount) && lastStkPayAmountRef.current) {
      setCheckAmount(String(lastStkPayAmountRef.current));
    }
    setMpesaError(null);
    setMpesaInfo("Checking for M-Pesa payments every few seconds…");
    setWatchingMpesa(true);
  }

  async function applyMpesaCandidate(paymentId, paymentAmount) {
    if (!cart?.id || !paymentId) return;
    const cappedApply = mpesaApplyAmountForPayment(paymentAmount);
    if (!cappedApply) {
      onMessage?.("Enter the M-Pesa amount the customer paid.");
      return;
    }
    if (cappedApply < 1) {
      onMessage?.("Payment amount is too small to apply.");
      return;
    }
    setWorking(true);
    setMpesaError(null);
    try {
      const res = await apiRequest(`/sales/carts/${cart.id}/payment/mpesa/apply`, {
        method: "POST",
        body: { payment_id: paymentId, amount: cappedApply },
      });
      onCartUpdated?.(res.cart);
      setMpesaCandidates((prev) => prev.filter((p) => p.id !== paymentId));
      const applied = Number(res.applied_amount ?? 0);
      const remaining = Number(res.amount_due ?? 0);
      const isFullPayment = remaining <= 0.01;
      const msg = `M-Pesa applied: ${formatSaleKes(applied)}${
        res.payment?.transaction_id ? ` (${res.payment.transaction_id})` : ""
      }${isFullPayment ? "" : ` · Balance due ${formatSaleKes(remaining)}`}`;
      onMessage?.(msg);

      if (isFullPayment) {
        stopMpesaWatch();
        closeDialog();
        onCompleteOrder?.(res.cart);
      } else {
        const nextDue = Math.max(0, Math.ceil(remaining));
        setCheckAmount(nextDue > 0 ? String(nextDue) : "");
        setMpesaInfo(
          `${formatSaleKes(applied)} applied. Balance due ${formatSaleKes(remaining)} — check for more payments or collect the rest at checkout.`,
        );
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to apply M-Pesa payment.";
      setMpesaError(msg);
      onMessage?.(msg);
    } finally {
      setWorking(false);
    }
  }

  async function skipMpesaCandidate(paymentId) {
    if (!cart?.id || !paymentId) return;
    setWorking(true);
    try {
      const res = await apiRequest(`/sales/carts/${cart.id}/payment/mpesa/skip`, {
        method: "POST",
        body: { payment_id: paymentId },
      });
      setMpesaCandidates(res.candidates ?? []);
      setMpesaInfo("Skipped that payment. Still checking for others…");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to skip payment.";
      setMpesaError(msg);
      onMessage?.(msg);
    } finally {
      setWorking(false);
    }
  }

  async function pushMpesaPayment() {
    const phone = normalizeKenyanPhoneInput(mpesaPhone);
    if (!phone || !cart?.id) return;
    if (!/^(0?7\d{8}|2547\d{8})$/.test(phone)) {
      onMessage?.("Enter a valid Kenyan mobile number like 0712345678.");
      return;
    }

    const maxDue = Math.max(0, Math.ceil(Number(amountDue) || 0));
    if (maxDue < 1) {
      onMessage?.("Nothing to pay on this order.");
      return;
    }

    const entered = Math.ceil(Number(stkAmount) || 0);
    if (entered < 1) {
      onMessage?.("Enter the M-Pesa amount for the STK push.");
      return;
    }
    const payAmount = Math.min(entered, maxDue);

    setWorking(true);
    setMpesaError(null);
    onMessage?.(null);
    try {
      const res = await apiRequest(`/sales/carts/${cart.id}/payment/mpesa/stk-push`, {
        method: "POST",
        body: {
          phone_number: phone.startsWith("254") ? `0${phone.slice(3)}` : phone,
          amount: payAmount,
        },
      });

      if (res.error?.errorMessage) {
        const msg = res.error.errorMessage;
        setMpesaError(msg);
        onMessage?.(msg);
        return;
      }

      if (res.cart) onCartUpdated?.(res.cart);

      lastStkPayAmountRef.current = payAmount;
      setCheckAmount(String(payAmount));

      const customerMessage =
        res.success?.CustomerMessage || `STK push sent to ${phone}. Enter your M-Pesa PIN on the phone.`;
      setMpesaError(null);
      onMessage?.(customerMessage);
      setMpesaMode("check");
      setMpesaInfo("STK sent. Checking for payment every few seconds…");
      setWatchingMpesa(true);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to request M-Pesa push";
      setMpesaError(msg);
      onMessage?.(msg);
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <div className="shrink-0 border-t border-slate-200 bg-slate-50/80 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#0C447C]">
            Pay with
          </p>
          {hasVoucher || hasPoints || hasMpesaPhone || hasMpesaPayment ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => void clearPayments()}
              className="text-[10px] font-semibold uppercase text-slate-500 hover:text-red-600 disabled:opacity-50"
            >
              Clear
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {payButtons.map((btn) => (
            <PayOptionButton
              key={btn.id}
              icon={btn.icon}
              label={btn.label}
              sublabel={btn.sublabel}
              active={btn.active}
              disabled={disabled}
              onClick={(e) => {
                e.preventDefault();
                setActiveDialog(btn.id);
              }}
            />
          ))}
        </div>
      </div>

      <PayOptionDialog
        open={Boolean(activeDialog)}
        title={
          activeDialog === "mpesa"
            ? "M-Pesa"
            : activeDialog === "voucher"
              ? "Voucher"
              : "Redeem points"
        }
        onClose={closeDialog}
        footer={
          activeDialog === "mpesa" ? (
            mpesaMode === "stk" ? (
              <>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={closeDialog}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold uppercase text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={disabled || !mpesaPhone.trim() || !stkAmount.trim()}
                  onClick={() => void pushMpesaPayment()}
                  className="rounded-lg bg-[#185FA5] px-3 py-2.5 text-xs font-bold uppercase text-white hover:bg-[#144f8a] disabled:opacity-50"
                >
                  Push STK
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={closeDialog}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold uppercase text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    disabled ||
                    !mpesaPhone.trim() ||
                    (!resolveMpesaApplyAmount(checkAmount) &&
                      mpesaCandidates.length === 0 &&
                      !lastStkPayAmountRef.current)
                  }
                  onClick={() => (watchingMpesa ? void checkMpesaPayments() : startMpesaWatch())}
                  className="rounded-lg border border-[#185FA5]/30 bg-white px-3 py-2.5 text-xs font-bold uppercase text-[#0C447C] hover:bg-[#E6F1FB] disabled:opacity-50"
                >
                  {watchingMpesa ? "Refresh" : "Check payment"}
                </button>
                {hasMpesaPayment && Number(amountDue) > 0.01 ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      stopMpesaWatch();
                      closeDialog();
                      onPaymentApplied?.();
                    }}
                    className="col-span-2 rounded-lg bg-[#185FA5] px-3 py-2.5 text-xs font-bold uppercase text-white hover:bg-[#144f8a] disabled:opacity-50"
                  >
                    Collect balance ({formatSaleKes(amountDue)})
                  </button>
                ) : null}
              </>
            )
          ) : activeDialog === "voucher" ? (
            <>
              <button
                type="button"
                disabled={disabled}
                onClick={closeDialog}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold uppercase text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={disabled || !voucherCode.trim()}
                onClick={() => void applyVoucher()}
                className="rounded-lg bg-[#185FA5] px-3 py-2.5 text-xs font-bold uppercase text-white hover:bg-[#144f8a] disabled:opacity-50"
              >
                Apply voucher
              </button>
            </>
          ) : activeDialog === "points" ? (
            <>
              <button
                type="button"
                disabled={disabled}
                onClick={closeDialog}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold uppercase text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={disabled || !pointsPhone.trim()}
                onClick={() => void applyPoints()}
                className="rounded-lg bg-[#185FA5] px-3 py-2.5 text-xs font-bold uppercase text-white hover:bg-[#144f8a] disabled:opacity-50"
              >
                Redeem points
              </button>
            </>
          ) : null
        }
      >
        {activeDialog === "mpesa" ? (
          <>
            <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => switchMpesaMode("stk")}
                className={`rounded-md px-2 py-2 text-[10px] font-bold uppercase tracking-wide ${
                  mpesaMode === "stk"
                    ? "bg-white text-[#0C447C] shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                STK push
              </button>
              <button
                type="button"
                onClick={() => switchMpesaMode("check")}
                className={`rounded-md px-2 py-2 text-[10px] font-bold uppercase tracking-wide ${
                  mpesaMode === "check"
                    ? "bg-white text-[#0C447C] shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Check payment
              </button>
            </div>
            <p className="mb-3 text-sm text-slate-600">
              {mpesaMode === "stk" ? (
                <>
                  Send an STK push for any amount up to the balance due of{" "}
                  <strong>{formatSaleKes(Math.max(0, Number(amountDue) || 0))}</strong>. After they
                  pay, use <strong>Check payment</strong> to confirm.
                </>
              ) : (
                <>
                  Customer paid via paybill or M-Pesa directly. Enter their number, the amount they
                  paid, then check for matching payments. Balance due:{" "}
                  <strong>{formatSaleKes(Math.max(0, Number(amountDue) || 0))}</strong>.
                </>
              )}
            </p>
            {mpesaError ? (
              <p
                role="alert"
                className="mb-3 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-medium text-red-800"
              >
                {mpesaError}
              </p>
            ) : null}
            {mpesaInfo ? (
              <p className="mb-3 rounded-lg border border-[#185FA5]/20 bg-[#E6F1FB] px-2.5 py-2 text-xs text-[#0C447C]">
                {mpesaInfo}
              </p>
            ) : null}
            {hasMpesaPayment ? (
              <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs text-emerald-800">
                Applied {formatSaleKes(cart.mpesa_payment_amount)}
                {cart.mpesa_transaction_code ? ` · ${cart.mpesa_transaction_code}` : ""}
              </p>
            ) : null}
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[#0C447C]">
                Mobile number
              </span>
              <input
                ref={mpesaPhoneRef}
                type="tel"
                value={mpesaPhone}
                disabled={disabled || (watchingMpesa && mpesaMode === "check")}
                onChange={(e) => setMpesaPhone(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (mpesaMode === "stk") void pushMpesaPayment();
                  else if (watchingMpesa) void checkMpesaPayments();
                  else startMpesaWatch();
                }}
                placeholder="e.g. 0712345678"
                className={inputCls}
              />
            </label>
            {mpesaMode === "stk" ? (
              <label className="mt-3 block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[#0C447C]">
                  STK amount (KES)
                </span>
                <input
                  ref={stkAmountRef}
                  type="number"
                  min="1"
                  step="1"
                  max={Math.max(1, Math.ceil(Number(amountDue) || 0))}
                  value={stkAmount}
                  disabled={disabled}
                  onChange={(e) => setStkAmount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void pushMpesaPayment();
                    }
                  }}
                  placeholder={`Max ${formatSaleKes(Math.max(0, Number(amountDue) || 0))}`}
                  className={inputCls}
                />
                <p className="mt-1 text-[10px] text-slate-500">
                  Partial payment is allowed — e.g. push KES 50 on a KES 200 order.
                </p>
              </label>
            ) : null}
            {mpesaMode === "check" ? (
              <label className="mt-3 block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[#0C447C]">
                  Amount paid (KES)
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  max={Math.max(1, Math.ceil(Number(amountDue) || 0))}
                  value={checkAmount}
                  disabled={disabled}
                  onChange={(e) => setCheckAmount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (watchingMpesa) void checkMpesaPayments();
                      else startMpesaWatch();
                    }
                  }}
                  placeholder={`Default ${formatSaleKes(Math.max(0, Number(amountDue) || 0))}`}
                  className={inputCls}
                />
                <p className="mt-1 text-[10px] text-slate-500">
                  Defaults to the full balance — lower this for a partial payment (e.g. KES 50 on a
                  KES 200 order).
                </p>
              </label>
            ) : null}
            {mpesaMode === "check" && watchingMpesa ? (
              <p className="mt-2 text-[10px] text-slate-500">
                Auto-checking every few seconds. Use Refresh or wait for a payment to appear.
              </p>
            ) : null}
            {mpesaMode === "check" && mpesaCandidates.length > 0 ? (
              <div className="mt-4 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#0C447C]">
                  Payments found
                </p>
                {mpesaCandidates.map((payment) => (
                  <div
                    key={payment.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {formatSaleKes(payment.amount)}
                        </p>
                        <p className="text-[11px] text-slate-600">
                          {payment.transaction_id}
                          {payment.received_at ? ` · ${formatMpesaTime(payment.received_at)}` : ""}
                        </p>
                        <p className="text-[10px] uppercase text-slate-500">{payment.source}</p>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => void skipMpesaCandidate(payment.id)}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-bold uppercase text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                      >
                        Skip
                      </button>
                      <button
                        type="button"
                        disabled={disabled || !mpesaApplyAmountForPayment(payment.amount)}
                        onClick={() => void applyMpesaCandidate(payment.id, payment.amount)}
                        className="rounded-md bg-[#185FA5] px-2 py-1.5 text-[10px] font-bold uppercase text-white hover:bg-[#144f8a] disabled:opacity-50"
                      >
                        Use {formatSaleKes(mpesaApplyAmountForPayment(payment.amount) ?? 0)}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : mpesaMode === "check" && watchingMpesa ? (
              <p className="mt-3 text-xs text-slate-500">No matching payments yet.</p>
            ) : null}
          </>
        ) : null}
        {activeDialog === "voucher" ? (
          <>
            <p className="mb-3 text-sm text-slate-600">
              Pay fully or partially from a voucher balance.
            </p>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[#0C447C]">
                  Voucher code
                </span>
                <input
                  ref={voucherCodeRef}
                  type="text"
                  value={voucherCode}
                  disabled={disabled}
                  onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                  placeholder="Enter voucher code"
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[#0C447C]">
                  Amount <span className="font-normal normal-case text-slate-500">(optional)</span>
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={voucherAmount}
                  disabled={disabled}
                  onChange={(e) => setVoucherAmount(e.target.value)}
                  placeholder="Leave blank for max"
                  className={inputCls}
                />
              </label>
              {hasVoucher ? (
                <p className="text-xs font-medium text-[#0C447C]">
                  Already applied: {formatSaleKes(cart.voucher_payment_amount)}
                </p>
              ) : null}
            </div>
          </>
        ) : null}
        {activeDialog === "points" ? (
          <>
            <p className="mb-3 text-sm text-slate-600">
              Find the customer by mobile to earn points on this order and redeem if paying with points.
            </p>
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  ref={pointsPhoneRef}
                  type="tel"
                  value={pointsPhone}
                  disabled={disabled}
                  onChange={(e) => setPointsPhone(e.target.value)}
                  placeholder="Customer mobile"
                  className={`${inputCls} min-w-0 flex-1`}
                />
                <button
                  type="button"
                  disabled={disabled || !pointsPhone.trim()}
                  onClick={() => void lookupPoints()}
                  className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Find
                </button>
              </div>
              {loyaltyPreview ? (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700">
                  <span className="font-semibold">{loyaltyPreview.customer_name}</span>
                  <br />
                  {loyaltyPreview.card_number} · {loyaltyPreview.points_balance} pts (
                  {formatSaleKes(loyaltyPreview.max_cash_value)})
                </p>
              ) : null}
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[#0C447C]">
                  Points to redeem
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={pointsToRedeem}
                  disabled={disabled || !loyaltyPreview}
                  onChange={(e) => setPointsToRedeem(e.target.value)}
                  placeholder="Points to redeem"
                  className={inputCls}
                />
              </label>
              {hasPoints ? (
                <p className="text-xs font-medium text-[#0C447C]">
                  Already applied: {formatSaleKes(cart.points_payment_amount)} (
                  {cart.points_redeemed} pts)
                </p>
              ) : (
                <p className="text-[10px] text-slate-500">Registered customers only — not walk-ins.</p>
              )}
            </div>
          </>
        ) : null}
      </PayOptionDialog>
    </>
  );
}
