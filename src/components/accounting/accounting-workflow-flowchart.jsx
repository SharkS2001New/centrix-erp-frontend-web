"use client";

import Link from "next/link";
import { ACCOUNTING_WORKFLOW_SCREENS } from "@/lib/accounting-guidance";

function FlowArrow() {
  return (
    <span className="hidden shrink-0 text-slate-400 sm:inline" aria-hidden>
      →
    </span>
  );
}

export function AccountingWorkflowFlowchart() {
  const monthEndFlow = [
    { label: "Operations", hint: "Sales, purchases, payments" },
    { label: "Review AR/AP", hint: "Subledgers" },
    { label: "Bank rec", hint: "Match statement", highlight: true },
    { label: "Reports", hint: "TB, P&L, BS" },
    { label: "Close period", hint: "Lock month" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Typical month-end path</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {monthEndFlow.map((step, index) => (
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
              {index < monthEndFlow.length - 1 ? <FlowArrow /> : null}
            </span>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Main screens (in order)</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {ACCOUNTING_WORKFLOW_SCREENS.slice(0, 8).map((screen, index) => (
            <span key={screen.id} className="inline-flex items-center gap-2">
              <Link
                href={screen.path}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-medium text-slate-800 hover:border-[#185FA5] hover:text-[#185FA5]"
              >
                {screen.step}. {screen.screen}
              </Link>
              {index < 7 ? <FlowArrow /> : null}
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          …then Trial balance, P&L, and Balance sheet when closing the month.
        </p>
      </div>
    </div>
  );
}
