"use client";

import { useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { OrderWorkflowPipeline } from "./sales-shared";
import { nextTransitionOptions } from "@/lib/sales";

export function SaleWorkflowPanel({ sale, onUpdated }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  async function advance(targetStatus) {
    if (!sale?.id) return;
    setBusy(targetStatus);
    setError(null);
    try {
      await apiRequest(`/sales/orders/${sale.id}/transition`, {
        method: "POST",
        body: { status: targetStatus },
      });
      await onUpdated?.();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Transition failed");
    } finally {
      setBusy(null);
    }
  }

  const nextOptions = nextTransitionOptions(sale?.status);

  return (
    <div className="space-y-3">
      <OrderWorkflowPipeline
        status={sale?.status}
        onAdvance={nextOptions.length ? advance : null}
        busyStatus={busy}
      />
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {nextOptions.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {nextOptions
            .filter((s) => s !== "cancelled")
            .map((status) => (
              <button
                key={status}
                type="button"
                disabled={!!busy}
                onClick={() => advance(status)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                → {status.replace(/_/g, " ")}
              </button>
            ))}
        </div>
      ) : null}
    </div>
  );
}
