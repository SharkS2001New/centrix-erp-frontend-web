"use client";

import { useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";

export default function SalesPage() {
  const { user, capabilities } = useAuth();
  const channel =
    capabilities?.channels?.includes("backend")
      ? "backend"
      : capabilities?.channels?.[0] ?? "pos";
  const [productCode, setProductCode] = useState("6161100100015");
  const [quantity, setQuantity] = useState("1");
  const [cart, setCart] = useState(null);
  const [sale, setSale] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  async function createCart() {
    setBusy(true);
    setMessage(null);
    setSale(null);
    try {
      const c = await apiRequest("/sales/carts", {
        method: "POST",
        body: {
          channel,
          branch_id: user?.branch_id,
        },
      });
      setCart(c);
      setMessage(`Cart #${c.id} created (${channel})`);
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : "Failed to create cart");
    } finally {
      setBusy(false);
    }
  }

  async function addLine(e) {
    e.preventDefault();
    if (!cart) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiRequest(`/sales/carts/${cart.id}/lines`, {
        method: "POST",
        body: {
          product_code: productCode,
          quantity: parseFloat(quantity),
        },
      });
      const updated = await apiRequest(`/sales/carts/${cart.id}`);
      setCart(updated);
      setMessage("Line added");
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : "Failed to add line");
    } finally {
      setBusy(false);
    }
  }

  async function checkout() {
    if (!cart) return;
    setBusy(true);
    setMessage(null);
    try {
      const s = await apiRequest(`/sales/carts/${cart.id}/checkout`, {
        method: "POST",
        body: {
          status: "completed",
          payment_method_code: "CASH",
        },
      });
      setSale(s);
      setCart(null);
      setMessage(`Sale completed — order #${s.order_num}`);
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-white">Sales</h1>
      <p className="mt-1 text-sm text-slate-400">
        Cart → lines → checkout (operations API)
      </p>

      <div className="mt-6 space-y-4">
        <button
          type="button"
          onClick={createCart}
          disabled={busy}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          1. New cart
        </button>

        {cart && (
          <>
            <p className="text-sm text-slate-400">
              Cart #{cart.id} · {cart.lines?.length ?? 0} line(s)
            </p>
            <form onSubmit={addLine} className="flex flex-wrap gap-2">
              <input
                className="min-w-[10rem] flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                placeholder="Product code"
                value={productCode}
                onChange={(e) => setProductCode(e.target.value)}
              />
              <input
                className="w-24 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                type="number"
                step="any"
                min="0.001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm hover:bg-slate-800"
              >
                2. Add line
              </button>
            </form>
            <button
              type="button"
              onClick={checkout}
              disabled={busy}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-200 disabled:opacity-50"
            >
              3. Checkout
            </button>
            {cart.lines && cart.lines.length > 0 && (
              <ul className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-sm">
                {cart.lines.map((l) => (
                  <li key={l.id} className="flex justify-between py-1 text-slate-300">
                    <span>{l.product_name ?? l.product_code}</span>
                    <span>
                      {l.quantity} × {l.unit_price} = {l.amount}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {sale && (
          <div className="rounded-lg border border-emerald-800/50 bg-emerald-950/30 p-4 text-sm text-emerald-200">
            Order #{sale.order_num} · {sale.status} · total {sale.order_total}
          </div>
        )}

        {message && (
          <p className="text-sm text-slate-400">{message}</p>
        )}
      </div>
    </div>
  );
}
