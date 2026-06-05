"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  Field,
  FormModal,
  IconButton,
  PencilIcon,
  PrimaryButton,
  TrashIcon,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import {
  InventoryPageShell,
  InventoryTableShell,
  SESSION_STATUS_LABELS,
} from "@/components/inventory/inventory-shared";

async function fetchAllPages(path, searchParams = {}) {
  const all = [];
  let pageNum = 1;
  let lastPage = 1;
  do {
    const res = await apiRequest(path, {
      searchParams: { ...searchParams, page: pageNum, per_page: 200 },
    });
    all.push(...(res.data ?? []));
    lastPage = res.last_page ?? 1;
    pageNum += 1;
  } while (pageNum <= lastPage);
  return all;
}

async function createStockTakeLines(sessionId, lineBodies) {
  const batchSize = 20;
  for (let i = 0; i < lineBodies.length; i += batchSize) {
    const batch = lineBodies.slice(i, i + batchSize);
    await Promise.all(
      batch.map((body) =>
        apiRequest("/stock-take-lines", {
          method: "POST",
          body: { session_id: sessionId, ...body },
        }),
      ),
    );
  }
}

async function upsertCurrentStockBatch(branchId, products, stockByCode) {
  const batchSize = 20;
  const bodies = products.map((product) => {
    const stock = stockByCode.get(product.product_code);
    return {
      product_code: product.product_code,
      branch_id: branchId,
      shop_quantity: reconciledStockQty(stock, "shop", product),
      store_quantity: reconciledStockQty(stock, "store", product),
    };
  });

  for (let i = 0; i < bodies.length; i += batchSize) {
    const batch = bodies.slice(i, i + batchSize);
    await Promise.all(
      batch.map((body) => apiRequest("/current-stock", { method: "POST", body })),
    );
  }
}

/** Use branch stock row when set; fall back to product totals when ledger row is missing or zero. */
function reconciledStockQty(stockRow, location, product) {
  const productField = location === "shop" ? "stock_in_shop" : "stock_in_store";
  const stockField = location === "shop" ? "shop_quantity" : "store_quantity";
  const fromProduct = Number(product[productField] ?? 0);
  if (!stockRow) return fromProduct;
  const fromStock = Number(stockRow[stockField] ?? 0);
  if (fromStock === 0 && fromProduct > 0) return fromProduct;
  return fromStock;
}

