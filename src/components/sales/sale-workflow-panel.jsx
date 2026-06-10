"use client";

import { useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { getOrderWorkflow } from "@/lib/order-workflow";
import { OrderWorkflowPipeline } from "./sales-shared";
import { nextTransitionOptions, saleStatusLabel } from "@/lib/sales";

export function SaleWorkflowPanel({ sale, onUpdated }) {
  const { capabilities } = useAuth();
  const workflow = useMemo(
    () => getOrderWorkflow(capabilities, sale),
    [capabilities, sale],
  );
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

  const nextOptions = nextTransitionOptions(sale?.status, workflow);

  return (
    <div className="space-y-3">
      <OrderWorkflowPipeline
        status={sale?.status}
        workflow={workflow}
        orderSource={sale?.order_source}
        channel={sale?.channel}
        onAdvance={nextOptions.length ? advance : null}
        busyStatus={busy}
      />
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {nextOptions.filter((s) => s !== "cancelled").length > 0 ? (
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
                {saleStatusLabel(status, workflow)}
              </button>
            ))}
        </div>
      ) : null}
    </div>
  );
}
