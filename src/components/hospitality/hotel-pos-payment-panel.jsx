"use client";

import { useEffect, useMemo, useState } from "react";
import { formatHotelMoney } from "@/lib/hotel-pos-settings";
import { HotelPosAmountKeypad } from "@/components/hospitality/hotel-pos-amount-keypad";

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? Math.max(0, x) : 0;
}

function round2(v) {
  return Math.round(n(v) * 100) / 100;
}

function HotelPosMethodBlock({
  method,
  label,
  value,
  extra = null,
  saving = false,
  total = 0,
  balanceForMethod = 0,
  onPayFull,
  onPayBalance,
  onOpenKeypad,
}) {
  return (
    <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-page-bg)] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--theme-accent-text)]">
          {label}
        </p>
        <p className="text-lg font-bold tabular-nums">{formatHotelMoney(value)}</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          disabled={saving || total <= 0}
          onClick={() => onPayFull?.(method)}
          className="theme-primary-btn rounded-xl px-2 py-2.5 text-[10px] font-bold uppercase leading-tight disabled:opacity-40"
        >
          Full
          <span className="mt-0.5 block font-semibold normal-case opacity-90">
            {formatHotelMoney(total)}
          </span>
        </button>
        <button
          type="button"
          disabled={saving || balanceForMethod <= 0}
          onClick={() => onPayBalance?.(method)}
          className="theme-secondary-btn rounded-xl px-2 py-2.5 text-[10px] font-bold uppercase leading-tight disabled:opacity-40"
          title="Pay remaining balance after other methods"
        >
          Balance
          <span className="mt-0.5 block font-semibold normal-case opacity-90">
            {formatHotelMoney(balanceForMethod)}
          </span>
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => onOpenKeypad?.(method, label)}
          className="theme-secondary-btn rounded-xl px-2 py-2.5 text-[10px] font-bold uppercase leading-tight disabled:opacity-40"
        >
          Amount
          <span className="mt-0.5 block font-semibold normal-case opacity-90">Keypad</span>
        </button>
      </div>
      {extra}
    </div>
  );
}

/**
 * Touch-first Collect payment for Hotel POS — same methods as retail POS payment config,
 * with Full / Balance / Keypad taps for amounts (split-payment aware).
 */
