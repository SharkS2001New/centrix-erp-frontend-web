"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTabFormExit } from "@/hooks/use-tab-form-exit";
import { TabFormCancelButton, TabFormPageHeader } from "@/components/layout/tab-form-exit-button";

export function useRecordExit(title) {
  const pathname = usePathname();
  return useTabFormExit(title, { href: pathname });
}

/** Add/edit page that occupies its own workspace tab, the same way Centrix opens a form. */
export function RecordFormPage({ title, subtitle, backHref, children, wide = false, align = "center" }) {
  useRecordExit(title);
  const width = wide ? "max-w-4xl" : "max-w-3xl";

  return (
    <div className={align === "start" ? width : `mx-auto ${width}`}>
      <TabFormPageHeader
        backHref={backHref}
        title={title}
        subtitle={subtitle}
        titleClassName="theme-heading text-xl font-semibold"
        subtitleClassName="theme-subtext mt-0.5 text-sm"
      />
      {children}
    </div>
  );
}

/** Wide, left-aligned add/edit popup. The list stays behind it. */
export function RecordFormDialog({ title, subtitle, backHref, children }) {
  const { exitTo } = useRecordExit(title);
  function close() {
    if (backHref) exitTo(backHref);
  }

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape" && backHref) exitTo(backHref);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [backHref, exitTo]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/45 p-4 sm:p-8"
      role="presentation"
      onMouseDown={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="theme-panel my-2 w-full max-w-5xl rounded-2xl border p-6 text-left shadow-xl sm:p-8"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="theme-heading text-xl font-semibold">{title}</h2>
            {subtitle ? <p className="theme-subtext mt-1 text-sm">{subtitle}</p> : null}
          </div>
          <button type="button" className="theme-subtext shrink-0 rounded-lg px-2 py-1 text-sm hover:bg-[var(--theme-surface-muted)]" onClick={close}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function RecordFormActions({ backHref, submitLabel = "Save", onSubmit, submitType = "submit", className = "mt-5 flex flex-wrap gap-2" }) {
  return (
    <div className={className}>
      {onSubmit ? (
        <button type="button" className="theme-primary-btn rounded-lg px-4 py-2 text-sm font-medium" onClick={onSubmit}>{submitLabel}</button>
      ) : (
        <button type={submitType} className="theme-primary-btn rounded-lg px-4 py-2 text-sm font-medium">{submitLabel}</button>
      )}
      <TabFormCancelButton href={backHref} className="theme-secondary-btn rounded-lg px-4 py-2 text-sm" />
    </div>
  );
}
