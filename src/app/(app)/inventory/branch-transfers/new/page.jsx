"use client";

import { notifyError } from "@/lib/notify";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { isMultiBranchCatalog } from "@/lib/catalog-scope";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { LpoProductSearchPanel } from "@/components/lpo/lpo-product-search-panel";
import { formatPackagingLabel } from "@/components/lpo/lpo-product-utils";
import {
  UomMeasureSelect,
  defaultUomMeasureLevel,
  uomMeasureLabel,
} from "@/components/inventory/damage-measure-select";
import { InventoryPageShell } from "@/components/inventory/inventory-shared";
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";
import { TRANSFER_FROM_OPTIONS } from "@/lib/inventory-transfer-routes";
import { damageQtyToBase } from "@/lib/stock-uom";

export default function BranchStockTransferPage() {
  const router = useRouter();
  const { user, capabilities } = useAuth();
  const defaultBranchId = user?.branch_id ?? 1;
  const multiBranch = isMultiBranchCatalog(capabilities);

  const [branches, setBranches] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [selected, setSelected] = useState(null);
  const [fromBranchId, setFromBranchId] = useState(String(defaultBranchId));
  const [toBranchId, setToBranchId] = useState("");
  const [fromLocation, setFromLocation] = useState("store");
  const [toLocation, setToLocation] = useState("store");
  const [packageType, setPackageType] = useState("full");
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState("1");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!multiBranch) {
      router.replace("/inventory/transfers");
    }
  }, [multiBranch, router]);

  useEffect(() => {
    if (!multiBranch) return;
    Promise.all([
      apiRequest("/branches", { searchParams: { per_page: 100 } }),
      apiRequest("/uoms", { searchParams: { per_page: 200 } }),
    ])
      .then(([branchRes, uomRes]) => {
        const rows = branchRes.data ?? [];
        setBranches(rows);
        setUoms(uomRes.data ?? []);
        if (!toBranchId && rows.length > 1) {
          const other = rows.find((b) => String(b.id) !== String(defaultBranchId));
          if (other) setToBranchId(String(other.id));
        }
      })
      .catch(() => {
        setBranches([]);
        setUoms([]);
      });
  }, [defaultBranchId, multiBranch, toBranchId]);

  const uomById = useMemo(() => new Map(uoms.map((u) => [u.id, u])), [uoms]);
  const toBranchOptions = useMemo(
    () => branches.filter((b) => String(b.id) !== fromBranchId),
    [branches, fromBranchId],
  );

  const handleSelectProduct = useCallback((product) => {
    setSelected(product);
    setPackageType(defaultUomMeasureLevel(product.uom));
    setQty("1");
  }, []);

  if (!multiBranch) {
    return (
      <InventoryPageShell title="Inter-branch transfer" subtitle="Redirecting…">
        <p className="text-sm text-slate-500">Inter-branch transfers require more than one branch.</p>
      </InventoryPageShell>
    );
  }

  async function submit(e) {
    e.preventDefault();
    if (!selected) {
      notifyError("Select a product to transfer.");
      return;
    }
    if (!toBranchId) {
      notifyError("Select a destination branch.");
      return;
    }

    setSaving(true);
    try {
      const uom = selected.uom ?? uomById.get(selected.unit_id);
      await apiRequest("/inventory/branch-transfer", {
        method: "POST",
        body: {
          from_branch_id: Number(fromBranchId),
          to_branch_id: Number(toBranchId),
          product_code: selected.product_code,
          quantity: damageQtyToBase(qty, packageType, uom),
          from_location: fromLocation,
          to_location: toLocation,
          notes: notes.trim() || undefined,
        },
      });
      router.push("/inventory/transactions?type=TRANSFER");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Branch transfer failed");
    } finally {
      setSaving(false);
    }
  }

  const measureLabel = uomMeasureLabel(selected?.uom, packageType);

  return (
    <InventoryPageShell
      title="Inter-branch transfer"
      subtitle="Move stock between branches (depot to depot, warehouse to branch shop, etc.)"
    >
      <AppBreadcrumb
        items={[
          { label: "Branch transfers", href: "/inventory/transfers" },
          { label: "New transfer" },
        ]}
      />

      <form onSubmit={submit} className="space-y-5 theme-panel rounded-xl border p-6 shadow-sm">
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
                  <p className="mt-1 text-xs text-slate-500">{formatPackagingLabel(selected.uom)}</p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No product selected.</p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From branch">
                <select
                  className={inputClassName()}
                  value={fromBranchId}
                  onChange={(e) => setFromBranchId(e.target.value)}
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.branch_name ?? b.branch_code ?? b.id}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="To branch">
                <select
                  className={inputClassName()}
                  value={toBranchId}
                  onChange={(e) => setToBranchId(e.target.value)}
                  required
                >
                  <option value="">Select branch…</option>
                  {toBranchOptions.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.branch_name ?? b.branch_code ?? b.id}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From location">
                <select
                  className={inputClassName()}
                  value={fromLocation}
                  onChange={(e) => setFromLocation(e.target.value)}
                >
                  {TRANSFER_FROM_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="To location">
                <select
                  className={inputClassName()}
                  value={toLocation}
                  onChange={(e) => setToLocation(e.target.value)}
                >
                  {TRANSFER_FROM_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Notes">
              <input
                className={inputClassName()}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional reference or reason"
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
            href="/inventory/transfers"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
          <PrimaryButton type="submit" showIcon={false} disabled={saving || !selected}>
            {saving ? "Transferring…" : "Transfer between branches"}
          </PrimaryButton>
        </div>
      </form>
    </InventoryPageShell>
  );
}
