"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { LpoProductSearchPanel } from "@/components/lpo/lpo-product-search-panel";
import { formatPackagingLabel } from "@/components/lpo/lpo-product-utils";
import { InventoryPageShell } from "@/components/inventory/inventory-shared";
import { displayToBaseQty } from "@/lib/stock-uom";

const TRANSFER_PURPOSES = [
  { value: "location_move", label: "Move between locations" },
  { value: "internal_use", label: "Internal use" },
  { value: "staff_consumption", label: "Staff consumption" },
  { value: "charity", label: "Charity / donation" },
  { value: "sample", label: "Sample / demo" },
  { value: "production", label: "Production / manufacturing" },
  { value: "display", label: "Display / merchandising" },
];

const LOCATION_LABELS = {
  shop: "Shop",
  store: "Store / warehouse",
};

function oppositeLocation(location) {
  return location === "shop" ? "store" : "shop";
}

export default function StockTransferPage() {
  const router = useRouter();
  const { user } = useAuth();
  const branchId = user?.branch_id ?? 1;

  const [uoms, setUoms] = useState([]);
  const [selected, setSelected] = useState(null);
  const [fromLocation, setFromLocation] = useState("shop");
  const [purpose, setPurpose] = useState("location_move");
  const [qty, setQty] = useState("1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const toLocation = oppositeLocation(fromLocation);

  useEffect(() => {
    apiRequest("/uoms", { searchParams: { per_page: 200 } })
      .then((res) => setUoms(res.data ?? []))
      .catch(() => setUoms([]));
  }, []);

  const uomById = useMemo(() => new Map(uoms.map((u) => [u.id, u])), [uoms]);

  const handleSelectProduct = useCallback((product) => {
    setSelected(product);
    setQty("1");
    setError(null);
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (!selected) {
      setError("Select a product to transfer.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const factor = Number(selected.conversion_factor ?? selected.uom?.conversion_factor ?? 1);
      await apiRequest("/inventory/transfer", {
        method: "POST",
        body: {
          branch_id: branchId,
          product_code: selected.product_code,
          quantity: displayToBaseQty(qty, factor),
          from_location: fromLocation,
          to_location: toLocation,
          purpose,
        },
      });
      router.push("/inventory/transactions?type=TRANSFER");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Transfer failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <InventoryPageShell
      title="Transfer stock"
      subtitle="Move stock between shop and store, or record why stock is being moved"
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
          <div className="min-h-[320px]">
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

            <Field label="Transfer reason">
              <select
                className={inputClassName()}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
              >
                {TRANSFER_PURPOSES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From">
                <select
                  className={inputClassName()}
                  value={fromLocation}
                  onChange={(e) => setFromLocation(e.target.value)}
                >
                  <option value="shop">Shop</option>
                  <option value="store">Store / warehouse</option>
                </select>
              </Field>
              <Field label="To">
                <div className={`${inputClassName()} bg-slate-50 text-slate-700`}>
                  {LOCATION_LABELS[toLocation]}
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Always the opposite location from &ldquo;From&rdquo;.
                </p>
              </Field>
            </div>

            <Field label={`Quantity (${selected?.package_name || "full packs"})`}>
              <input
                type="number"
                min="0.001"
                step="any"
                className={inputClassName()}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                required
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Enter whole packs. The system multiplies by the conversion factor when saving.
              </p>
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
