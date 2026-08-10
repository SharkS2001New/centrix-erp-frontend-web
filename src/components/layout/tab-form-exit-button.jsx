"use client";

import { useTabFormExit } from "@/hooks/use-tab-form-exit";

function BackArrowIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className={className}
      aria-hidden
    >
      <path d="M12.5 4.5 7 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.5 10h9" strokeLinecap="round" />
    </svg>
  );
}

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

/** Icon back control — same close-tab behavior as Cancel. */
export function TabFormBackButton({
  href,
  label = "Back",
  className = "theme-secondary-btn inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border shadow-sm",
  onClick,
  ...props
}) {
  return (
    <TabFormExitButton
      href={href}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={className}
      {...props}
    >
      <BackArrowIcon />
    </TabFormExitButton>
  );
}

/**
 * Top-of-form header with a back arrow that exits like Cancel
 * (navigate to the list/detail page and close this tab).
 */
export function TabFormPageHeader({
  backHref,
  backLabel = "Back",
  title,
  subtitle,
  onBackClick,
  titleClassName = "text-xl font-medium text-slate-900",
  subtitleClassName = "mt-0.5 text-sm text-slate-500",
  className = "mb-6 flex items-start gap-3",
}) {
  return (
    <div className={className}>
      <TabFormBackButton href={backHref} label={backLabel} onClick={onBackClick} />
      <div className="min-w-0 pt-0.5">
        {title ? <h1 className={titleClassName}>{title}</h1> : null}
        {subtitle ? <p className={subtitleClassName}>{subtitle}</p> : null}
      </div>
    </div>
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
