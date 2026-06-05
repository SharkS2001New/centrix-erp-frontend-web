"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { LpoProductSearchPanel } from "@/components/lpo/lpo-product-search-panel";
import { formatPackagingLabel } from "@/components/lpo/lpo-product-utils";
import {
  UomMeasureSelect,
  defaultUomMeasureLevel,
  uomMeasureLabel,
} from "@/components/inventory/damage-measure-select";
import { InventoryPageShell } from "@/components/inventory/inventory-shared";
import {
  TRANSFER_FROM_OPTIONS,
  transferToOptionsFor,
} from "@/lib/inventory-transfer-routes";
import { damageQtyToBase } from "@/lib/stock-uom";

export default function StockTransferPage() {
  const router = useRouter();
  const { user } = useAuth();
  const branchId = user?.branch_id ?? 1;

  const [uoms, setUoms] = useState([]);
  const [selected, setSelected] = useState(null);
  const [fromLocation, setFromLocation] = useState("shop");
  const [toLocation, setToLocation] = useState("store");
  const [packageType, setPackageType] = useState("full");
  const [reason, setReason] = useState("");
  const [qty, setQty] = useState("1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiRequest("/uoms", { searchParams: { per_page: 200 } })
      .then((res) => setUoms(res.data ?? []))
      .catch(() => setUoms([]));
  }, []);

  const uomById = useMemo(() => new Map(uoms.map((u) => [u.id, u])), [uoms]);
  const toOptions = useMemo(
    () => transferToOptionsFor(fromLocation),
    [fromLocation],
  );

  useEffect(() => {
    if (!toOptions.some((opt) => opt.value === toLocation)) {
      setToLocation(toOptions[0]?.value ?? "store");
    }
  }, [fromLocation, toOptions, toLocation]);

  const handleSelectProduct = useCallback((product) => {
    setSelected(product);
    setPackageType(defaultUomMeasureLevel(product.uom));
    setQty("1");
    setError(null);
  }, []);

  function handleFromChange(from) {
    setFromLocation(from);
    const nextToOptions = transferToOptionsFor(from);
    setToLocation((prev) =>
      nextToOptions.some((opt) => opt.value === prev)
        ? prev
        : (nextToOptions[0]?.value ?? "store"),
    );
  }

  async function submit(e) {
    e.preventDefault();
    if (!selected) {
      setError("Select a product to transfer.");
      return;
    }
    if (!reason.trim()) {
      setError("Enter a reason for this transfer.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const uom = selected.uom ?? uomById.get(selected.unit_id);
      await apiRequest("/inventory/transfer", {
        method: "POST",
        body: {
          branch_id: branchId,
          product_code: selected.product_code,
          quantity: damageQtyToBase(qty, packageType, uom),
          from_location: fromLocation,
          to_location: toLocation,
          notes: reason.trim(),
        },
      });
      router.push("/inventory/transactions?type=TRANSFER");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Transfer failed");
    } finally {
      setSaving(false);
    }
  }

  const measureLabel = uomMeasureLabel(selected?.uom, packageType);

  return (
    <InventoryPageShell
      title="Transfer stock"
      subtitle="Move stock between locations or record stock leaving for internal use, donations, and more"
    >
      <div className="mb-4">
        <Link href="/inventory/transactions" className="text-sm text-[#185FA5] hover:underline">
          ← Back to movements
        </Link>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <form
        onSubmit={submit}
        className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <div className="min-h-[380px] min-w-0 lg:sticky lg:top-6 lg:self-start">
            <LpoProductSearchPanel
              uomById={uomById}
              onSelect={handleSelectProduct}
              actionLabel="Select product"
              hint="Search and select the product to transfer."
              clearOnSelect
            />
          </div>
          <div className="space-y-4">
            {selected ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                <p className="font-medium text-slate-900">{selected.product_name}</p>
                <p className="font-mono text-xs text-slate-500">{selected.product_code}</p>
                {selected.uom ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {formatPackagingLabel(selected.uom)}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No product selected.</p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From">
                <select
                  className={inputClassName()}
                  value={fromLocation}
                  onChange={(e) => handleFromChange(e.target.value)}
                >
                  {TRANSFER_FROM_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="To">
                <select
                  className={inputClassName()}
                  value={toLocation}
                  onChange={(e) => setToLocation(e.target.value)}
                >
                  {toOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Reason">
              <input
                className={inputClassName()}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Staff lunch, damaged display units, donation to church"
                required
              />
            </Field>

            <Field label="Measured as">
              <UomMeasureSelect
                uom={selected?.uom ?? uomById.get(selected?.unit_id)}
                value={packageType}
                onChange={setPackageType}
                className={inputClassName()}
              />
            </Field>

            <Field label={`Quantity (${measureLabel})`}>
              <input
                type="number"
                min="0.001"
                step="any"
                className={inputClassName()}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                required
              />
            </Field>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Link
            href="/inventory/transactions"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
          <PrimaryButton type="submit" showIcon={false} disabled={saving || !selected}>
            {saving ? "Transferring…" : "Transfer stock"}
          </PrimaryButton>
        </div>
      </form>
    </InventoryPageShell>
  );
}
