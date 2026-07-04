"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { buildAccessContext } from "@/lib/access-control";
import { getStoredWorkspace } from "@/lib/auth-storage";
import {
  resolveAvailableWorkspaces,
  shouldShowDistributionHelp,
} from "@/lib/workspaces";
import { FULFILLMENT_WORKFLOW_SCREENS } from "@/lib/fulfillment-guidance";
import { routeOrderSourcesText } from "@/lib/distribution-settings";
import { DistributionWorkflowFlowchart } from "@/components/fulfillment/distribution-workflow-flowchart";

const WORKFLOW_STEPS = [
  {
    title: "Set up routes and customers",
    body: "Create delivery routes under Fulfillment → Routes. Assign customers to routes so new orders inherit the correct run.",
    details: [
      "Each route is a geographic delivery run (for example Westlands or Karen).",
      "Backoffice orders for route customers automatically pick up the customer's route when distribution is enabled.",
    ],
  },
  {
    title: "Capture route orders",
    bodyKey: "route_order_sources",
    details: [
      "Review them under Fulfillment → Route orders.",
      "The Routes screen shows order counts and sales totals per route for the selected period.",
    ],
  },
  {
    title: "Plan trips on the dispatch board",
    body: "Group orders into a trip chart for a delivery date. Creating a trip does not dispatch the vehicle yet.",
    details: [
      "Filter by date and route on the Dispatch board.",
      "Select orders and create a trip chart, or create an empty trip from Trips and add orders later.",
      "Status after creation: Draft — not dispatched yet.",
    ],
  },
  {
    title: "Prepare the loading list",
    body: "Open the trip from Trips. The loading list aggregates product quantities across all orders on the run.",
    details: [
      "Review quantities, then lock the loading list with prepared by / checked by when picking is ready.",
      "Locking moves the trip to Loading status — still not dispatched.",
      "If there are no loading lines, you can skip straight to dispatch.",
    ],
  },
  {
    title: "Dispatch the trip",
    body: "Click Dispatch trip when the vehicle is ready to leave. This is the moment dispatch happens.",
    details: [
      "Status becomes In transit and departed_at is recorded.",
      "Expected COD is calculated for cash reconciliation.",
      "Requires driver, vehicle, and at least one order. If loading lines exist, the list must be locked first.",
    ],
  },
  {
    title: "Deliver, reconcile, and close",
    body: "During the run, mark orders delivered and capture proof of delivery when required.",
    details: [
      "Record cash collected on the trip or on the Close trip screen.",
      "Complete the trip when deliveries and reconciliation are finished.",
    ],
  },
];

const GLOSSARY = [
  {
    term: "Trip chart",
    definition: "A dispatch_trips record — one delivery run on a date with driver, vehicle, and orders.",
  },
  {
    term: "Dispatch",
    definition: "Not a separate record. Dispatch means the trip status changed to In transit after you dispatch the trip.",
  },
  {
    term: "Route order",
    definition: "A sale linked to a delivery route, on the order or via the customer's route assignment.",
  },
  {
    term: "Loading list",
    definition: "Aggregated pick list of products and quantities for all orders on a trip.",
  },
  {
    term: "Dispatch board",
    definition: "Planning screen to filter route orders and assign them to trip charts.",
  },
];

function HelpIcon({ className }) {
  return (
    <span className={`inline-flex items-center justify-center text-sm font-bold leading-none ${className}`} aria-hidden>
      ?
    </span>
  );
}

