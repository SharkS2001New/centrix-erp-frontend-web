"use client";

import { notifyError, notifySuccess } from "@/lib/notify";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { canDirectInventoryAction } from "@/lib/approval-permissions";
import { useAuth } from "@/contexts/auth-context";
import { fetchBranchesCached, fetchUomsCached } from "@/lib/reference-data-cache";
import { isDamageWriteOffApprovalEnabled } from "@/lib/sales-settings";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { lineFromEnrichedProduct } from "@/components/lpo/lpo-product-utils";
import {
  DamageMeasureSelect,
  defaultDamagePackageType,
} from "@/components/inventory/damage-measure-select";
import {
  InventoryProductLines,
  useInventoryCatalogMaps,
} from "@/components/inventory/inventory-product-lines";
import { InventoryPageShell } from "@/components/inventory/inventory-shared";
import { damageMeasureLabel, damageQtyToBase } from "@/lib/stock-uom";

function lineFromProduct(product) {
  const uom = product.uom;
  return {
    ...lineFromEnrichedProduct(product),
    quantity: "1",
    package_type: defaultDamagePackageType(uom),
    stock_location: "shop",
  };
}

export function InventoryDamagesNewScreen() {
  const router = useRouter();
  const { user, capabilities, hasPermission, isOrgWide } = useAuth();

  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [uoms, setUoms] = useState([]);
  const [lines, setLines] = useState([]);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUomsCached(user?.organization_id)
      .then((rows) => setUoms(rows ?? []))
      .catch(() => setUoms([]));
  }, [user?.organization_id]);

  useEffect(() => {
    let cancelled = false;
    fetchBranchesCached(user?.organization_id)
      .then((rows) => {
        if (cancelled) return;
        const list = rows ?? [];
        setBranches(list);
        if (user?.branch_id) {
          setBranchId(String(user.branch_id));
        } else if (list.length === 1) {
          setBranchId(String(list[0].id));
        } else if (list[0]?.id) {
          setBranchId(String(list[0].id));
        }
      })
      .catch(() => {
        if (!cancelled) setBranches([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.organization_id, user?.branch_id]);

  const { uomById } = useInventoryCatalogMaps(uoms);
  const canPickBranch = typeof isOrgWide === "function" ? isOrgWide() : !user?.branch_id;

  function addProduct(product) {
    const code = product.product_code;
    if (lines.some((l) => l.product_code === code)) return;
    setLines((prev) => [...prev, lineFromProduct(product)]);
  }

  function addProducts(products) {
    const existing = new Set(lines.map((l) => l.product_code));
    const toAdd = products.filter((p) => !existing.has(p.product_code));
    if (!toAdd.length) return;
    setLines((prev) => [...prev, ...toAdd.map((product) => lineFromProduct(product))]);
  }

  function updateLine(index, patch) {
    setLines((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function submit(e) {
    e.preventDefault();
    if (!branchId) {
      notifyError("Select a branch before recording damage.");
      return;
    }
    const toPost = lines.filter((line) => line.product_code && Number(line.quantity) > 0);
    if (toPost.length === 0) {
      notifyError("Add at least one product with a quantity.");
      return;
    }

    setSaving(true);
    const reasonText = [reason.trim(), notes.trim()].filter(Boolean).join(" — ");
    const useRequestFlow =
      isDamageWriteOffApprovalEnabled(capabilities?.module_settings) &&
      !canDirectInventoryAction({ hasPermission, capabilities });
    try {
      for (const line of toPost) {
        const uom = uomById.get(line.unit_id);
        const body = {
          product_code: line.product_code,
          branch_id: Number(branchId),
          quantity: damageQtyToBase(line.quantity, line.package_type, uom),
          package_type: line.package_type,
          uom_label: damageMeasureLabel(uom, line.package_type),
          stock_location: line.stock_location,
          reason: reasonText || null,
        };
        const res = await apiRequest(useRequestFlow ? "/damages/request" : "/damages", {
          method: "POST",
          body,
        });
        if (res?.pending_approval) {
          notifySuccess("Write-off submitted for manager approval.");
        }
      }
      if (!useRequestFlow) {
        notifySuccess("Damage recorded.");
      }
      router.push("/inventory/damages");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to record damage");
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

      <form
        onSubmit={submit}
        className="space-y-5 theme-panel rounded-xl border p-6 shadow-sm"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Branch">
            <select
              className={inputClassName()}
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value);
                setLines([]);
              }}
              disabled={!canPickBranch && Boolean(user?.branch_id)}
              required
            >
              <option value="">Select branch…</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.branch_name ?? b.name ?? b.branch_code ?? `Branch ${b.id}`}
                </option>
              ))}
            </select>
          </Field>
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
          branchId={branchId ? Number(branchId) : null}
          onAddProduct={addProduct}
          onAddProducts={addProducts}
          tableHeaders={[
            { key: "product", label: "Product" },
            { key: "measure", label: "Measured as" },
            { key: "qty", label: "Qty", align: "right" },
            { key: "loc", label: "Location" },
          ]}
          emptyMessage={
            branchId
              ? "Search and add products to record damage."
              : "Select a branch, then search and add products."
          }
          renderCells={(line, index) => {
            const uom = uomById.get(line.unit_id);
            return (
            <>
              <td className="px-3 py-2">
                <DamageMeasureSelect
                  uom={uom}
                  value={line.package_type}
                  onChange={(package_type) => updateLine(index, { package_type })}
                  onClick={(e) => e.stopPropagation()}
                />
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
            );
          }}
        />

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Link
            href="/inventory/damages"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
          <PrimaryButton type="submit" showIcon={false} disabled={saving || !branchId}>
            {saving ? "Saving…" : "Save damages"}
          </PrimaryButton>
        </div>
      </form>
    </InventoryPageShell>
  );
}
