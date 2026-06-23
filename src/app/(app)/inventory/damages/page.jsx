"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  Field,
  IconButton,
  PaginationBar,
  PencilIcon,
  PrimaryLink,
  TrashIcon,
  formatShortDate,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { P } from "@/lib/permission-codes";
import {
  defaultDateRange,
  formatStockQty,
  InventoryPageShell,
  InventoryTableShell,
  ProductCodeLink,
  rowInDateRange,
} from "@/components/inventory/inventory-shared";
import { EditDamageDrawer } from "@/components/inventory/edit-damage-drawer";

const PAGE_SIZE = 15;

export default function DamagesPage() {
  const { user } = useAuth();
  const branchId = user?.branch_id ?? 1;
  const initialRange = defaultDateRange(7);

  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState(null);
  const [editingDamage, setEditingDamage] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const all = [];
      let pageNum = 1;
      let lastPage = 1;
      do {
        const res = await apiRequest("/damages", {
          searchParams: {
            per_page: 200,
            page: pageNum,
            "filter[branch_id]": branchId,
          },
        });
        all.push(...(res.data ?? []));
        lastPage = res.last_page ?? 1;
        pageNum += 1;
      } while (pageNum <= lastPage);
      setRows(all);
      const [prodRes, uomRes] = await Promise.all([
        apiRequest("/products", { searchParams: { per_page: 500 } }),
        apiRequest("/uoms", { searchParams: { per_page: 200 } }),
      ]);
      setProducts(prodRes.data ?? []);
      setUoms(uomRes.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load damages");
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  const uomByProduct = useMemo(() => {
    const uomById = new Map(uoms.map((u) => [u.id, u]));
    const map = new Map();
    for (const p of products) {
      map.set(p.product_code, uomById.get(p.unit_id));
    }
    return map;
  }, [products, uoms]);

  const productByCode = useMemo(
    () => new Map(products.map((p) => [p.product_code, p])),
    [products],
  );

  const filtered = useMemo(
    () => rows.filter((row) => rowInDateRange(row, fromDate, toDate, ["created_at"])),
    [rows, fromDate, toDate],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [fromDate, toDate]);

  async function deleteDamage(row) {
    const product = productByCode.get(row.product_code);
    const label = product?.product_name ?? row.product_code;
    const qtyLabel = formatStockQty(row.quantity, uomByProduct.get(row.product_code));
    if (
      !window.confirm(
        `Delete this damage record for ${label} and restore ${qtyLabel} to ${row.stock_location ?? "shop"} stock?`,
      )
    ) {
      return;
    }

    setDeletingId(row.id);
    setError(null);
    try {
      await apiRequest(`/damages/${row.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to delete damage");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <InventoryPageShell
      title="Damages"
      subtitle="Stock written off due to damage, expiry, or loss"
      action={
        <PrimaryLink href="/inventory/damages/new" permission={P.inventory.damages.view}>
          Record damage
        </PrimaryLink>
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="From">
          <input
            type="date"
            className={inputClassName()}
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            className={inputClassName()}
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </Field>
        <p className="pb-2 text-xs text-slate-500">
          {filtered.length} record{filtered.length === 1 ? "" : "s"} in range
        </p>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <InventoryTableShell>
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading damages…</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="theme-table-head-row text-left text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 font-medium text-right">Qty</th>
                    <th className="px-4 py-3 font-medium">Location</th>
                    <th className="px-4 py-3 font-medium">Reason</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageSlice.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        No damages in this date range.
                      </td>
                    </tr>
                  ) : (
                    pageSlice.map((row) => {
                      const product = productByCode.get(row.product_code);
                      return (
                        <tr key={row.id} className="border-b border-slate-100">
                          <td className="px-4 py-3 text-slate-600">
                            {row.created_at
                              ? formatShortDate(String(row.created_at).slice(0, 10))
                              : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-medium text-slate-900">
                              {product?.product_name ?? row.product_code}
                            </span>
                            <div className="mt-0.5">
                              <ProductCodeLink code={row.product_code} />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-red-700">
                            −{formatStockQty(row.quantity, uomByProduct.get(row.product_code))}
                          </td>
                          <td className="px-4 py-3 capitalize text-slate-600">
                            {row.stock_location ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{row.reason ?? "—"}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex gap-1">
                              <IconButton
                                label="Edit damage"
                                onClick={() => setEditingDamage(row)}
                              >
                                <PencilIcon />
                              </IconButton>
                              <IconButton
                                label="Delete and restore stock"
                                onClick={() => deleteDamage(row)}
                                disabled={deletingId === row.id}
                              >
                                <TrashIcon />
                              </IconButton>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={safePage}
              totalPages={totalPages}
              total={filtered.length}
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
          </>
        )}
      </InventoryTableShell>

      <EditDamageDrawer
        open={Boolean(editingDamage)}
        damage={editingDamage}
        products={products}
        uoms={uoms}
        onClose={() => setEditingDamage(null)}
        onSaved={load}
      />
    </InventoryPageShell>
  );
}
