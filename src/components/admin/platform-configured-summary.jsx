"use client";

import { useMemo } from "react";
import { useAuth } from "@/contexts/auth-context";
import { workflowPipelineSteps } from "@/lib/order-workflow";
import {
  isPlatformCheckoutOnCreateEnabled,
  isPlatformMobileOrdersEnabled,
  isOrderCancellationEnabled,
} from "@/lib/platform-org-features";
import {
  getOrdersListSort,
  normalizeOrdersListDefaultDays,
  normalizeOrdersListSearchDays,
  ORDERS_LIST_SORT_OPTIONS,
} from "@/lib/sales-settings";

export function PlatformConfiguredSalesSummary({ capabilities: capabilitiesProp }) {
  const { capabilities: authCapabilities } = useAuth();
  const capabilities = capabilitiesProp ?? authCapabilities;
  const sales = capabilities?.module_settings?.sales ?? {};
  const workflow = sales.order_workflow;
  const ordersListDays = normalizeOrdersListDefaultDays(sales.orders_list_default_days);
  const ordersSearchDays = normalizeOrdersListSearchDays(
    sales.orders_list_search_days,
    ordersListDays,
  );
  const ordersListSortLabel = useMemo(() => {
    const sort = getOrdersListSort(capabilities?.module_settings);
    return ORDERS_LIST_SORT_OPTIONS.find((option) => option.value === sort)?.label ?? sort;
  }, [capabilities?.module_settings]);
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
        Module access, checkout vs save order, mobile orders, till float, and order workflow are set when
        your organization was registered. Contact your platform administrator to change them.
      </p>
      <ul className="mt-3 space-y-1 text-xs">
        {isPlatformCheckoutOnCreateEnabled(capabilities) ? (
          <li>
            <span className="font-medium">POS checkout on create:</span> Checkout
          </li>
        ) : (
          <li>
            <span className="font-medium">POS order flow:</span> Save order (no checkout)
          </li>
        )}
        {isPlatformMobileOrdersEnabled(capabilities) ? (
          <li>
            <span className="font-medium">Mobile orders:</span> Enabled
          </li>
        ) : null}
        {capabilities?.module_settings?.sales?.require_pos_till_float ? (
          <li>
            <span className="font-medium">POS till float:</span> Required
          </li>
        ) : null}
        {pipeline.length > 0 ? (
          <li>
            <span className="font-medium">Order pipeline:</span>{" "}
            {pipeline.map((s) => s.label).join(" → ")}
          </li>
        ) : null}
        <li>
          <span className="font-medium">Orders list:</span> Filter last {ordersListDays} days ·
          search last {ordersSearchDays} days · {ordersListSortLabel}
        </li>
        {capabilities?.module_settings?.sales?.order_expiry_enabled !== false ? (
          <li>
            <span className="font-medium">Stale order expiry:</span> On · after {sales.order_expiry_days ?? 5} days
            · Expired orders link in Sales → Orders
          </li>
        ) : null}
        {isOrderCancellationEnabled(capabilities) ? (
          <li>
            <span className="font-medium">Order cancellation:</span> Enabled for booked, pending, and unpaid
            orders · Cancelled orders link in Sales → Orders
          </li>
        ) : null}
      </ul>
    </div>
  );
}
