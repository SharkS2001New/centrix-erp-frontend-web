"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import {
  formatPoNumber,
  lpoReturnableLines,
  lpoCanRecordReturn,
  lpoStockDeductQty,
} from "./lpo-shared";

export function RecordSupplierReturnForm({
  lpoNo,
  supplierId,
  lines = [],
  lpoStatusCode = 0,
  presetProductCode = null,
  onSuccess,
  backHref,
  backLabel = "← Back to LPO",
  pageTitle,
  pageSubtitle,
}) {
  const { user } = useAuth();
  const returnableLines = useMemo(() => lpoReturnableLines(lines), [lines]);
  const canRecord = lpoCanRecordReturn({ lpo_status_code: lpoStatusCode }, lines);

  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [form, setForm] = useState({
    product_code: "",
    quantity: "",
    package_type: "partial",
    stock_location: "store",
    reason: "",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const selectedLine = useMemo(
    () => returnableLines.find((l) => l.product_code === form.product_code),
    [returnableLines, form.product_code],
  );
  const stockDeductPreview = useMemo(() => {
    if (!selectedLine) return null;
    return lpoStockDeductQty(selectedLine, form.quantity);
  }, [selectedLine, form.quantity]);

  useEffect(() => {
    const bid = user?.branch_id;
    if (bid) setBranchId(String(bid));
    apiRequest("/branches", { searchParams: { per_page: 50 } })
      .then((res) => {
        const list = res.data ?? res ?? [];
        setBranches(list);
        if (!bid && list.length === 1) setBranchId(String(list[0].id));
      })
      .catch(() => setBranches([]));
  }, [user?.branch_id]);

  const defaultProductCode = useMemo(() => {
    if (presetProductCode) {
      const preset = returnableLines.find((l) => l.product_code === presetProductCode);
      if (preset) return preset.product_code;
    }
    return returnableLines[0]?.product_code ?? "";
  }, [returnableLines, presetProductCode]);

  useEffect(() => {
    setForm((p) => {
      if (!defaultProductCode) {
        if (!p.product_code && !p.quantity) return p;
        return { ...p, product_code: "", quantity: "" };
      }
      if (p.product_code === defaultProductCode && p.quantity === "1") return p;
      return { ...p, product_code: defaultProductCode, quantity: "1" };
    });
  }, [defaultProductCode]);

  async function submit(e) {
    e.preventDefault();
    if (!canRecord || returnableLines.length === 0) return;

    const qty = Number(form.quantity);
    if (!form.product_code) {
      setFormError("Select a product.");
      return;
    }
    if (!qty || qty <= 0) {
      setFormError("Enter a return quantity.");
      return;
    }
    if (!form.reason.trim()) {
      setFormError("Enter a reason (e.g. damaged on delivery).");
      return;
    }
    if (!branchId) {
      setFormError("Select the branch returning stock from.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await apiRequest(`/lpo-mst/${lpoNo}/supplier-returns`, {
        method: "POST",
        body: {
          branch_id: Number(branchId),
          supplier_id: Number(supplierId),
          product_code: form.product_code,
          quantity: qty,
          package_type: form.package_type,
          uom_label: selectedLine?.uom ?? selectedLine?.package_name ?? null,
          stock_location: form.stock_location,
          reason: form.reason.trim(),
        },
      });
      await onSuccess?.();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Return failed");
    } finally {
      setSaving(false);
    }
  }

  const title = pageTitle ?? `Supplier return — ${formatPoNumber(lpoNo)}`;
  const subtitle =
    pageSubtitle ??
    "Record damaged or rejected goods from this LPO. Stock is removed and the payable amount for received items is reduced.";

  return (
    <div className="-m-6 min-h-[calc(100%+3rem)] bg-slate-50 p-6 text-slate-900 md:-m-8 md:min-h-[calc(100%+4rem)] md:p-8">
      <div className="mx-auto max-w-xl">
        <Link href={backHref} className="text-sm text-[#185FA5] hover:text-[#144f8a]">
          {backLabel}
        </Link>
        <h1 className="mt-2 text-xl font-medium text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>

        {Number(lpoStatusCode) < 3 ? (
          <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Mark this LPO as sent to the supplier before recording returns.
          </p>
        ) : returnableLines.length === 0 ? (
          <div className="mt-6 space-y-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p>No received stock is available to return yet.</p>
            <Link
              href={`/lpo/${lpoNo}/receive`}
              className="inline-block font-medium text-[#185FA5] hover:underline"
            >
              Receive stock first →
            </Link>
          </div>
        ) : (
          <form
            onSubmit={submit}
            className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <Field label="Branch (stock location)">
              <select
                className={inputClassName()}
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                required
              >
                <option value="">Select branch</option>
                {branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.branch_name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Product">
              <select
                className={inputClassName()}
                value={form.product_code}
                onChange={(e) => {
                  const line = returnableLines.find((l) => l.product_code === e.target.value);
                  setForm((p) => ({
                    ...p,
                    product_code: e.target.value,
                    quantity: line ? String(Math.min(1, Number(line.returnable_qty))) : "",
                  }));
                }}
                required
              >
                <option value="">Select product</option>
                {returnableLines.map((line) => (
                  <option key={line.id} value={line.product_code}>
                    {line.product_name} — max return {line.max_return_qty ?? line.returnable_qty}{" "}
                    {line.package_name || "packs"}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Quantity to return (packs)">
              <input
                type="number"
                min="0"
                step="any"
                className={inputClassName()}
                value={form.quantity}
                onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))}
                required
              />
              {selectedLine ? (
                <p className="mt-1 text-xs text-slate-500">
                  Max {selectedLine.max_return_qty ?? selectedLine.returnable_qty} on line
                  (received {selectedLine.received_qty}
                  {Number(selectedLine.returned_qty) > 0
                    ? `, returned ${selectedLine.returned_qty}`
                    : ""}
                  )
                  {stockDeductPreview != null ? (
                    <>
                      {" "}
                      · stock deduction: {stockDeductPreview} pack
                      {stockDeductPreview === 1 ? "" : "s"}
                    </>
                  ) : null}
                </p>
              ) : null}
            </Field>

            <Field label="Return from">
              <select
                className={inputClassName()}
                value={form.stock_location}
                onChange={(e) => setForm((p) => ({ ...p, stock_location: e.target.value }))}
              >
                <option value="store">Store</option>
                <option value="shop">Shop</option>
              </select>
            </Field>

            <Field label="Package type">
              <select
                className={inputClassName()}
                value={form.package_type}
                onChange={(e) => setForm((p) => ({ ...p, package_type: e.target.value }))}
              >
                <option value="full_package">Full package</option>
                <option value="partial">Partial package</option>
                <option value="pieces">Pieces</option>
              </select>
            </Field>

            <Field label="Reason (required)">
              <textarea
                className={`${inputClassName()} min-h-[88px]`}
                value={form.reason}
                onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
                placeholder="e.g. Damaged cartons, short expiry, wrong product"
                required
              />
            </Field>

            {formError ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
            ) : null}

            <div className="flex gap-2 border-t border-slate-100 pt-4">
              <Link
                href={backHref}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-[#185FA5] px-5 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a] disabled:opacity-50"
              >
                {saving ? "Saving…" : "Record supplier return"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