export function HotelPosPaymentPanel({
  open,
  onClose,
  billTotal = 0,
  paymentConfig = {},
  saving = false,
  error = null,
  onComplete,
  allowPartial = false,
  roomChargeEnabled = false,
  openFolios = [],
  preferRoomCharge = false,
}) {
  const cfg = paymentConfig ?? {};
  const total = round2(billTotal);

  const [cash, setCash] = useState(0);
  const [mpesa, setMpesa] = useState(0);
  const [mpesaCode, setMpesaCode] = useState("");
  const [equity, setEquity] = useState(0);
  const [kcb, setKcb] = useState(0);
  const [otherBank, setOtherBank] = useState(0);
  const [bankType, setBankType] = useState("");
  const [bankAmount, setBankAmount] = useState(0);
  const [bankRef, setBankRef] = useState("");
  const [cheque, setCheque] = useState(0);
  const [chequeNo, setChequeNo] = useState("");
  const [roomCharge, setRoomCharge] = useState(0);
  const [folioId, setFolioId] = useState("");
  const [localError, setLocalError] = useState(null);
  const [keypad, setKeypad] = useState(null); // { method, title, value }

  useEffect(() => {
    if (!open) return;
    setCash(0);
    setMpesa(0);
    setMpesaCode("");
    setEquity(0);
    setKcb(0);
    setOtherBank(0);
    setBankType("");
    setBankAmount(0);
    setBankRef("");
    setCheque(0);
    setChequeNo("");
    setRoomCharge(preferRoomCharge && roomChargeEnabled && total > 0 ? total : 0);
    setFolioId("");
    setLocalError(null);
    setKeypad(null);
  }, [open, total, preferRoomCharge, roomChargeEnabled]);

  useEffect(() => {
    if (error) setLocalError(error);
  }, [error]);

  const amountPaid = useMemo(() => {
    let bank = 0;
    if (cfg.useBankSelect) bank = bankAmount;
    else bank = equity + kcb + otherBank;
    return round2(
      cash +
        (cfg.enableMpesaAmount ? mpesa : 0) +
        bank +
        (cfg.showCheque ? cheque : 0) +
        (roomChargeEnabled ? roomCharge : 0),
    );
  }, [
    cash,
    mpesa,
    equity,
    kcb,
    otherBank,
    bankAmount,
    cheque,
    roomCharge,
    roomChargeEnabled,
    cfg.useBankSelect,
    cfg.enableMpesaAmount,
    cfg.showCheque,
  ]);

  const balanceDue = round2(Math.max(0, total - amountPaid));
  const changeDue = round2(Math.max(0, amountPaid - total));

  function amountExcluding(method) {
    const parts = {
      cash,
      mpesa: cfg.enableMpesaAmount ? mpesa : 0,
      equity: !cfg.useBankSelect && cfg.showEquityBank ? equity : 0,
      kcb: !cfg.useBankSelect && cfg.showKcbBank ? kcb : 0,
      other: !cfg.useBankSelect && cfg.showOtherBank ? otherBank : 0,
      bank: cfg.useBankSelect && cfg.showBankAmount ? bankAmount : 0,
      cheque: cfg.showCheque ? cheque : 0,
      room: roomChargeEnabled ? roomCharge : 0,
    };
    const sum = Object.entries(parts)
      .filter(([key]) => key !== method)
      .reduce((acc, [, val]) => acc + n(val), 0);
    return round2(Math.max(0, total - sum));
  }

  function setMethodAmount(method, value) {
    const v = round2(value);
    switch (method) {
      case "cash":
        setCash(v);
        break;
      case "mpesa":
        setMpesa(v);
        break;
      case "equity":
        setEquity(v);
        break;
      case "kcb":
        setKcb(v);
        break;
      case "other":
        setOtherBank(v);
        break;
      case "bank":
        setBankAmount(v);
        break;
      case "cheque":
        setCheque(v);
        break;
      case "room":
        setRoomCharge(v);
        break;
      default:
        break;
    }
  }

  function payFull(method) {
    // Full bill on this method; clear other tenders.
    setCash(0);
    setMpesa(0);
    setEquity(0);
    setKcb(0);
    setOtherBank(0);
    setBankAmount(0);
    setCheque(0);
    setRoomCharge(0);
    setMethodAmount(method, total);
  }

  function payBalance(method) {
    setMethodAmount(method, amountExcluding(method));
  }

  function openKeypad(method, title) {
    const current = {
      cash,
      mpesa,
      equity,
      kcb,
      other: otherBank,
      bank: bankAmount,
      cheque,
      room: roomCharge,
    }[method];
    setKeypad({ method, title, value: String(current || 0) });
  }

  async function handleConfirm() {
    setLocalError(null);
    if (amountPaid <= 0) {
      setLocalError("Enter a payment amount.");
      return;
    }
    if (roomChargeEnabled && roomCharge > 0 && !folioId) {
      setLocalError("Select a guest folio for room charge.");
      return;
    }
    if (!allowPartial && amountPaid + 0.001 < total) {
      setLocalError("Payment total is less than the bill. Use Pay balance on a method, or enter more.");
      return;
    }
    if (cfg.enableMpesaAmount && cfg.enableMpesaCode && mpesa > 0 && !mpesaCode.trim()) {
      setLocalError("Enter the M-Pesa transaction code.");
      return;
    }
    if (cfg.useBankSelect && bankAmount > 0 && !bankType) {
      setLocalError("Select a bank.");
      return;
    }
    if (cfg.showCheque && cfg.showChequeNumber && cheque > 0 && !chequeNo.trim()) {
      setLocalError("Enter the cheque number.");
      return;
    }

    const payments = [];
    if (cash > 0) payments.push({ method_code: "CASH", amount: cash });
    if (cfg.enableMpesaAmount && mpesa > 0) {
      payments.push({
        method_code: "MPESA",
        amount: mpesa,
        reference: mpesaCode.trim() || null,
      });
    }
    if (cfg.useBankSelect && bankAmount > 0) {
      payments.push({
        method_code: bankType || "BANK",
        amount: bankAmount,
        reference: bankRef.trim() || null,
      });
    } else {
      if (cfg.showEquityBank && equity > 0) payments.push({ method_code: "EQUITY", amount: equity });
      if (cfg.showKcbBank && kcb > 0) payments.push({ method_code: "KCB", amount: kcb });
      if (cfg.showOtherBank && otherBank > 0) {
        payments.push({ method_code: "OTHER", amount: otherBank });
      }
    }
    if (cfg.showCheque && cheque > 0) {
      payments.push({
        method_code: "CHEQUE",
        amount: cheque,
        reference: chequeNo.trim() || null,
      });
    }
    if (roomChargeEnabled && roomCharge > 0) {
      payments.push({ method_code: "ROOM", amount: roomCharge });
    }

    try {
      await onComplete?.({
        payments,
        amount_paid: amountPaid,
        bill_total: total,
        folio_id: roomCharge > 0 && folioId ? Number(folioId) : undefined,
      });
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Payment failed");
    }
  }

  if (!open) return null;

  const methodBlockProps = {
    saving,
    total,
    onPayFull: payFull,
    onPayBalance: payBalance,
    onOpenKeypad: openKeypad,
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-3 sm:items-center">
        <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-2xl">
          <div className="shrink-0 border-b border-[var(--theme-border)] px-4 py-3">
            <h2 className="text-center text-sm font-bold uppercase tracking-wide">Collect payment</h2>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl bg-[var(--theme-page-bg)] px-2 py-2">
                <dt className="theme-subtext">Bill</dt>
                <dd className="text-sm font-bold">{formatHotelMoney(total)}</dd>
              </div>
              <div className="rounded-xl bg-[var(--theme-page-bg)] px-2 py-2">
                <dt className="theme-subtext">Paid</dt>
                <dd className="text-sm font-bold">{formatHotelMoney(amountPaid)}</dd>
              </div>
              <div className="rounded-xl bg-[var(--theme-page-bg)] px-2 py-2">
                <dt className="theme-subtext">{changeDue > 0 ? "Change" : "Due"}</dt>
                <dd className="text-sm font-bold">
                  {formatHotelMoney(changeDue > 0 ? changeDue : balanceDue)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            <HotelPosMethodBlock
              {...methodBlockProps}
              method="cash"
              label="Cash"
              value={cash}
              balanceForMethod={amountExcluding("cash")}
            />

            {cfg.enableMpesaAmount ? (
              <HotelPosMethodBlock
                {...methodBlockProps}
                method="mpesa"
                label="M-Pesa"
                value={mpesa}
                balanceForMethod={amountExcluding("mpesa")}
                extra={
                  cfg.enableMpesaCode ? (
                    <input
                      className="theme-input mt-2 w-full rounded-xl px-3 py-2 text-sm"
                      placeholder="M-Pesa code"
                      value={mpesaCode}
                      onChange={(e) => setMpesaCode(e.target.value)}
                    />
                  ) : null
                }
              />
            ) : null}

            {cfg.useBankSelect && cfg.bankOptions?.length > 0 ? (
              <div className="space-y-2">
                <select
                  className="theme-input w-full rounded-xl px-3 py-2.5 text-sm"
                  value={bankType}
                  onChange={(e) => setBankType(e.target.value)}
                >
                  {cfg.bankOptions.map((o) => (
                    <option key={o.value || "none"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {cfg.showBankAmount ? (
                  <HotelPosMethodBlock
                    {...methodBlockProps}
                    method="bank"
                    label="Bank"
                    value={bankAmount}
                    balanceForMethod={amountExcluding("bank")}
                    extra={
                      <input
                        className="theme-input mt-2 w-full rounded-xl px-3 py-2 text-sm"
                        placeholder="Bank reference"
                        value={bankRef}
                        onChange={(e) => setBankRef(e.target.value)}
                      />
                    }
                  />
                ) : null}
              </div>
            ) : null}

            {!cfg.useBankSelect && cfg.showEquityBank ? (
              <HotelPosMethodBlock
                {...methodBlockProps}
                method="equity"
                label="Equity Bank"
                value={equity}
                balanceForMethod={amountExcluding("equity")}
              />
            ) : null}
            {!cfg.useBankSelect && cfg.showKcbBank ? (
              <HotelPosMethodBlock
                {...methodBlockProps}
                method="kcb"
                label="KCB"
                value={kcb}
                balanceForMethod={amountExcluding("kcb")}
              />
            ) : null}
            {!cfg.useBankSelect && cfg.showOtherBank ? (
              <HotelPosMethodBlock
                {...methodBlockProps}
                method="other"
                label={cfg.otherBankLabel || "Other bank"}
                value={otherBank}
                balanceForMethod={amountExcluding("other")}
              />
            ) : null}

            {cfg.showCheque ? (
              <HotelPosMethodBlock
                {...methodBlockProps}
                method="cheque"
                label="Cheque"
                value={cheque}
                balanceForMethod={amountExcluding("cheque")}
                extra={
                  cfg.showChequeNumber ? (
                    <input
                      className="theme-input mt-2 w-full rounded-xl px-3 py-2 text-sm"
                      placeholder="Cheque number"
                      value={chequeNo}
                      onChange={(e) => setChequeNo(e.target.value)}
                    />
                  ) : null
                }
              />
            ) : null}

            {roomChargeEnabled ? (
              <HotelPosMethodBlock
                {...methodBlockProps}
                method="room"
                label="Room charge"
                value={roomCharge}
                balanceForMethod={amountExcluding("room")}
                extra={
                  <select
                    className="theme-input mt-2 w-full rounded-xl px-3 py-2 text-sm"
                    value={folioId}
                    onChange={(e) => setFolioId(e.target.value)}
                  >
                    <option value="">Select open folio…</option>
                    {(openFolios || []).map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.folio_number} · {f.guest_name}
                        {f.room_number ? ` · Rm ${f.room_number}` : ""}
                      </option>
                    ))}
                  </select>
                }
              />
            ) : null}

            {localError ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-900">
                {localError}
              </p>
            ) : null}
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-[var(--theme-border)] p-3">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="theme-secondary-btn rounded-xl py-3.5 text-xs font-bold uppercase"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || amountPaid + 0.001 < total}
              onClick={() => void handleConfirm()}
              className="theme-primary-btn rounded-xl py-3.5 text-xs font-bold uppercase disabled:opacity-40"
            >
              {saving ? "Saving…" : "Complete payment"}
            </button>
          </div>
        </div>
      </div>

      <HotelPosAmountKeypad
        open={Boolean(keypad)}
        title={keypad?.title ? `${keypad.title} amount` : "Enter amount"}
        initialValue={keypad?.value ?? "0"}
        onCancel={() => setKeypad(null)}
        onConfirm={(value) => {
          if (keypad?.method) setMethodAmount(keypad.method, value);
          setKeypad(null);
        }}
      />
    </>
  );
}
