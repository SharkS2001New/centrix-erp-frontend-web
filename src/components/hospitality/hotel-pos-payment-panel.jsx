"use client";

import { useEffect, useMemo, useState } from "react";
import { SearchableSelect } from "@/components/catalog/catalog-shared";
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
 * Touch-first Collect payment for Hotel POS — tenders from sales settings + Admin payment methods,
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
  initialFolioId = "",
  title = "Collect payment",
  footerHint = null,
  secondaryAction = null,
  completeOrder = null,
  onCompleteOrderOk,
}) {
  const cfg = paymentConfig ?? {};
  const tenders = Array.isArray(cfg.tenders) ? cfg.tenders : [];
  const total = round2(billTotal);

  const [amounts, setAmounts] = useState({});
  const [mpesaCode, setMpesaCode] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  const [roomCharge, setRoomCharge] = useState(0);
  const [folioId, setFolioId] = useState("");
  const [localError, setLocalError] = useState(null);
  const [keypad, setKeypad] = useState(null); // { method, title, value }

  useEffect(() => {
    if (!open) return;
    setAmounts({});
    setMpesaCode("");
    setChequeNo("");
    setRoomCharge(preferRoomCharge && roomChargeEnabled && total > 0 ? total : 0);
    setFolioId(preferRoomCharge && initialFolioId ? String(initialFolioId) : "");
    setLocalError(null);
    setKeypad(null);
  }, [open, total, preferRoomCharge, roomChargeEnabled, initialFolioId]);

  useEffect(() => {
    if (error) setLocalError(error);
  }, [error]);

  useEffect(() => {
    if (!completeOrder) return undefined;
    function onKey(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        onCompleteOrderOk?.();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [completeOrder, onCompleteOrderOk]);

  const tenderCodes = useMemo(() => tenders.map((row) => row.code), [tenders]);

  const amountPaid = useMemo(() => {
    const fromTenders = tenderCodes.reduce((sum, code) => sum + n(amounts[code]), 0);
    return round2(fromTenders + (roomChargeEnabled ? roomCharge : 0));
  }, [amounts, tenderCodes, roomCharge, roomChargeEnabled]);

  const balanceDue = round2(Math.max(0, total - amountPaid));
  const changeDue = round2(Math.max(0, amountPaid - total));

  function amountExcluding(method) {
    const fromTenders = tenderCodes.reduce(
      (sum, code) => sum + (code === method ? 0 : n(amounts[code])),
      0,
    );
    const room = roomChargeEnabled && method !== "ROOM" ? roomCharge : 0;
    return round2(Math.max(0, total - fromTenders - room));
  }

  function setMethodAmount(method, value) {
    const v = round2(value);
    if (method === "ROOM") {
      setRoomCharge(v);
      return;
    }
    setAmounts((prev) => ({ ...prev, [method]: v }));
  }

  function payFull(method) {
    setAmounts({});
    setRoomCharge(0);
    setMethodAmount(method, total);
  }

  function payBalance(method) {
    setMethodAmount(method, amountExcluding(method));
  }

  function openKeypad(method, title) {
    const current = method === "ROOM" ? roomCharge : n(amounts[method]);
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
    const mpesaTender = tenders.find((row) => row.kind === "mpesa");
    if (mpesaTender && cfg.enableMpesaCode && n(amounts[mpesaTender.code]) > 0 && !mpesaCode.trim()) {
      setLocalError("Enter the M-Pesa transaction code.");
      return;
    }
    const chequeTender = tenders.find((row) => row.kind === "cheque");
    if (chequeTender && cfg.showChequeNumber && n(amounts[chequeTender.code]) > 0 && !chequeNo.trim()) {
      setLocalError("Enter the cheque number.");
      return;
    }

    const payments = [];
    for (const tender of tenders) {
      const amount = round2(amounts[tender.code]);
      if (amount <= 0) continue;
      const payment = { method_code: tender.code, amount };
      if (tender.kind === "mpesa" && mpesaCode.trim()) payment.reference = mpesaCode.trim();
      if (tender.kind === "cheque" && chequeNo.trim()) payment.reference = chequeNo.trim();
      payments.push(payment);
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

  if (!open && !completeOrder) return null;

  const methodBlockProps = {
    saving,
    total,
    onPayFull: payFull,
    onPayBalance: payBalance,
    onOpenKeypad: openKeypad,
  };

  if (completeOrder) {
    return (
      <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-3 sm:items-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="hotel-pos-order-complete-title"
          className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-2xl"
        >
          <div className="border-b border-[var(--theme-border)] px-4 py-3">
            <h2
              id="hotel-pos-order-complete-title"
              className="text-center text-sm font-bold uppercase tracking-wide"
            >
              Order complete
            </h2>
          </div>
          <div className="space-y-2 px-4 py-5 text-center">
            {completeOrder.checkNumber ? (
              <p className="text-base">
                Order no{" "}
                <strong className="font-mono text-2xl tracking-tight">{completeOrder.checkNumber}</strong>
                {completeOrder.total != null ? (
                  <span className="mt-1 block text-lg font-semibold tabular-nums">
                    {formatHotelMoney(completeOrder.total)}
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="text-sm">Payment recorded.</p>
            )}
            {completeOrder.message ? (
              <p className="text-sm text-emerald-700 dark:text-emerald-400">{completeOrder.message}</p>
            ) : null}
            <p className="text-sm font-medium">Press OK to continue to the next order.</p>
          </div>
          <div className="border-t border-[var(--theme-border)] p-3">
            <button
              type="button"
              autoFocus
              onClick={() => onCompleteOrderOk?.()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onCompleteOrderOk?.();
                }
              }}
              className="theme-primary-btn w-full rounded-xl py-3.5 text-xs font-bold uppercase"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-3 sm:items-center">
        <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-2xl">
          <div className="shrink-0 border-b border-[var(--theme-border)] px-4 py-3">
            <h2 className="text-center text-sm font-bold uppercase tracking-wide">{title}</h2>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-[var(--theme-page-bg)] px-2 py-4 sm:px-3 sm:py-5">
                <dt className="text-xs font-bold uppercase tracking-wide theme-subtext sm:text-sm">Bill</dt>
                <dd className="mt-1.5 text-3xl font-extrabold tabular-nums leading-none sm:text-4xl">
                  {formatHotelMoney(total)}
                </dd>
              </div>
              <div className="rounded-2xl bg-[var(--theme-page-bg)] px-2 py-4 sm:px-3 sm:py-5">
                <dt className="text-xs font-bold uppercase tracking-wide theme-subtext sm:text-sm">Paid</dt>
                <dd className="mt-1.5 text-3xl font-extrabold tabular-nums leading-none text-emerald-700 sm:text-4xl dark:text-emerald-400">
                  {formatHotelMoney(amountPaid)}
                </dd>
              </div>
              <div className="rounded-2xl bg-[var(--theme-page-bg)] px-2 py-4 sm:px-3 sm:py-5">
                <dt className="text-xs font-bold uppercase tracking-wide theme-subtext sm:text-sm">
                  {changeDue > 0 ? "Change" : "Due"}
                </dt>
                <dd
                  className={`mt-1.5 text-3xl font-extrabold tabular-nums leading-none sm:text-4xl ${
                    changeDue > 0
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-amber-700 dark:text-amber-400"
                  }`}
                >
                  {formatHotelMoney(changeDue > 0 ? changeDue : balanceDue)}
                </dd>
              </div>
            </dl>
            {footerHint ? <p className="theme-subtext mt-2 text-center text-[11px]">{footerHint}</p> : null}
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {tenders.map((tender) => (
              <HotelPosMethodBlock
                key={tender.code}
                {...methodBlockProps}
                method={tender.code}
                label={tender.label}
                value={n(amounts[tender.code])}
                balanceForMethod={amountExcluding(tender.code)}
                extra={
                  tender.kind === "mpesa" && cfg.enableMpesaCode ? (
                    <input
                      className="theme-input mt-2 w-full rounded-xl px-3 py-2 text-sm"
                      placeholder="M-Pesa code"
                      value={mpesaCode}
                      onChange={(e) => setMpesaCode(e.target.value)}
                    />
                  ) : tender.kind === "cheque" && cfg.showChequeNumber ? (
                    <input
                      className="theme-input mt-2 w-full rounded-xl px-3 py-2 text-sm"
                      placeholder="Cheque number"
                      value={chequeNo}
                      onChange={(e) => setChequeNo(e.target.value)}
                    />
                  ) : null
                }
              />
            ))}

            {roomChargeEnabled ? (
              <HotelPosMethodBlock
                {...methodBlockProps}
                method="ROOM"
                label="Room charge"
                value={roomCharge}
                balanceForMethod={amountExcluding("ROOM")}
                extra={
                  <SearchableSelect
                    className="theme-input mt-2 w-full rounded-xl px-3 py-2 text-sm"
                    value={folioId}
                    onChange={setFolioId}
                    placeholder="Select open folio…"
                    options={[
                      { value: "", label: "Select open folio…" },
                      ...(openFolios || []).map((f) => ({
                        value: String(f.id),
                        label: `${f.folio_number} · ${f.guest_name}${f.room_number ? ` · Rm ${f.room_number}` : ""}`,
                      })),
                    ]}
                  />
                }
              />
            ) : null}

            {localError ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-900">
                {localError}
              </p>
            ) : null}

            {tenders.length === 0 && !roomChargeEnabled ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950">
                No payment methods are enabled for this organization. Ask an admin to activate Cash,
                M-Pesa, Equity, or other methods under Sales settings or Payment methods.
              </p>
            ) : null}
          </div>

          <div className="shrink-0 space-y-2 border-t border-[var(--theme-border)] p-3">
            {secondaryAction ? (
              <button
                type="button"
                disabled={saving || secondaryAction.disabled}
                onClick={() => secondaryAction.onClick?.()}
                className="theme-secondary-btn w-full rounded-xl py-2.5 text-[10px] font-bold uppercase"
              >
                {secondaryAction.label}
              </button>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
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
                disabled={
                  saving ||
                  amountPaid <= 0 ||
                  (!allowPartial && amountPaid + 0.001 < total)
                }
                onClick={() => void handleConfirm()}
                className="theme-primary-btn rounded-xl py-3.5 text-xs font-bold uppercase disabled:opacity-40"
              >
                {saving ? "Saving…" : allowPartial && amountPaid + 0.001 < total ? "Record payment" : "Complete payment"}
              </button>
            </div>
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
