"use client";

import { useTabFormExit } from "@/hooks/use-tab-form-exit";

/** Navigate away and close the current workspace tab (back link or cancel). */
export function TabFormExitButton({
  href,
  className,
  children,
  onClick,
  type = "button",
  ...props
}) {
  const { exitTo } = useTabFormExit(null);

  return (
    <button
      type={type}
      className={className}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) exitTo(href);
      }}
      {...props}
    >
      {children}
    </button>
  );
}

export function TabFormCancelButton({
  href,
  className = "rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50",
  children = "Cancel",
  ...props
}) {
  return (
    <TabFormExitButton href={href} className={className} {...props}>
      {children}
    </TabFormExitButton>
  );
}
