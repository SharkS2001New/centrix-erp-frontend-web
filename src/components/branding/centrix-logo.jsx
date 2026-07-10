import { CentrixLogoMark } from "@/components/branding/centrix-logo-mark";

export { CentrixLogoMark };

/** Sidebar wordmark — always on dark chrome (#405189 / #212529). */
export function CentrixLogo({ collapsed = false, className = "", orgSubtitle = "" }) {
  const subtitle = String(orgSubtitle ?? "").trim();

  if (collapsed) {
    return (
      <span title={subtitle || undefined} className={className}>
        <CentrixLogoMark size={28} />
      </span>
    );
  }

  return (
    <span className={`inline-flex flex-col gap-3 ${className}`}>
      <span className="inline-flex items-center gap-2.5">
        <CentrixLogoMark size={28} />
        <span className="flex items-baseline gap-0.5 leading-none">
          <span className="text-[22px] font-bold tracking-tight text-white">Centrix</span>
          <span className="text-[22px] font-light tracking-tight text-white/90"> ERP</span>
        </span>
      </span>
      {subtitle ? (
        <span
          className="max-w-[200px] truncate pl-[36px] text-[10px] font-medium leading-tight text-white/65"
          title={subtitle}
        >
          {subtitle}
        </span>
      ) : null}
    </span>
  );
}

/** Compact wordmark for app chrome (sidebar, POS header) — uses CSS vars for theme. */
export function CentrixLogoHeader({
  className = "",
  markSize = 32,
  title = "Centrix ERP",
  orgSubtitle = "",
}) {
  const subtitle = String(orgSubtitle ?? "").trim();
  const accessibleLabel = subtitle ? `${title} — ${subtitle}` : title;

  return (
    <span
      className={`pos-header-brand inline-flex min-w-0 items-center gap-2.5 ${className}`}
      title={accessibleLabel}
      aria-label={accessibleLabel}
    >
      <CentrixLogoMark size={markSize} className="shrink-0" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline gap-0.5 leading-none">
          <span className="pos-header-brand-strong truncate text-lg font-bold tracking-tight">Centrix</span>
          <span className="pos-header-brand-light truncate text-lg font-light tracking-tight"> ERP</span>
        </span>
        {subtitle ? (
          <span className="truncate text-[10px] font-medium leading-tight opacity-75" title={subtitle}>
            {subtitle}
          </span>
        ) : null}
      </span>
    </span>
  );
}

/** Login / auth / opening — mark + wordmark using theme text colors. */
export function CentrixLogoFull({ className = "" }) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <CentrixLogoMark size={40} />
      <span className="flex items-baseline gap-1 leading-none">
        <span className="text-2xl font-bold tracking-tight text-[var(--theme-text)]">Centrix</span>
        <span className="text-2xl font-light tracking-tight text-[var(--theme-text-muted,#64748b)]">
          {" "}
          ERP
        </span>
      </span>
    </span>
  );
}
