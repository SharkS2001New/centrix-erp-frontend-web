"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { tabAddTitle, useTabFormExit } from "@/hooks/use-tab-form-exit";
import { TabFormCancelButton, TabFormBackButton } from "@/components/layout/tab-form-exit-button";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { fetchSuppliersCached } from "@/lib/reference-data-cache";
import { Field, PrimaryButton, SearchableSelect, inputClassName } from "@/components/catalog/catalog-shared";
import { ProductSearchSelect } from "@/components/catalog/product-search-select";
import { formatSaleKes } from "@/lib/sales";
import {
  RETURN_REASON_OTHER,
  SUPPLIER_CREDIT_NOTE_REASONS,
  resolveReturnReason,
} from "@/components/sales/customer-returns-shared";

function newLineKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyLine() {
  return {
    key: newLineKey(),
    product_code: "",
    product_name: "",
    description: "",
    amount: "",
  };
}

function isReasonValid(preset, otherText) {
  const selected = String(preset ?? "").trim();
  if (!selected) return false;
  if (selected === RETURN_REASON_OTHER) {
    return String(otherText ?? "").trim().length >= 3;
  }
  return true;
}

export function SupplierCreditNoteForm({
  backHref = "/sales/credit-notes/supplier",
  backLabel = "← Back to supplier credit notes",
  initialSupplierId = "",
}) {
  const { exitTo } = useTabFormExit(tabAddTitle("supplier credit note"));
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState(initialSupplierId ? String(initialSupplierId) : "");
  const [creditDate, setCreditDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState("");
  const [lpoNo, setLpoNo] = useState("");
  const [reasonPreset, setReasonPreset] = useState(SUPPLIER_CREDIT_NOTE_REASONS[0]);
  const [reasonOther, setReasonOther] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [itemized, setItemized] = useState(false);
  const [lines, setLines] = useState([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSuppliersCached(user?.organization_id)
      .then(setSuppliers)
      .catch(() => setSuppliers([]));
  }, [user?.organization_id]);

  const lineTotal = useMemo(
    () =>
      lines.reduce((sum, line) => sum + (Number(line.amount) > 0 ? Number(line.amount) : 0), 0),
    [lines],
  );

  const updateLine = useCallback((index, patch) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }, []);

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(index) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!user?.branch_id) {
      setError("Your user profile has no branch assigned.");
      return;
    }
    if (!supplierId) {
      setError("Select a supplier.");
      return;
    }
    if (!isReasonValid(reasonPreset, reasonOther)) {
      setError("Reason for credit note is required.");
      return;
    }
    const resolvedReason = resolveReturnReason(reasonPreset, reasonOther);
    const narrative = description.trim();
    if (!itemized && !narrative && !totalAmount) {
      setError("Enter a description or credit amount.");
      return;
    }

    const payloadLines = itemized
      ? lines
          .filter((line) => Number(line.amount) > 0)
          .map((line, index) => ({
            product_code: line.product_code || null,
            product_name: line.product_name || null,
            description: line.description?.trim() || null,
            amount: Number(line.amount),
            line_no: index + 1,
          }))
          .filter((line) => line.product_code || line.description)
      : [];

    if (itemized && payloadLines.length === 0) {
      setError("Add at least one line with a description or product and an amount.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const body = {
        supplier_id: Number(supplierId),
        branch_id: user.branch_id,
        credit_date: creditDate,
        reason: resolvedReason,
        description: narrative || null,
        supplier_invoice_no: supplierInvoiceNo.trim() || null,
        lpo_no: lpoNo ? Number(lpoNo) : null,
        notes: notes.trim() || null,
        total_amount: itemized ? undefined : Number(totalAmount),
        lines: itemized ? payloadLines : undefined,
      };

      await apiRequest("/supplier-credit-notes", { method: "POST", body });
      exitTo("/sales/credit-notes/supplier");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save supplier credit note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="theme-panel rounded-xl border p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <TabFormBackButton href={backHref} label={backLabel} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-slate-900">Create supplier credit note</h1>
          <p className="mt-1 text-sm text-slate-500">
            Record a credit from a supplier for overcharges or billing adjustments. Line items are optional.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Supplier" required>
          <SearchableSelect
            value={supplierId}
            onChange={setSupplierId}
            required
            placeholder="Select supplier…"
            options={[
              { value: "", label: "Select supplier…" },
              ...suppliers.map((supplier) => ({
                value: String(supplier.id),
                label: supplier.supplier_name ?? `Supplier #${supplier.id}`,
              })),
            ]}
          />
        </Field>

        <Field label="Credit date" required>
          <input
            type="date"
            className={inputClassName()}
            value={creditDate}
            onChange={(e) => setCreditDate(e.target.value)}
            required
          />
        </Field>

        <Field label="Supplier invoice no.">
          <input
            className={inputClassName()}
            value={supplierInvoiceNo}
            onChange={(e) => setSupplierInvoiceNo(e.target.value)}
            placeholder="Optional"
          />
        </Field>

        <Field label="LPO no.">
          <input
            className={inputClassName()}
            value={lpoNo}
            onChange={(e) => setLpoNo(e.target.value)}
            placeholder="Optional"
            inputMode="numeric"
          />
        </Field>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Reason for credit" required>
          <SearchableSelect
            value={reasonPreset}
            onChange={setReasonPreset}
            required
            placeholder="Select reason…"
            options={SUPPLIER_CREDIT_NOTE_REASONS.map((reason) => ({
              value: reason,
              label: reason,
            }))}
          />
        </Field>
        {reasonPreset === RETURN_REASON_OTHER ? (
          <Field label="Please specify" required>
            <input
              className={inputClassName()}
              value={reasonOther}
              onChange={(e) => setReasonOther(e.target.value)}
              required
            />
          </Field>
        ) : null}
      </div>

      <Field label="Description / details" className="mt-4">
        <textarea
          rows={3}
          className={inputClassName()}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Explain what the supplier overcharged or what this credit covers"
        />
      </Field>

      <Field label="Internal notes" className="mt-4">
        <textarea
          rows={2}
          className={inputClassName()}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional"
        />
      </Field>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={itemized}
            onChange={(e) => setItemized(e.target.checked)}
          />
          Itemize credit with optional products
        </label>
      </div>

      {!itemized ? (
        <Field label="Credit amount (KES)" className="mt-4" required>
          <input
            type="number"
            min="0.01"
            step="0.01"
            className={`${inputClassName()} max-w-xs`}
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value)}
            required={!description.trim()}
            placeholder="0.00"
          />
        </Field>
      ) : (
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-slate-900">Credit lines (optional products)</h2>
            <button
              type="button"
              onClick={addLine}
              className="text-sm text-[#185FA5] hover:underline"
            >
              + Add line
            </button>
          </div>
          <div className="space-y-4">
            {lines.map((line, index) => (
              <div key={line.key} className="rounded-lg border border-slate-200 p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Product (optional)">
                    <ProductSearchSelect
                      value={line.product_code}
                      onChange={(code) => updateLine(index, { product_code: code })}
                      onProductSelect={(product) =>
                        updateLine(index, {
                          product_code: product.product_code,
                          product_name: product.product_name,
                        })
                      }
                      placeholder="Search product…"
                    />
                  </Field>
                  <Field label="Amount (KES)" required>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      className={inputClassName()}
                      value={line.amount}
                      onChange={(e) => updateLine(index, { amount: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Line description" className="mt-3">
                  <input
                    className={inputClassName()}
                    value={line.description}
                    onChange={(e) => updateLine(index, { description: e.target.value })}
                    placeholder="e.g. Freight overcharge on invoice INV-204"
                  />
                </Field>
                {lines.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    className="mt-2 text-sm text-red-600 hover:underline"
                  >
                    Remove line
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <p className="text-sm font-medium text-slate-700">Total: {formatSaleKes(lineTotal)}</p>
        </div>
      )}

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      <div className="mt-6 flex flex-wrap gap-2">
        <PrimaryButton type="submit" disabled={saving}>
          {saving ? "Saving…" : "Create supplier credit note"}
        </PrimaryButton>
        <TabFormCancelButton href={backHref} />
      </div>
    </form>
  );
}
