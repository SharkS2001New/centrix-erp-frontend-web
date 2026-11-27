"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { fetchUsersCached } from "@/lib/reference-data-cache";
import { notifyError, notifySuccess } from "@/lib/notify";

export function SalesRepStockAllocationDialog({
  branchId,
  organizationId,
  product,
  locations,
  onClose,
  onChanged,
}) {
  const [users, setUsers] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [userId, setUserId] = useState("");
  const [location, setLocation] = useState(locations[0] ?? "shop");
  const [quantity, setQuantity] = useState("");
  const [activeTab, setActiveTab] = useState("transfers");
  const [movements, setMovements] = useState([]);
  const [movementPage, setMovementPage] = useState(1);
  const [movementLastPage, setMovementLastPage] = useState(1);
  const [movementTotal, setMovementTotal] = useState(0);
  const [movementDateFrom, setMovementDateFrom] = useState("");
  const [movementDateTo, setMovementDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [saving, setSaving] = useState(false);

  const availableUsers = useMemo(
    () =>
      users.filter(
        (user) =>
          user.is_admin !== true &&
          Number(user.is_admin ?? 0) !== 1 &&
          (user.branch_id == null || String(user.branch_id) === String(branchId)),
      ),
    [branchId, users],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [allocationResponse, userRows] = await Promise.all([
        apiRequest("/sales/rep-stock-allocations", {
          searchParams: {
            branch_id: branchId,
            product_code: product.product_code,
            per_page: 200,
          },
          loading: false,
        }),
        fetchUsersCached(organizationId),
      ]);
      const eligibleUsers = (userRows ?? []).filter(
        (user) =>
          user.is_admin !== true &&
          Number(user.is_admin ?? 0) !== 1 &&
          (user.branch_id == null || String(user.branch_id) === String(branchId)),
      );
      setAllocations(allocationResponse?.data ?? []);
      setUsers(userRows ?? []);
      setUserId((current) => current || String(eligibleUsers[0]?.id ?? ""));
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Could not load rep stock allocations");
    } finally {
      setLoading(false);
    }
  }, [branchId, organizationId, product.product_code]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMovements = useCallback(async (page = 1) => {
    setLoadingMovements(true);
    try {
      const response = await apiRequest("/sales/rep-stock-allocations/movements", {
        searchParams: {
          branch_id: branchId,
          product_code: product.product_code,
          date_from: movementDateFrom || undefined,
          date_to: movementDateTo || undefined,
          page,
          per_page: 25,
        },
        loading: false,
      });
      setMovements(response?.data ?? []);
      setMovementPage(Number(response?.current_page ?? page));
      setMovementLastPage(Number(response?.last_page ?? 1));
      setMovementTotal(Number(response?.total ?? 0));
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Could not load rep stock transfer history");
    } finally {
      setLoadingMovements(false);
    }
  }, [branchId, movementDateFrom, movementDateTo, product.product_code]);

  useEffect(() => {
    if (activeTab === "history") {
      void loadMovements(1);
    }
  }, [activeTab, loadMovements]);

  async function allocate(event) {
    event.preventDefault();
    const amount = Number(quantity);
    if (!userId || !Number.isFinite(amount) || amount <= 0) {
      notifyError("Choose a sales rep and enter a quantity greater than zero.");
      return;
    }

    setSaving(true);
    try {
      await apiRequest("/sales/rep-stock-allocations", {
        method: "POST",
        body: {
          branch_id: Number(branchId),
          user_id: Number(userId),
          product_code: product.product_code,
          stock_location: location,
          quantity: amount,
        },
        loading: false,
      });
      setQuantity("");
      notifySuccess("Stock transferred to sales rep.");
      await load();
      if (activeTab === "history") await loadMovements(1);
      onChanged?.();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Could not allocate stock");
    } finally {
      setSaving(false);
    }
  }

  async function release(allocation) {
    setSaving(true);
    try {
      await apiRequest(
        `/sales/rep-stock-allocations/${allocation.id}/release`,
        {
          method: "POST",
          body: { quantity: allocation.remaining_quantity },
          loading: false,
        },
      );
      notifySuccess("Remaining allocation returned to branch stock.");
      await load();
      if (activeTab === "history") await loadMovements(1);
      onChanged?.();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Could not release allocation");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rep-stock-dialog-title"
    >
      <div className="theme-panel max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border p-5 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="rep-stock-dialog-title" className="text-lg font-semibold text-slate-900">
              Sales rep stock transfers
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {product.product_name} · {product.product_code}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Transfer unassigned branch stock to a rep; sales reps can sell only from their own balance.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border px-3 py-1.5 text-sm">
            Close
          </button>
        </div>

        <div className="mb-4 flex gap-2 border-b">
          <button
            type="button"
            onClick={() => setActiveTab("transfers")}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              activeTab === "transfers" ? "border-[#185FA5] text-[#185FA5]" : "border-transparent text-slate-500"
            }`}
          >
            Transfer stock
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              activeTab === "history" ? "border-[#185FA5] text-[#185FA5]" : "border-transparent text-slate-500"
            }`}
          >
            Transfer history
          </button>
        </div>

        {activeTab === "transfers" ? (
          <>
        <form onSubmit={allocate} className="mb-6 grid gap-3 rounded-xl border bg-slate-50 p-4 sm:grid-cols-4">
          <label className="text-xs font-medium text-slate-600">
            Sales rep
            <select
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              className="mt-1 w-full rounded-lg border bg-white px-2.5 py-2 text-sm"
              disabled={loading || saving || availableUsers.length === 0}
            >
              {availableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.full_name || user.name || user.username}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Location
            <select
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              className="mt-1 w-full rounded-lg border bg-white px-2.5 py-2 text-sm"
              disabled={saving}
            >
              {locations.map((value) => (
                <option key={value} value={value}>
                  {value === "shop" ? "Shop" : "Store"}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Quantity
            <input
              type="number"
              min="0.001"
              step="0.001"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="mt-1 w-full rounded-lg border bg-white px-2.5 py-2 text-sm"
              disabled={saving}
              required
            />
          </label>
          <button
            type="submit"
            disabled={loading || saving || availableUsers.length === 0 || !locations.length}
            className="self-end rounded-lg bg-[#185FA5] px-3 py-2 text-sm font-medium text-white hover:bg-[#0C447C] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Transfer to rep"}
          </button>
        </form>

        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <th className="px-3 py-2">Sales rep</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2 text-right">Remaining</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="px-3 py-5 text-center text-slate-500">Loading allocations…</td></tr>
              ) : allocations.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-5 text-center text-slate-500">No allocations for this product.</td></tr>
              ) : (
                allocations.map((allocation) => (
                  <tr key={allocation.id} className="border-t">
                    <td className="px-3 py-2">
                      {allocation.user?.name || allocation.user?.username || `User ${allocation.user_id}`}
                    </td>
                    <td className="px-3 py-2 capitalize">{allocation.stock_location}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{allocation.remaining_quantity}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => void release(allocation)}
                        disabled={saving || Number(allocation.remaining_quantity) <= 0}
                        className="rounded-md border px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Return remainder
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
          </>
        ) : (
          <section aria-label="Sales rep stock transfer history">
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <label className="text-xs font-medium text-slate-600">
                From
                <input
                  type="date"
                  value={movementDateFrom}
                  onChange={(event) => setMovementDateFrom(event.target.value)}
                  className="mt-1 block rounded-lg border bg-white px-2.5 py-2 text-sm"
                  disabled={loadingMovements}
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                To
                <input
                  type="date"
                  value={movementDateTo}
                  onChange={(event) => setMovementDateTo(event.target.value)}
                  className="mt-1 block rounded-lg border bg-white px-2.5 py-2 text-sm"
                  disabled={loadingMovements}
                />
              </label>
              <p className="pb-2 text-xs text-slate-500">
                {movementTotal.toLocaleString()} stock movements
              </p>
            </div>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[780px] text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Activity</th>
                    <th className="px-3 py-2">Branch</th>
                    <th className="px-3 py-2">Sales rep</th>
                    <th className="px-3 py-2">Location</th>
                    <th className="px-3 py-2">Recorded by</th>
                    <th className="px-3 py-2 text-right">Quantity change</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingMovements ? (
                    <tr><td colSpan={7} className="px-3 py-5 text-center text-slate-500">Loading transfer history…</td></tr>
                  ) : movements.length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-5 text-center text-slate-500">No stock movements found for this period.</td></tr>
                  ) : movements.map((movement) => {
                    const quantityChange = Number(movement.quantity_change ?? 0);
                    const activity = {
                      allocation: "Transferred to rep",
                      release: "Returned to branch",
                      sale_debit: movement.sale_id ? `Sale #${movement.sale_id}` : "Sale",
                      sale_reversal: "Sale reversed",
                    }[movement.movement_type] ?? movement.movement_type;

                    return (
                      <tr key={movement.id} className="border-t">
                        <td className="whitespace-nowrap px-3 py-2">
                          {movement.created_at ? new Date(movement.created_at).toLocaleString() : "—"}
                        </td>
                        <td className="px-3 py-2">{activity}</td>
                        <td className="px-3 py-2">
                          {movement.branch_name || `Branch ${movement.branch_id}`}
                        </td>
                        <td className="px-3 py-2">
                          {movement.rep_name || movement.rep_username || `User ${movement.user_id}`}
                        </td>
                        <td className="px-3 py-2 capitalize">{movement.stock_location}</td>
                        <td className="px-3 py-2">
                          {movement.created_by_name || movement.created_by_username || "System"}
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums ${quantityChange >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                          {quantityChange > 0 ? "+" : ""}{quantityChange.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
              <button
                type="button"
                onClick={() => void loadMovements(movementPage - 1)}
                disabled={loadingMovements || movementPage <= 1}
                className="rounded-lg border px-3 py-1.5 disabled:opacity-50"
              >
                Newer
              </button>
              <span>Page {movementPage} of {movementLastPage}</span>
              <button
                type="button"
                onClick={() => void loadMovements(movementPage + 1)}
                disabled={loadingMovements || movementPage >= movementLastPage}
                className="rounded-lg border px-3 py-1.5 disabled:opacity-50"
              >
                Older
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