export function DistributionHelpButton({ className = "" }) {
  return (
    <button
      type="button"
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-[#185FA5] ${className}`}
      aria-label="Distribution module help"
      title="How distribution works"
      onClick={() => {
        window.dispatchEvent(new CustomEvent("distribution-help:open"));
      }}
    >
      <HelpIcon />
    </button>
  );
}

/** Single help entry point — app header, only while Distribution workspace is active. */
export function DistributionHelpTopbarButton() {
  const pathname = usePathname();
  const { user, organization, capabilities, isSuperAdmin } = useAuth();

  const ctx = useMemo(
    () =>
      buildAccessContext({
        user,
        organization,
        capabilities,
        isSuperAdmin,
      }),
    [capabilities, isSuperAdmin, organization, user],
  );

  const workspaces = useMemo(
    () => resolveAvailableWorkspaces(ctx, capabilities),
    [capabilities, ctx],
  );

  const show = useMemo(
    () => shouldShowDistributionHelp(workspaces, getStoredWorkspace(), pathname),
    [pathname, workspaces],
  );

  if (!show) return null;

  return (
    <button
      type="button"
      className="app-topbar-icon-btn"
      aria-label="Distribution help"
      title="How distribution works"
      onClick={() => {
        window.dispatchEvent(new CustomEvent("distribution-help:open"));
      }}
    >
      <HelpIcon className="h-5 w-5" />
    </button>
  );
}

export function DistributionHelpDialog() {
  const { capabilities } = useAuth();
  const [open, setOpen] = useState(false);

  const workflowSteps = useMemo(
    () =>
      WORKFLOW_STEPS.map((step) => ({
        ...step,
        body:
          step.bodyKey === "route_order_sources"
            ? `Route orders are sales tied to a delivery route — from ${routeOrderSourcesText(capabilities).toLowerCase()}.`
            : step.body,
      })),
    [capabilities],
  );

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("distribution-help:open", onOpen);
    return () => window.removeEventListener("distribution-help:open", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event) {
      if (event.key === "Escape") close();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[70] bg-black/50"
        aria-label="Close distribution help"
        onClick={close}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="distribution-help-title"
        className="theme-panel fixed left-1/2 top-1/2 z-[71] flex h-fit max-h-[min(90vh,52rem)] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border p-0 shadow-2xl"
      >
        <div className="shrink-0 border-b border-slate-200 px-6 py-5">
          <h2 id="distribution-help-title" className="text-lg font-semibold theme-heading">
            Distribution guide
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
            From route order to closed trip: plan on the dispatch board, prepare loading lists, dispatch when the
            vehicle leaves, then reconcile and close.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Process overview</h3>
            <div className="mt-3">
              <DistributionWorkflowFlowchart />
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step by step</h3>
            <ol className="mt-3 space-y-4">
              {workflowSteps.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#185FA5]/10 text-xs font-bold text-[#185FA5]">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-slate-900">{step.title}</h4>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{step.body}</p>
                    {step.details?.length ? (
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-sm leading-relaxed text-slate-600">
                        {step.details.map((detail) => (
                          <li key={detail}>{detail}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Screens in workflow order</h3>
            <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {FULFILLMENT_WORKFLOW_SCREENS.map((item) => (
                <div key={item.id} className="px-4 py-3">
                  <p className="text-sm font-medium text-slate-900">
                    {item.step}. {item.screen}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">{item.path}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Key terms</h3>
            <dl className="mt-3 space-y-3">
              {GLOSSARY.map((item) => (
                <div key={item.term}>
                  <dt className="text-sm font-medium text-slate-900">{item.term}</dt>
                  <dd className="mt-0.5 text-sm leading-relaxed text-slate-600">{item.definition}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-lg bg-slate-50 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">Organization settings</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Organization settings → Distribution controls auto-trip assignment, loading list rules, proof of
              delivery, and cash reconciliation. Platform administrators can enable interactive step guidance per
              organization under Distribution → Trips & loading.
            </p>
          </section>
        </div>

        <div className="shrink-0 border-t border-slate-200 px-6 py-4 text-right">
          <button
            type="button"
            className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#144f8a]"
            onClick={close}
          >
            Got it
          </button>
        </div>
      </div>
    </>
  );
}

export function DistributionPageHeader({ title, subtitle, action }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="theme-heading text-xl font-medium">{title}</h1>
        {subtitle ? <p className="theme-subtext mt-0.5 text-sm">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
