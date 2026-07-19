"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { posModalOverlayClass, posModalPanelClass, renderPosModalPortal } from "@/lib/pos-modal-shell";
import {
  creditCustomerToOption,
  fetchCreditCustomerByNum,
  searchCreditCustomers,
} from "@/lib/credit-customer-search";
import { PosSearchableSelect } from "@/components/sales/pos-searchable-select";

import { INPUT_CLASS } from "@/components/catalog/catalog-shared";

const inputCls = INPUT_CLASS;

/**
 * Hold / save order customer picker.
 * Default: walk-in. Toggle "Existing customer" to search registered customers
 * (links customer_num + KRA PIN onto the sale for receipt / eTIMS).
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
}) {
  const isHold = mode === "hold";
  const [mounted, setMounted] = useState(false);
  /** "walkin" | "existing" */
  const [customerMode, setCustomerMode] = useState("walkin");
  const [walkInName, setWalkInName] = useState("");
  const [customerNum, setCustomerNum] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerOptions, setCustomerOptions] = useState([]);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [localError, setLocalError] = useState(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prefillName = String(prefillWalkInName ?? "").trim();
    const prefillNum = String(prefillCustomerNum ?? "").trim();
    const startExisting = Boolean(prefillNum);
    setCustomerMode(startExisting ? "existing" : "walkin");
    setWalkInName(prefillName);
    setCustomerNum(prefillNum);
    setSelectedCustomer(null);
    setCustomerOptions([]);
    setLocalError(null);

    if (!prefillNum) return;

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
    };
  }, [open, prefillWalkInName, prefillCustomerNum]);

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

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === "Escape" && !saving) onClose?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, saving, onClose]);

  function switchToWalkIn() {
    setCustomerMode("walkin");
    setCustomerNum("");
    setSelectedCustomer(null);
    setCustomerOptions([]);
    setLocalError(null);
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
  }

  function handleSave(submitMode = "save") {
    if (customerMode === "walkin") {
      const name = walkInName.trim();
      if (!name) {
        setLocalError("Enter the walk-in customer's name.");
        return;
      }
      onSave?.({ walkIn: true, walkInName: name, hold: submitMode === "hold" });
      return;
    }
    if (!customerNum) {
      setLocalError(
        isHold
          ? "Search and select an existing customer to hold this order."
          : "Search and select an existing customer to save this order.",
      );
      return;
    }
    const customer = linkedCustomer;
    if (!customer) {
      setLocalError("Search and select a valid customer.");
      return;
    }
    onSave?.({ walkIn: false, customer, hold: submitMode === "hold" });
  }

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
        <div className={`px-4 py-3 text-white ${isHold ? "bg-amber-700" : "bg-[var(--theme-primary)]"}`}>
          <h2 className="text-center text-sm font-bold tracking-wide">
            {isHold ? "HOLD ORDER" : "SAVE ORDER"}
          </h2>
          {isHold ? (
            <p className="mt-1 text-center text-[11px] text-amber-100">
              Stock is deducted when the order is held.
            </p>
          ) : saveStatusLabel ? (
            <p className="mt-1 text-center text-[11px] text-blue-100">
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
                type="text"
                className={inputCls}
                value={walkInName}
                onChange={(e) => {
                  setWalkInName(e.target.value);
                  setLocalError(null);
                }}
                placeholder="Customer name"
                disabled={saving}
                autoFocus
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

          {error || localError ? (
            <p className="theme-alert-error mt-3 rounded px-3 py-2 text-sm">
              {error || localError}
            </p>
          ) : null}
        </div>
        <div className="theme-dialog-footer grid grid-cols-2 gap-2 p-3">
          {isHold ? (
            <button
              type="button"
              disabled={saving || prefillLoading}
              onClick={() => handleSave("hold")}
              className="theme-accent-btn rounded-lg px-3 py-3 text-xs font-bold uppercase disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Holding…" : "Hold order"}
            </button>
          ) : (
            <button
              type="button"
              disabled={saving || prefillLoading}
              onClick={() => handleSave("save")}
              className="theme-primary-btn rounded-lg px-3 py-3 text-xs font-bold uppercase disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save order"}
            </button>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="theme-secondary-btn rounded-lg px-3 py-3 text-xs font-bold uppercase disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
  );
}
