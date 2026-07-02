"use client";

import Link from "next/link";
import { FULFILLMENT_WORKFLOW_SCREENS } from "@/lib/fulfillment-guidance";

function FlowArrow() {
  return (
    <span className="hidden shrink-0 text-slate-400 sm:inline" aria-hidden>
      →
    </span>
  );
}

export function DistributionWorkflowFlowchart() {
  const tripFlow = [
    { label: "Draft", hint: "Trip chart created" },
    { label: "Loading", hint: "List locked" },
    { label: "Dispatched", hint: "In transit", highlight: true },
    { label: "Completed", hint: "Run closed" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">End-to-end flow</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {FULFILLMENT_WORKFLOW_SCREENS.map((screen, index) => (
            <span key={screen.id} className="inline-flex items-center gap-2">
              <Link
                href={screen.path}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-medium text-slate-800 hover:border-[#185FA5] hover:text-[#185FA5]"
              >
                {index + 1}. {screen.screen}
              </Link>
              {index < FULFILLMENT_WORKFLOW_SCREENS.length - 1 ? <FlowArrow /> : null}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Trip chart status</p>
        <p className="mt-2 text-sm text-slate-600">
          A trip chart is the dispatch plan. There is no separate dispatch record — the vehicle is{" "}
          <strong>dispatched</strong> when you click <strong>Dispatch trip</strong> and status becomes{" "}
          <strong>In transit</strong>.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {tripFlow.map((step, index) => (
            <span key={step.label} className="inline-flex items-center gap-2">
              <span
                className={`rounded-lg border px-3 py-2 text-sm ${
                  step.highlight
                    ? "border-[#185FA5] bg-[#E6F1FB] font-semibold text-[#185FA5]"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                <span className="block font-medium">{step.label}</span>
                <span className="block text-xs font-normal text-slate-500">{step.hint}</span>
              </span>
              {index < tripFlow.length - 1 ? <FlowArrow /> : null}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Before dispatch: assign orders → review loading list → lock list (when lines exist). After dispatch:
          deliver stops → reconcile cash → close trip.
        </p>
      </div>
    </div>
  );
}
