"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiRequest, ApiError } from "@/lib/api";
import { formatSaleKes } from "@/lib/sales";

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm outline-none focus:border-[#185FA5] focus:ring-2 focus:ring-[#185FA5]/20";

function PayOptionDialog({ open, title, onClose, children, footer }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
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
      className={`flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2.5 text-center transition-colors disabled:opacity-40 ${
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

export function PosCartPaymentOptions({
  cart,
  busy,
  enableVouchers,
  enablePoints,
  enableMpesa,
  onCartUpdated,
  onMessage,
}) {
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherAmount, setVoucherAmount] = useState("");
  const [pointsPhone, setPointsPhone] = useState("");
  const [pointsToRedeem, setPointsToRedeem] = useState("");
  const [loyaltyPreview, setLoyaltyPreview] = useState(null);
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [working, setWorking] = useState(false);
  const [activeDialog, setActiveDialog] = useState(null);
  const mpesaPhoneRef = useRef(null);
  const voucherCodeRef = useRef(null);
  const pointsPhoneRef = useRef(null);

  useEffect(() => {
    setMpesaPhone(cart?.mpesa_phone ?? "");
  }, [cart?.id, cart?.mpesa_phone]);

  useEffect(() => {
    if (!activeDialog) return;
    const t = window.setTimeout(() => {
      if (activeDialog === "mpesa") mpesaPhoneRef.current?.focus();
      if (activeDialog === "voucher") voucherCodeRef.current?.focus();
      if (activeDialog === "points") pointsPhoneRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [activeDialog]);

  const hasVoucher = Number(cart?.voucher_payment_amount ?? 0) > 0;
  const hasPoints = Number(cart?.points_payment_amount ?? 0) > 0;
  const hasMpesaPhone = Boolean(String(cart?.mpesa_phone ?? "").trim());
  const showSection = enableVouchers || enablePoints || enableMpesa;

  const payButtons = useMemo(() => {
    const items = [];
    if (enableMpesa) {
      items.push({
        id: "mpesa",
        icon: "📲",
        label: "M-Pesa",
        sublabel: hasMpesaPhone ? cart.mpesa_phone : "STK push",
        active: hasMpesaPhone,
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
    hasVoucher,
    hasPoints,
    cart?.mpesa_phone,
    cart?.voucher_payment_amount,
    cart?.points_redeemed,
  ]);

  if (!showSection) return null;

  const disabled = busy || working || !cart?.lines?.length;

  function closeDialog() {
    setActiveDialog(null);
  }

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

  async function pushMpesaPayment() {
    const phone = mpesaPhone.trim();
    if (!phone || !cart?.id) return;
    setWorking(true);
    onMessage?.(null);
    try {
      const updated = await apiRequest(`/sales/carts/${cart.id}/payment/extras`, {
        method: "PATCH",
        body: { mpesa_phone: phone },
      });
      onCartUpdated?.(updated);
      onMessage?.(`M-Pesa push requested to ${phone}.`);
      closeDialog();
    } catch (e) {
      onMessage?.(e instanceof ApiError ? e.message : "Failed to request M-Pesa push");
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
          {hasVoucher || hasPoints || hasMpesaPhone ? (
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
              onClick={() => setActiveDialog(btn.id)}
            />
          ))}
        </div>
      </div>

      <PayOptionDialog
        open={activeDialog === "mpesa"}
        title="M-Pesa"
        onClose={closeDialog}
        footer={
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
              disabled={disabled || !mpesaPhone.trim()}
              onClick={() => void pushMpesaPayment()}
              className="rounded-lg bg-[#185FA5] px-3 py-2.5 text-xs font-bold uppercase text-white hover:bg-[#144f8a] disabled:opacity-50"
            >
              Push payment
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-600">
          Enter the customer&apos;s M-Pesa number to send an STK push for this order.
        </p>
        <label className="block">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[#0C447C]">
            Mobile number
          </span>
          <input
            ref={mpesaPhoneRef}
            type="tel"
            value={mpesaPhone}
            disabled={disabled}
            onChange={(e) => setMpesaPhone(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void pushMpesaPayment();
              }
            }}
            placeholder="e.g. 0712345678"
            className={inputCls}
          />
        </label>
      </PayOptionDialog>

      <PayOptionDialog
        open={activeDialog === "voucher"}
        title="Voucher"
        onClose={closeDialog}
        footer={
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
        }
      >
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
      </PayOptionDialog>

      <PayOptionDialog
        open={activeDialog === "points"}
        title="Redeem points"
        onClose={closeDialog}
        footer={
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
        }
      >
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
      </PayOptionDialog>
    </>
  );
}
