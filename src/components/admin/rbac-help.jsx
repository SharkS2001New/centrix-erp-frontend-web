"use client";

import { useEffect, useState } from "react";
import { RBAC_GUIDE_PARTS } from "@/lib/rbac-guidance";

export function RbacHelpButton({ className = "" }) {
  return (
    <button
      type="button"
      className={`inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-[#185FA5] ${className}`}
      aria-label="Roles and permissions guide"
      onClick={() => window.dispatchEvent(new CustomEvent("rbac-help:open"))}
    >
      Roles & permissions guide
    </button>
  );
}

export function RbacHelpDialog() {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState(RBAC_GUIDE_PARTS[0]?.id ?? "overview");

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("rbac-help:open", onOpen);
    return () => window.removeEventListener("rbac-help:open", onOpen);
  }, []);

  if (!open) return null;

  const active = RBAC_GUIDE_PARTS.find((part) => part.id === activeId) ?? RBAC_GUIDE_PARTS[0];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Roles & permissions guide</h2>
          <button
            type="button"
            className="rounded-lg px-3 py-1 text-sm text-slate-600 hover:bg-slate-100"
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </div>
        <div className="flex max-h-[calc(90vh-4rem)] flex-col gap-4 overflow-y-auto p-5 md:flex-row">
          <nav className="flex shrink-0 flex-row gap-2 overflow-x-auto md:w-48 md:flex-col md:overflow-visible">
            {RBAC_GUIDE_PARTS.map((part) => (
              <button
                key={part.id}
                type="button"
                className={`rounded-lg px-3 py-2 text-left text-sm ${
                  part.id === activeId
                    ? "bg-[#185FA5]/10 font-medium text-[#185FA5]"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
                onClick={() => setActiveId(part.id)}
              >
                {part.title}
              </button>
            ))}
          </nav>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-slate-900">{active.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{active.summary}</p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-700">
              {active.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
            {active.tip ? (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {active.tip}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
