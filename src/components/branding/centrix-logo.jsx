import Image from "next/image";

const MARK_SRC = "/branding/centrix-mark.png";

/** Icon mark — transparent PNG, works on light and dark surfaces. */
export function CentrixLogoMark({ size = 32, className = "" }) {
  return (
    <Image
      src={MARK_SRC}
      alt=""
      width={size}
      height={size}
      className={className}
      aria-hidden
      priority
    />
  );
}

export function CentrixLogo({ collapsed = false, className = "" }) {
  if (collapsed) {
    return <CentrixLogoMark size={28} className={className} />;
  }

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <CentrixLogoMark size={28} />
      <span className="flex items-baseline gap-0.5 leading-none">
        <span className="text-[22px] font-bold tracking-tight text-white">Centrix</span>
        <span className="text-[22px] font-light tracking-tight text-white/90"> ERP</span>
      </span>
    </span>
  );
}

/** Compact wordmark for app chrome (sidebar, POS header) — uses CSS vars for theme. */
export function CentrixLogoHeader({ className = "", markSize = 32, title = "Centrix ERP" }) {
  return (
    <span
      className={`pos-header-brand inline-flex min-w-0 items-center gap-2.5 ${className}`}
      title={title}
      aria-label={title}
    >
      <CentrixLogoMark size={markSize} className="shrink-0" />
      <span className="flex min-w-0 items-baseline gap-0.5 leading-none">
        <span className="pos-header-brand-strong truncate text-lg font-bold tracking-tight">Centrix</span>
        <span className="pos-header-brand-light truncate text-lg font-light tracking-tight"> ERP</span>
      </span>
    </span>
  );
}

/** Login / auth — mark + wordmark using theme text colors. */
export function CentrixLogoFull({ className = "" }) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <CentrixLogoMark size={40} />
      <span className="flex items-baseline gap-1 leading-none">
        <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Centrix</span>
        <span className="text-2xl font-light tracking-tight text-slate-500 dark:text-slate-400"> ERP</span>
      </span>
    </span>
  );
}
