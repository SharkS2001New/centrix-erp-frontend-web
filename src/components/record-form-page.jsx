"use client";

import { usePathname } from "next/navigation";
import { useTabFormExit } from "@/hooks/use-tab-form-exit";
import { TabFormCancelButton, TabFormPageHeader } from "@/components/layout/tab-form-exit-button";

export function useRecordExit(title) {
  const pathname = usePathname();
  return useTabFormExit(title, { href: pathname });
}

/** Add/edit page that occupies its own workspace tab, the same way Centrix opens a form. */
export function RecordFormPage({ title, backHref, children, wide = false }) {
  useRecordExit(title);

  return (
    <div className={wide ? "mx-auto max-w-4xl" : "mx-auto max-w-3xl"}>
      <TabFormPageHeader
        backHref={backHref}
        title={title}
        titleClassName="theme-heading text-xl font-medium"
        subtitleClassName="theme-subtext mt-0.5 text-sm"
      />
      {children}
    </div>
  );
}

export function RecordFormActions({ backHref, submitLabel = "Save", onSubmit, submitType = "submit" }) {
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {onSubmit ? (
        <button type="button" className="theme-primary-btn rounded-lg px-4 py-2 text-sm font-medium" onClick={onSubmit}>{submitLabel}</button>
      ) : (
        <button type={submitType} className="theme-primary-btn rounded-lg px-4 py-2 text-sm font-medium">{submitLabel}</button>
      )}
      <TabFormCancelButton href={backHref} className="theme-secondary-btn rounded-lg px-4 py-2 text-sm" />
    </div>
  );
}
