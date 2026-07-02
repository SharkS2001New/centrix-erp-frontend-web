"use client";

import { useEffect, useRef } from "react";

const STEPS = [
  {
    title: "1. Set up routes and customers",
    body: "Create routes under Fulfillment → Routes. Assign each route customer to a route in Customers. Backoffice orders for that customer inherit the route automatically when distribution is enabled.",
  },
  {
    title: "2. Capture route orders",
    body: "Save sales in backoffice (or mobile/POS) for a customer on a route. Orders appear under Fulfillment → Route orders and count on the Routes dashboard for the selected period.",
  },
  {
    title: "3. Plan dispatch",
    body: "Open the Dispatch board, pick the delivery date and route, select orders, then create a trip. You can also create an empty trip from Dispatch trips and add orders later.",
  },
  {
    title: "4. Build loading sheets",
    body: "Open the trip, review the aggregated loading list, lock it when ready, assign driver and vehicle, then start the trip. Backoffice route orders are included by default.",
  },
  {
    title: "5. Deliver and close",
    body: "Mark orders delivered, capture proof of delivery if required, reconcile cash on the trip, and complete the run.",
  },
];

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
      ?
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
      className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/40"
      onClick={(e) => {
        if (e.target === dialogRef.current) dialogRef.current.close();
      }}
    >
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-900">Distribution workflow</h2>
        <p className="mt-1 text-sm text-slate-500">
          End-to-end guide for routes, route orders, dispatch, and trips.
        </p>
      </div>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
        {STEPS.map((step) => (
          <div key={step.title}>
            <h3 className="text-sm font-semibold text-slate-900">{step.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{step.body}</p>
          </div>
        ))}
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Tip: Organization settings → Distribution controls auto-trip assignment, loading list rules, and whether backoffice orders roll into route dispatch.
        </p>
      </div>
      <div className="border-t border-slate-200 px-5 py-3 text-right">
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
      <div className="flex items-start gap-3">
        <DistributionHelpButton className="mt-0.5 shrink-0" />
        <div>
          <h1 className="theme-heading text-xl font-medium">{title}</h1>
          {subtitle ? <p className="theme-subtext mt-0.5 text-sm">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}
