"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { lineFromEnrichedProduct, packageNameFromUom } from "@/components/lpo/lpo-product-utils";
import {
  InventoryProductLines,
  useInventoryCatalogMaps,
} from "@/components/inventory/inventory-product-lines";
import { InventoryPageShell } from "@/components/inventory/inventory-shared";
import { damageQtyToBase } from "@/lib/stock-uom";

const PACKAGE_OPTIONS = [
  { value: "full_package", label: "Full pack" },
  { value: "pieces", label: "Loose units" },
];

function lineFromProduct(product) {
  return {
    ...lineFromEnrichedProduct(product),
    quantity: "1",
    package_type: "full_package",
    stock_location: "shop",
  };
}

export default function RecordDamagePage() {
  const router = useRouter();
  const { user } = useAuth();
  const branchId = user?.branch_id ?? 1;

  const [uoms, setUoms] = useState([]);
  const [lines, setLines] = useState([]);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiRequest("/uoms", { searchParams: { per_page: 200 } })
      .then((res) => setUoms(res.data ?? []))
      .catch(() => setUoms([]));
  }, []);

  const { uomById } = useInventoryCatalogMaps(uoms);

  function addProduct(product) {
    const code = product.product_code;
    if (lines.some((l) => l.product_code === code)) return;
    setLines((prev) => [...prev, lineFromProduct(product)]);
  }

  function updateLine(index, patch) {
    setLines((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function submit(e) {
    e.preventDefault();
    const toPost = lines.filter((line) => line.product_code && Number(line.quantity) > 0);
    if (toPost.length === 0) {
      setError("Add at least one product with a quantity.");
      return;
    }

    setSaving(true);
    setError(null);
    const reasonText = [reason.trim(), notes.trim()].filter(Boolean).join(" — ");
    try {
      for (const line of toPost) {
        const factor = Number(line.conversion_factor ?? 1);
        const packName = line.package_name ?? packageNameFromUom(line.uom);
        await apiRequest("/damages", {
          method: "POST",
          body: {
            product_code: line.product_code,
            branch_id: branchId,
            quantity: damageQtyToBase(line.quantity, line.package_type, factor),
            package_type: line.package_type,
            uom_label: packName,
            stock_location: line.stock_location,
            reason: reasonText || null,
          },
        });
      }
      router.push("/inventory/damages");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record damage");
    } finally {
      setSaving(false);
    }
  }

  return (
    <InventoryPageShell title="Record damage" subtitle="Write off damaged, expired, or lost stock">
      <div className="mb-4">
        <Link href="/inventory/damages" className="text-sm text-[#185FA5] hover:underline">
          ← Back to damages
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Reason">
            <input
              className={inputClassName()}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Expired stock"
            />
          </Field>
          <Field label="Notes">
            <input
              className={inputClassName()}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional details"
            />
          </Field>
        </div>

        <InventoryProductLines
          lines={lines}
          onChange={setLines}
          uomById={uomById}
          onAddProduct={addProduct}
          tableHeaders={[
            { key: "product", label: "Product" },
            { key: "measure", label: "Measured as" },
            { key: "qty", label: "Qty", align: "right" },
            { key: "loc", label: "Location" },
          ]}
          emptyMessage="Search and add products to record damage."
          renderCells={(line, index) => (
            <>
              <td className="px-3 py-2">
                <select
                  className={`${inputClassName()} text-xs`}
                  value={line.package_type}
                  onChange={(e) => updateLine(index, { package_type: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                >
                  {PACKAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-3 py-2 text-right">
                <input
                  type="number"
                  min="0.001"
                  step="any"
                  className={`${inputClassName()} w-24 text-right`}
                  value={line.quantity}
                  onChange={(e) => updateLine(index, { quantity: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                />
              </td>
              <td className="px-3 py-2">
                <select
                  className={`${inputClassName()} text-xs`}
                  value={line.stock_location}
                  onChange={(e) => updateLine(index, { stock_location: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                >
                  <option value="shop">Shop</option>
                  <option value="store">Store</option>
                </select>
              </td>
            </>
          )}
        />

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Link
            href="/inventory/damages"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
          <PrimaryButton type="submit" showIcon={false} disabled={saving}>
            {saving ? "Saving…" : "Save damages"}
          </PrimaryButton>
        </div>
      </form>
    </InventoryPageShell>
  );
}
