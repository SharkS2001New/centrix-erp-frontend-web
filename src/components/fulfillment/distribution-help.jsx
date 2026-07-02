"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const WORKFLOW_STEPS = [
  {
    title: "Set up routes and customers",
    body: "Create delivery routes under Fulfillment → Routes. Each route represents a geographic run (for example Westlands or Karen).",
    details: [
      "Open a customer record and assign them to a route under the Distribution section.",
      "When distribution is enabled, backoffice orders for that customer automatically inherit the customer's route.",
      "You can also set a route directly on a sale when needed.",
    ],
  },
  {
    title: "Capture route orders",
    body: "Route orders are sales tied to a delivery route — from mobile reps, POS, or backoffice.",
    details: [
      "Mobile and POS orders count when the customer is on a route.",
      "Backoffice orders count when the customer has a route assignment (or the order has a route set).",
      "View them under Fulfillment → Route orders. The Routes dashboard shows order count and sales total per route for the selected period.",
    ],
  },
  {
    title: "Plan dispatch on the board",
    body: "The Dispatch board is where you group orders into a delivery run for a specific date and route.",
    details: [
      "Pick the delivery date and route filter at the top.",
      "Select the orders you want on the run, then create a trip.",
      "You can also create an empty trip from Dispatch trips and add orders later.",
      "Auto-dispatch settings in Organization settings are defaults — you can still assign drivers and create trips manually.",
    ],
  },
  {
    title: "Build loading sheets and start the trip",
    body: "Each trip has a loading list that aggregates product quantities across all orders on the run.",
    details: [
      "Open the trip from Dispatch trips and review the loading list.",
      "Lock the loading list when picking is ready so quantities stay fixed.",
      "Assign a driver and vehicle, then start the trip.",
      "Backoffice route orders are included in loading lists by default unless changed in Distribution settings.",
    ],
  },
  {
    title: "Deliver, reconcile, and close",
    body: "During and after the run, track delivery status and cash collection.",
    details: [
      "Mark individual orders as delivered from the trip or order screens.",
      "Capture proof of delivery (signature or photo) when your settings require it.",
      "On trip close, reconcile cash collected against expected amounts.",
      "Complete the trip when the run is finished.",
    ],
  },
];

const SCREEN_GUIDE = [
  {
    screen: "Routes",
    path: "/fulfillment/routes",
    description: "Create and manage routes. Use period stats to see today's orders and sales per route.",
  },
  {
    screen: "Route orders",
    path: "/fulfillment/orders",
    description: "List of all open route orders waiting for dispatch or already on a trip.",
  },
  {
    screen: "Dispatch board",
    path: "/fulfillment/dispatch",
    description: "Select orders by date and route, then create or add to trips.",
  },
  {
    screen: "Dispatch trips",
    path: "/fulfillment/trips",
    description: "All trips — draft, in progress, and completed. Open a trip for loading lists and delivery tracking.",
  },
];

const GLOSSARY = [
  { term: "Route order", definition: "A sale linked to a delivery route, either on the order itself or via the customer's route assignment." },
  { term: "Trip", definition: "A single delivery run on a date, usually for one route, carrying one or more orders." },
  { term: "Loading list", definition: "Aggregated pick list of all products and quantities needed for orders on a trip." },
  { term: "Dispatch board", definition: "Planning screen to filter route orders and assign them to trips." },
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

export function DistributionHelpTopbarButton() {
  const pathname = usePathname();
  const show = pathname?.startsWith("/fulfillment");

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
  const dialogRef = useRef(null);

  useEffect(() => {
    function onOpen() {
      dialogRef.current?.showModal();
    }
    window.addEventListener("distribution-help:open", onOpen);
    return () => window.removeEventListener("distribution-help:open", onOpen);
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-[70] m-auto flex h-fit max-h-[min(90vh,52rem)] w-[min(42rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-black/50 open:flex"
      onClick={(e) => {
        if (e.target === dialogRef.current) dialogRef.current.close();
      }}
    >
      <div className="shrink-0 border-b border-slate-200 px-6 py-5">
        <h2 className="text-lg font-semibold text-slate-900">Distribution guide</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
          Move orders from sale to delivery: assign customers to routes, plan dispatch, build loading sheets,
          and close trips with cash reconciliation.
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Workflow</h3>
          <ol className="mt-3 space-y-4">
            {WORKFLOW_STEPS.map((step, index) => (
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
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Where to find things</h3>
          <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {SCREEN_GUIDE.map((item) => (
              <div key={item.screen} className="px-4 py-3">
                <p className="text-sm font-medium text-slate-900">{item.screen}</p>
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
            Go to Organization settings → Distribution to control auto-trip assignment, whether backoffice orders
            appear on loading lists, delivery date rules, proof-of-delivery requirements, and cash reconciliation.
            These settings set defaults — dispatch staff can still create trips and assign drivers manually.
          </p>
        </section>
      </div>

      <div className="shrink-0 border-t border-slate-200 px-6 py-4 text-right">
        <button
          type="button"
          className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#144f8a]"
          onClick={() => dialogRef.current?.close()}
        >
          Got it
        </button>
      </div>
    </dialog>
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
