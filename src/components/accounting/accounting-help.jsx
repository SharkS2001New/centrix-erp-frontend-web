"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { buildAccessContext } from "@/lib/access-control";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { usesNativeAccounting } from "@/lib/finance-settings";
import {
  ACCOUNTING_GLOSSARY,
  ACCOUNTING_GUIDE_PARTS,
  ACCOUNTING_WORKFLOW_SCREENS,
  ACCOUNTING_WORKFLOW_STEPS,
  accountingScreensForPart,
} from "@/lib/accounting-guidance";
import { resolveAvailableWorkspaces, shouldShowAccountingHelp } from "@/lib/workspaces";
import { AccountingWorkflowFlowchart } from "@/components/accounting/accounting-workflow-flowchart";

function HelpIcon({ className }) {
  return (
    <span className={`inline-flex items-center justify-center text-sm font-bold leading-none ${className}`} aria-hidden>
      ?
    </span>
  );
}

export function AccountingHelpButton({ className = "" }) {
  return (
    <button
      type="button"
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-[#185FA5] ${className}`}
      aria-label="Accounting module help"
      title="Accounting guide"
      onClick={() => {
        window.dispatchEvent(new CustomEvent("accounting-help:open"));
      }}
    >
      <HelpIcon />
    </button>
  );
}

/** App header — only while Accounting workspace is active. */
export function AccountingHelpTopbarButton() {
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
    () => shouldShowAccountingHelp(workspaces, getStoredWorkspace(), pathname),
    [pathname, workspaces],
  );

  if (!show) return null;

  return (
    <button
      type="button"
      className="app-topbar-icon-btn"
      aria-label="Accounting help"
      title="Accounting guide — learn the module step by step"
      onClick={() => {
        window.dispatchEvent(new CustomEvent("accounting-help:open"));
      }}
    >
      <HelpIcon className="h-5 w-5" />
    </button>
  );
}

export function AccountingHelpDialog() {
  const { capabilities } = useAuth();
  const [open, setOpen] = useState(false);
  const [activePartId, setActivePartId] = useState("overview");

  const nativeLedger = usesNativeAccounting(capabilities?.module_settings);

  const parts = useMemo(
    () =>
      ACCOUNTING_GUIDE_PARTS.filter((part) => {
        if (part.optional && part.id === "external" && nativeLedger) {
          return false;
        }
        return true;
      }),
    [nativeLedger],
  );

  const activePart = parts.find((p) => p.id === activePartId) ?? parts[0];

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("accounting-help:open", onOpen);
    return () => window.removeEventListener("accounting-help:open", onOpen);
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
        aria-label="Close accounting help"
        onClick={close}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="accounting-help-title"
        className="theme-panel fixed left-1/2 top-1/2 z-[71] flex h-fit max-h-[min(92vh,54rem)] w-[min(44rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border p-0 shadow-2xl"
      >
        <div className="shrink-0 border-b border-slate-200 px-6 py-5">
          <h2 id="accounting-help-title" className="text-lg font-semibold theme-heading">
            Accounting guide
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
            Learn the module part by part — from setup and daily posting to bank reconciliation and
            financial statements.
          </p>
        </div>

        <div className="shrink-0 border-b border-slate-200 px-4 py-3">
          <div className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Guide parts">
            {parts.map((part) => (
              <button
                key={part.id}
                type="button"
                role="tab"
                aria-selected={activePartId === part.id}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${
                  activePartId === part.id
                    ? "bg-[#185FA5] text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
                onClick={() => setActivePartId(part.id)}
              >
                Part {part.part}: {part.title}
              </button>
            ))}
            <button
              type="button"
              role="tab"
              aria-selected={activePartId === "glossary"}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${
                activePartId === "glossary"
                  ? "bg-[#185FA5] text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
              onClick={() => setActivePartId("glossary")}
            >
              Glossary
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {activePartId === "glossary" ? (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Key terms</h3>
              <dl className="mt-3 space-y-3">
                {ACCOUNTING_GLOSSARY.map((item) => (
                  <div key={item.term}>
                    <dt className="text-sm font-medium text-slate-900">{item.term}</dt>
                    <dd className="mt-0.5 text-sm leading-relaxed text-slate-600">{item.definition}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : activePart ? (
            <>
              <section>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#185FA5]">
                  Part {activePart.part} — {activePart.title}
                </p>
                <p className="mt-2 text-sm font-medium text-slate-800">{activePart.summary}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{activePart.intro}</p>
                {activePart.bullets?.length ? (
                  <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600">
                    {activePart.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
                {activePart.tip ? (
                  <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
                    <strong>Tip:</strong> {activePart.tip}
                  </p>
                ) : null}
              </section>

              {accountingScreensForPart(activePart.id).length > 0 ? (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Related screens
                  </h3>
                  <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {accountingScreensForPart(activePart.id).map((item) => (
                      <Link
                        key={item.id}
                        href={item.path}
                        className="block px-4 py-3 hover:bg-slate-50"
                        onClick={close}
                      >
                        <p className="text-sm font-medium text-[#185FA5]">{item.screen}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{item.path}</p>
                        <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.description}</p>
                      </Link>
                    ))}
                  </div>
                </section>
              ) : null}

              {activePart.id === "overview" ? (
                <>
                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Process overview
                    </h3>
                    <div className="mt-3">
                      <AccountingWorkflowFlowchart />
                    </div>
                  </section>

                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Month-end in five steps
                    </h3>
                    <ol className="mt-3 space-y-4">
                      {ACCOUNTING_WORKFLOW_STEPS.map((step, index) => (
                        <li key={step.title} className="flex gap-3">
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#185FA5]/10 text-xs font-bold text-[#185FA5]">
                            {index + 1}
                          </span>
                          <div>
                            <h4 className="text-sm font-semibold text-slate-900">{step.title}</h4>
                            <p className="mt-1 text-sm leading-relaxed text-slate-600">{step.body}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </section>

                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      All main screens
                    </h3>
                    <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
                      {ACCOUNTING_WORKFLOW_SCREENS.map((item) => (
                        <Link
                          key={item.id}
                          href={item.path}
                          className="block px-4 py-3 hover:bg-slate-50"
                          onClick={close}
                        >
                          <p className="text-sm font-medium text-slate-900">
                            {item.step}. {item.screen}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">{item.path}</p>
                          <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.description}</p>
                        </Link>
                      ))}
                    </div>
                  </section>
                </>
              ) : null}
            </>
          ) : null}

          {activePartId !== "glossary" && activePartId !== "overview" ? (
            <section className="rounded-lg bg-slate-50 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">Need the big picture?</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                Open{" "}
                <button
                  type="button"
                  className="font-medium text-[#185FA5] hover:underline"
                  onClick={() => setActivePartId("overview")}
                >
                  Part 1 — Overview
                </button>{" "}
                for the end-to-end flowchart and full screen list.
              </p>
            </section>
          ) : null}
        </div>

        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
          <p className="text-xs text-slate-500">
            {nativeLedger
              ? "Native ledger — reports and bank rec run inside Centrix."
              : "External ledger — journals export to QuickBooks."}
          </p>
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
