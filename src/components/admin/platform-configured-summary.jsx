"use client";

import { useMemo } from "react";
import { useAuth } from "@/contexts/auth-context";
import { workflowPipelineSteps } from "@/lib/order-workflow";

export function PlatformConfiguredSalesSummary() {
  const { capabilities } = useAuth();
  const sales = capabilities?.module_settings?.sales ?? {};
  const workflow = sales.order_workflow;
  const pipeline = useMemo(
    () =>
      workflowPipelineSteps({
        pipeline: (workflow?.steps ?? [])
          .filter((s) => s.enabled !== false)
          .map((s) => ({ key: s.status, label: s.label })),
      }),
    [workflow?.steps],
  );

  return (
    <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
      <p className="font-medium text-slate-900">Configured by platform administrator</p>
      <p className="mt-1 text-xs text-slate-500">
        Module access, checkout vs save order, and order workflow are set when your organization was
        registered. Contact your platform administrator to change them.
      </p>
      <ul className="mt-3 space-y-1 text-xs">
        <li>
          <span className="font-medium">POS checkout on create:</span>{" "}
          {sales.show_checkout_on_create_order !== false ? "Checkout" : "Save order (no checkout)"}
        </li>
        <li>
          <span className="font-medium">POS orders in sidebar:</span>{" "}
          {sales.enable_pos_orders ? "Enabled" : "Disabled"}
        </li>
        {pipeline.length > 0 ? (
          <li>
            <span className="font-medium">Order pipeline:</span>{" "}
            {pipeline.map((s) => s.label).join(" → ")}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
