"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

function stepClass(state) {
  if (state === "done") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (state === "next") return "border-[var(--theme-primary)] bg-[var(--theme-primary)]/10 text-[var(--theme-primary)] ring-2 ring-[var(--theme-primary)]/30";
  if (state === "current") return "border-slate-300 bg-white text-slate-800";
  return "border-slate-200 bg-slate-50 text-slate-500";
}

export function FulfillmentGuidanceStrip({ title = "Next steps", steps, nextStep }) {
  const [open, setOpen] = useState(true);
  const tooltipRef = useRef(null);

  useEffect(() => {
    if (!nextStep?.scrollTo) return;
    function onClick(event) {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [nextStep?.scrollTo]);

  if (!steps?.length) return null;

  function handleStepClick(step) {
    if (step.state !== "next") return;
    if (step.href) return;
    if (step.scrollTo) {
      document.getElementById(step.scrollTo)?.scrollIntoView({ behavior: "smooth", block: "center" });
      setOpen(true);
    }
  }

  return (
    <section className="mb-6 theme-panel rounded-xl border p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-1 text-sm text-slate-600">
            Click a highlighted step for guidance. Dispatch happens only when you dispatch the trip.
          </p>
        </div>
        {nextStep ? (
          <div className="relative" ref={tooltipRef}>
            <button
              type="button"
              className="rounded-lg bg-[var(--theme-primary)] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[var(--theme-primary-hover)]"
              onClick={() => setOpen((value) => !value)}
            >
              Next: {nextStep.label}
            </button>
            {open ? (
              <div
                role="tooltip"
                className="absolute right-0 top-full z-20 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-lg"
              >
                <p className="font-semibold text-slate-900">{nextStep.label}</p>
                <p className="mt-1 text-slate-600">{nextStep.hint}</p>
                {nextStep.href ? (
                  <Link
                    href={nextStep.href}
                    className="mt-3 inline-flex text-sm font-medium text-[#185FA5] hover:underline"
                  >
                    {nextStep.actionLabel ?? "Continue"} →
                  </Link>
                ) : nextStep.actionLabel ? (
                  <button
                    type="button"
                    className="mt-3 text-sm font-medium text-[#185FA5] hover:underline"
                    onClick={() => handleStepClick(nextStep)}
                  >
                    {nextStep.actionLabel} →
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <ol className="mt-4 flex flex-wrap gap-2">
        {steps.map((step, index) => {
          const clickable = step.state === "next" && (step.href || step.scrollTo);
          const Tag = step.href && step.state === "next" ? Link : "button";
          const props =
            step.href && step.state === "next"
              ? { href: step.href }
              : {
                  type: "button",
                  disabled: !clickable,
                  onClick: () => handleStepClick(step),
                };

          return (
            <li key={step.id}>
              <Tag
                {...props}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${stepClass(step.state)} ${
                  clickable ? "cursor-pointer hover:brightness-95" : "cursor-default"
                }`}
                title={step.hint}
              >
                <span className="font-bold">{index + 1}</span>
                {step.label}
                {step.state === "done" ? <span aria-hidden>✓</span> : null}
              </Tag>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
