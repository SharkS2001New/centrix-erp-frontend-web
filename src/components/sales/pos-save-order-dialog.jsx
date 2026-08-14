"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { posModalOverlayClass, posModalPanelClass, renderPosModalPortal } from "@/lib/pos-modal-shell";
import {
  creditCustomerToOption,
  fetchCreditCustomerByNum,
  searchCreditCustomers,
} from "@/lib/credit-customer-search";
import { PosSearchableSelect } from "@/components/sales/pos-searchable-select";
import {
  posPaymentMethodHint,
  resolvePosPaymentMethodCode,
} from "@/lib/pos-edit-payment-adjustment";

import { INPUT_CLASS } from "@/components/catalog/catalog-shared";

const inputCls = INPUT_CLASS;

/**
 * Hold / save order customer picker.
 * Default: walk-in. Toggle "Existing customer" to search registered customers
 * (links customer_num + KRA PIN onto the sale for receipt / eTIMS).
 *
 * When `enableHeldAmountPaid` is on (hold mode), shows Amount Paid + payment method
 * (default Cash; shortcuts C/M/E/K). Enter on name (or amount) holds the order.
 */
export function PosSaveOrderDialog({
  open,
  onClose,
  saving,
  error,
  onSave,
  mode = "save",
  prefillWalkInName = "",
  prefillCustomerNum = "",
  saveStatusLabel = "",
  workflowPipeline = [],
  embedded = false,
  enableHeldAmountPaid = false,
}) {
  const isHold = mode === "hold";
  const capturePaid = isHold && Boolean(enableHeldAmountPaid);
  const [mounted, setMounted] = useState(false);
  /** "walkin" | "existing" */
  const [customerMode, setCustomerMode] = useState("walkin");
  const [walkInName, setWalkInName] = useState("");
  const [customerNum, setCustomerNum] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerOptions, setCustomerOptions] = useState([]);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentMethodInput, setPaymentMethodInput] = useState("CASH");
  const primaryActionRef = useRef(null);
  const walkInNameRef = useRef(null);
  const amountPaidRef = useRef(null);
  const paymentMethodRef = useRef(null);
  const submitLockRef = useRef(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    submitLockRef.current = false;
    if (!open) return;
    const prefillName = String(prefillWalkInName ?? "").trim();
    const prefillNum = String(prefillCustomerNum ?? "").trim();
    const startExisting = Boolean(prefillNum);
    // Don't seed Hold with a generic "Walk-in" label — cashier types the name.
    const genericWalkIn =
      !prefillName ||
      /^walk[\s-]*in(\s*\(auto-held\))?$/i.test(prefillName);
    setCustomerMode(startExisting ? "existing" : "walkin");
    setWalkInName(startExisting || genericWalkIn ? "" : prefillName);
    setCustomerNum(prefillNum);
    setSelectedCustomer(null);
    setCustomerOptions([]);
    setLocalError(null);
    setAmountPaid("");
    setPaymentMethodInput("CASH");

    // Hold: focus the name field so the cashier can type immediately.
    // Retry past any Scan-focus race from the parent screen.
    const focusName = () => {
      if (!startExisting && isHold) {
        walkInNameRef.current?.focus({ preventScroll: true });
        walkInNameRef.current?.select?.();
        return;
      }
      primaryActionRef.current?.focus({ preventScroll: true });
    };
    focusName();
    const focusTimer = window.setTimeout(focusName, 0);
    const focusTimer2 = window.setTimeout(focusName, 50);

    if (!prefillNum) {
      return () => {
        window.clearTimeout(focusTimer);
        window.clearTimeout(focusTimer2);
      };
    }

    let cancelled = false;
    setPrefillLoading(true);
    fetchCreditCustomerByNum(prefillNum)
      .then((customer) => {
        if (cancelled || !customer) return;
        const option = creditCustomerToOption(customer);
        setCustomerNum(option.value);
        setSelectedCustomer(customer);
        setCustomerOptions([option]);
        setCustomerMode("existing");
      })
      .catch(() => {
        if (!cancelled) setLocalError("Could not load the selected customer.");
      })
      .finally(() => {
        if (!cancelled) setPrefillLoading(false);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(focusTimer);
      window.clearTimeout(focusTimer2);
    };
  }, [open, prefillWalkInName, prefillCustomerNum, isHold]);

  const searchCustomersForSelect = useCallback(async (query) => {
    const rows = await searchCreditCustomers(query, { perPage: 30 });
    setCustomerOptions(rows);
    return rows;
  }, []);

  const selectedOption = useMemo(() => {
    if (!customerNum) return null;
    return customerOptions.find((row) => String(row.value) === String(customerNum)) ?? null;
  }, [customerNum, customerOptions]);

  const linkedCustomer = selectedCustomer ?? selectedOption?.customer ?? null;
  const linkedKraPin = String(linkedCustomer?.kra_pin ?? "").trim();

  const resolvedPaymentMethod = useMemo(
    () => resolvePosPaymentMethodCode(paymentMethodInput) || "CASH",
    [paymentMethodInput],
  );

  function switchToWalkIn() {
    setCustomerMode("walkin");
    setCustomerNum("");
    setSelectedCustomer(null);
    setCustomerOptions([]);
    setLocalError(null);
    window.setTimeout(() => {
      walkInNameRef.current?.focus();
      walkInNameRef.current?.select?.();
    }, 0);
  }

  function switchToExisting() {
    setCustomerMode("existing");
    setWalkInName("");
    setLocalError(null);
  }

  function handleCustomerChange(nextValue, option) {
    setCustomerNum(nextValue);
    setSelectedCustomer(option?.customer ?? null);
    setLocalError(null);
    if (capturePaid && nextValue) {
      window.setTimeout(() => amountPaidRef.current?.focus(), 0);
    }
  }

  const handleSave = useCallback(
    (submitMode = "save") => {
      if (saving) return;
      if (customerMode === "walkin") {
        const name = walkInName.trim().toUpperCase();
        if (!name) {
          setLocalError("Enter the walk-in customer's name.");
          return false;
        }
        const payload = { walkIn: true, walkInName: name, hold: submitMode === "hold" };
        if (capturePaid && submitMode === "hold") {
          const raw = String(amountPaid).replace(/,/g, "").trim();
          const paid = raw === "" ? 0 : Number(raw);
          if (!Number.isFinite(paid) || paid < 0) {
            setLocalError("Enter a valid amount paid (0 or more).");
            return false;
          }
          payload.heldAmountPaid = Math.round(paid * 100) / 100;
          payload.heldPaymentMethodCode = resolvedPaymentMethod;
        }
        onSave?.(payload);
        return true;
      }
      if (!customerNum) {
        setLocalError(
          isHold
            ? "Search and select an existing customer to hold this order."
            : "Search and select an existing customer to save this order.",
        );
        return false;
      }
      const customer = linkedCustomer;
      if (!customer) {
        setLocalError("Search and select a valid customer.");
        return false;
      }
      const payload = { walkIn: false, customer, hold: submitMode === "hold" };
      if (capturePaid && submitMode === "hold") {
        const raw = String(amountPaid).replace(/,/g, "").trim();
        const paid = raw === "" ? 0 : Number(raw);
        if (!Number.isFinite(paid) || paid < 0) {
          setLocalError("Enter a valid amount paid (0 or more).");
          return false;
        }
        payload.heldAmountPaid = Math.round(paid * 100) / 100;
        payload.heldPaymentMethodCode = resolvedPaymentMethod;
      }
      onSave?.(payload);
      return true;
    },
    [
      saving,
      customerMode,
      walkInName,
      capturePaid,
      amountPaid,
      resolvedPaymentMethod,
      customerNum,
      isHold,
      linkedCustomer,
      onSave,
    ],
  );

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (saving) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== "Enter") return;
      const target = e.target;
      if (target instanceof HTMLElement) {
        if (target.closest('[role="listbox"]')) return;
        if (target.tagName === "TEXTAREA") return;
      }

      // Hold walk-in: Enter on name holds immediately (amount paid defaults to 0 if blank).
      // Tab to Amount paid first when a deposit should be recorded before hold.
      if (capturePaid) {
        const el = target instanceof HTMLElement ? target : null;
        if (el === walkInNameRef.current || el?.dataset?.holdField === "name") {
          e.preventDefault();
          e.stopPropagation();
          if (submitLockRef.current) return;
          if (handleSave("hold")) submitLockRef.current = true;
          return;
        }
        if (el === amountPaidRef.current || el?.dataset?.holdField === "amount") {
          e.preventDefault();
          e.stopPropagation();
          if (submitLockRef.current) return;
          if (handleSave("hold")) submitLockRef.current = true;
          return;
        }
        if (el === paymentMethodRef.current || el?.dataset?.holdField === "method") {
          e.preventDefault();
          e.stopPropagation();
          if (submitLockRef.current) return;
          if (handleSave("hold")) submitLockRef.current = true;
          return;
        }
      }

      e.preventDefault();
      e.stopPropagation();
      if (submitLockRef.current) return;
      if (handleSave(isHold ? "hold" : "save")) submitLockRef.current = true;
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, saving, onClose, isHold, capturePaid, handleSave]);

  if (!open || !mounted) return null;

  return renderPosModalPortal(
    <div className={`${posModalOverlayClass(embedded)}${embedded ? "" : " bg-black/40"}`}>
      {!embedded ? (
        <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      ) : null}
      <div
        role="dialog"
        aria-modal="true"
        className={`${posModalPanelClass(embedded, "theme-modal flex w-full max-w-md flex-col overflow-hidden rounded-lg border shadow-2xl")}`}
      >
        <div
          className={`classic-pos-themed-dialog-header px-4 py-3 text-white ${
            isHold ? "bg-amber-700" : "bg-[var(--theme-primary)]"
          }`}
        >
          <h2 className="text-center text-sm font-bold tracking-wide">
            {isHold ? "HOLD ORDER" : "SAVE ORDER"}
          </h2>
          {isHold ? (
            <p className="mt-1 text-center text-[11px] text-amber-100 classic-pos-themed-dialog-sub">
              Stock is deducted when the order is held.
            </p>
          ) : saveStatusLabel ? (
            <p className="mt-1 text-center text-[11px] text-blue-100 classic-pos-themed-dialog-sub">
              Workflow status: <strong>{saveStatusLabel}</strong>
              {" · "}
              Created via: <strong>Backoffice</strong>
            </p>
          ) : null}
        </div>
        <div className="p-4">
          {!isHold && workflowPipeline.length > 0 ? (
            <p className="theme-panel mb-3 rounded border px-2.5 py-2 text-[11px] text-[var(--theme-text-muted)]">
              <span className="font-semibold text-[var(--theme-accent-text)]">Order flow: </span>
              {workflowPipeline.map((s) => s.label).join(" → ")}
            </p>
          ) : null}

          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={switchToWalkIn}
              className={`rounded-lg border px-3 py-2 text-xs font-bold uppercase ${
                customerMode === "walkin"
                  ? "border-[var(--theme-primary)] bg-[var(--theme-primary)]/10 text-[var(--theme-primary)]"
                  : "theme-secondary-btn"
              }`}
            >
              Walk-in
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={switchToExisting}
              className={`rounded-lg border px-3 py-2 text-xs font-bold uppercase ${
                customerMode === "existing"
                  ? "border-[var(--theme-primary)] bg-[var(--theme-primary)]/10 text-[var(--theme-primary)]"
                  : "theme-secondary-btn"
              }`}
            >
              Existing customer
            </button>
          </div>

          {customerMode === "walkin" ? (
            <label className="block">
              <span className="theme-accent-label mb-0.5 block text-[11px] font-bold uppercase tracking-wide">
                Walk-in customer name
              </span>
              <input
                ref={walkInNameRef}
                type="text"
                data-hold-field="name"
                className={inputCls}
                value={walkInName}
                onChange={(e) => {
                  setWalkInName(e.target.value);
                  setLocalError(null);
                }}
                placeholder={isHold ? "Type customer name…" : "Customer name"}
                autoComplete="off"
                disabled={saving}
              />
            </label>
          ) : (
            <div className="space-y-2">
              <label className="block">
                <span className="theme-accent-label mb-0.5 block text-[11px] font-bold uppercase tracking-wide">
                  Search existing customer
                </span>
                <PosSearchableSelect
                  value={customerNum}
                  onChange={handleCustomerChange}
                  options={customerOptions}
                  loadOptions={searchCustomersForSelect}
                  minSearchLength={1}
                  loading={prefillLoading}
                  disabled={saving}
                  placeholder="Search by name, phone, PIN, or #"
                  searchPlaceholder="Search by name, phone, KRA PIN, or customer #…"
                  idleSearchLabel="Type a name, phone, KRA PIN, or customer #"
                  emptyLabel="No matching customers"
                  inputClassName={inputCls}
                />
              </label>
              {linkedCustomer ? (
                <div className="theme-panel rounded border px-2.5 py-2 text-[11px]">
                  <p className="font-semibold text-[var(--theme-text)]">
                    {linkedCustomer.customer_name}
                    <span className="theme-text-muted font-normal">
                      {" "}
                      #{linkedCustomer.customer_num}
                    </span>
                  </p>
                  <p className="theme-text-muted mt-0.5">
                    KRA PIN:{" "}
                    <strong className="text-[var(--theme-text)]">
                      {linkedKraPin || "— not on file"}
                    </strong>
                  </p>
                  <p className="theme-text-muted mt-1 text-[10px] leading-relaxed">
                    Selecting this customer links their record (and KRA PIN) to the sale for
                    receipt and tax documents.
                  </p>
                </div>
              ) : (
                <p className="theme-text-muted text-[11px] leading-relaxed">
                  Use for registered customers when the receipt or KRA eTIMS must carry their PIN.
                </p>
              )}
            </div>
          )}

          {capturePaid ? (
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="theme-accent-label mb-0.5 block text-[11px] font-bold uppercase tracking-wide">
                  Amount paid
                </span>
                <input
                  ref={amountPaidRef}
                  type="text"
                  inputMode="decimal"
                  data-hold-field="amount"
                  className={inputCls}
                  value={amountPaid}
                  onChange={(e) => {
                    setAmountPaid(e.target.value);
                    setLocalError(null);
                  }}
                  placeholder="0.00"
                  autoComplete="off"
                  disabled={saving}
                />
                <span className="theme-text-muted mt-1 block text-[10px] leading-relaxed">
                  Optional · Enter on name holds now (0 if blank) · Tab here for a deposit
                </span>
              </label>
              <label className="block">
                <span className="theme-accent-label mb-0.5 block text-[11px] font-bold uppercase tracking-wide">
                  Payment method
                </span>
                <input
                  ref={paymentMethodRef}
                  type="text"
                  data-hold-field="method"
                  className={inputCls}
                  value={paymentMethodInput}
                  onChange={(e) => {
                    setPaymentMethodInput(e.target.value);
                    setLocalError(null);
                  }}
                  onBlur={() => {
                    const resolved = resolvePosPaymentMethodCode(paymentMethodInput) || "CASH";
                    setPaymentMethodInput(resolved);
                  }}
                  placeholder="CASH"
                  autoComplete="off"
                  disabled={saving}
                />
                <span className="theme-text-muted mt-1 block text-[10px] leading-relaxed">
                  Default Cash · {posPaymentMethodHint()} ·{" "}
                  <strong>{resolvedPaymentMethod}</strong>
                </span>
              </label>
            </div>
          ) : null}

          {error || localError ? (
            <p className="theme-alert-error mt-3 rounded px-3 py-2 text-sm">
              {error || localError}
            </p>
          ) : null}
        </div>
        <div className="theme-dialog-footer grid grid-cols-2 gap-2 p-3">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="theme-secondary-btn rounded-lg px-3 py-3 text-xs font-bold uppercase disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          {isHold ? (
            <button
              ref={primaryActionRef}
              type="button"
              disabled={saving || prefillLoading}
              onClick={() => {
                if (submitLockRef.current) return;
                if (handleSave("hold")) submitLockRef.current = true;
              }}
              className="theme-accent-btn rounded-lg px-3 py-3 text-xs font-bold uppercase disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Holding…" : "Hold order"}
            </button>
          ) : (
            <button
              ref={primaryActionRef}
              type="button"
              disabled={saving || prefillLoading}
              onClick={() => {
                if (submitLockRef.current) return;
                if (handleSave("save")) submitLockRef.current = true;
              }}
              className="theme-primary-btn rounded-lg px-3 py-3 text-xs font-bold uppercase disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save order"}
            </button>
          )}
        </div>
      </div>
    </div>,
  );
}