export default function StockTakeListPage() {
  const router = useRouter();
  const { user } = useAuth();
  const branchId = user?.branch_id ?? 1;

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [creating, setCreating] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [form, setForm] = useState({
    session_code: "",
    stock_location: "both",
  });

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest("/stock-take-sessions", {
        searchParams: { per_page: 100, "filter[branch_id]": branchId },
      });
      setSessions(res.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stock take sessions");
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  async function startSession() {
    if (!form.session_code.trim()) return;

    setCreating(true);
    setError(null);
    try {
      const session = await apiRequest("/stock-take-sessions", {
        method: "POST",
        body: {
          branch_id: branchId,
          session_code: form.session_code.trim(),
          stock_location: form.stock_location,
          status: "in_progress",
          started_by: user?.id,
        },
      });

      const [products, stockRows] = await Promise.all([
        fetchAllPages("/products"),
        fetchAllPages("/current-stock", { "filter[branch_id]": branchId }),
      ]);
      const stockByCode = new Map(stockRows.map((row) => [row.product_code, row]));
      const loc = form.stock_location;
      const lineBodies = [];

      for (const product of products) {
        const stock = stockByCode.get(product.product_code);
        const shopQty = reconciledStockQty(stock, "shop", product);
        const storeQty = reconciledStockQty(stock, "store", product);

        const lineDefs =
          loc === "both"
            ? [
                { location: "shop", qty: shopQty },
                { location: "store", qty: storeQty },
              ]
            : [
                {
                  location: loc,
                  qty: Number(loc === "shop" ? shopQty : storeQty),
                },
              ];

        for (const line of lineDefs) {
          lineBodies.push({
            product_code: product.product_code,
            stock_location: line.location,
            system_quantity: line.qty,
            counted_quantity: line.qty,
          });
        }
      }

      await upsertCurrentStockBatch(branchId, products, stockByCode);
      await createStockTakeLines(session.id, lineBodies);

      setModalOpen(false);
      setForm({ session_code: "", stock_location: "both" });
      router.push(`/inventory/stock-take/${session.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start session");
    } finally {
      setCreating(false);
    }
  }

  function openEdit(session) {
    setEditingSession(session);
    setForm({
      session_code: session.session_code ?? "",
      stock_location: session.stock_location ?? "both",
    });
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editingSession) return;
    setSavingEdit(true);
    setError(null);
    try {
      await apiRequest(`/stock-take-sessions/${editingSession.id}`, {
        method: "PUT",
        body: { session_code: form.session_code.trim() },
      });
      setEditOpen(false);
      setEditingSession(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update session");
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteSession(session) {
    if (session.status === "completed") {
      setError("Completed stock takes cannot be deleted.");
      return;
    }
    if (!window.confirm(`Delete stock take "${session.session_code}"?`)) return;
    setError(null);
    try {
      await apiRequest(`/stock-take-sessions/${session.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete session");
    }
  }

  return (
    <InventoryPageShell
      title="Stock take"
      subtitle="Count stock in the shop or warehouse and reconcile differences"
      action={
        <PrimaryButton type="button" onClick={() => setModalOpen(true)}>
          New session
        </PrimaryButton>
      }
    >
      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <InventoryTableShell>
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading sessions…</p>
        ) : sessions.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">No stock take sessions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">Session</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id} className="border-b border-slate-100">
                    <td className="px-4 py-3">
                      <Link
                        href={`/inventory/stock-take/${session.id}`}
                        className="font-medium text-[#185FA5] hover:underline"
                      >
                        {session.session_code}
                      </Link>
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-600">
                      {session.stock_location?.replace("_", " ")}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          session.status === "completed"
                            ? "bg-emerald-50 text-emerald-700"
                            : session.status === "in_progress"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {SESSION_STATUS_LABELS[session.status] ?? session.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {session.status !== "completed" ? (
                          <>
                            <IconButton label="Edit" onClick={() => openEdit(session)}>
                              <PencilIcon />
                            </IconButton>
                            <IconButton label="Delete" onClick={() => deleteSession(session)}>
                              <TrashIcon />
                            </IconButton>
                          </>
                        ) : null}
                        <Link
                          href={`/inventory/stock-take/${session.id}`}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Open
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </InventoryTableShell>

      <FormModal
        title="Start stock take"
        open={modalOpen}
        onClose={() => !creating && setModalOpen(false)}
        onSubmit={startSession}
        saving={creating}
        submitLabel="Start"
      >
        <Field label="Session name">
          <input
            className={inputClassName()}
            value={form.session_code}
            onChange={(e) => setForm((p) => ({ ...p, session_code: e.target.value }))}
            placeholder="June count"
            required
          />
        </Field>
        <Field label="Warehouse / location">
          <select
            className={inputClassName()}
            value={form.stock_location}
            onChange={(e) => setForm((p) => ({ ...p, stock_location: e.target.value }))}
          >
            <option value="both">Shop and store</option>
            <option value="shop">Shop only</option>
            <option value="store">Store / warehouse only</option>
          </select>
        </Field>
      </FormModal>

      <FormModal
        title="Edit session"
        open={editOpen}
        onClose={() => !savingEdit && setEditOpen(false)}
        onSubmit={saveEdit}
        saving={savingEdit}
        submitLabel="Save"
      >
        <Field label="Session name">
          <input
            className={inputClassName()}
            value={form.session_code}
            onChange={(e) => setForm((p) => ({ ...p, session_code: e.target.value }))}
            required
          />
        </Field>
      </FormModal>
    </InventoryPageShell>
  );
}
