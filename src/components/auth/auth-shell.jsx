"use client";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { CentrixLogoFull } from "@/components/branding/centrix-logo";
import { COMPANY_NAME } from "@/lib/branding";

const inputClass =
  "theme-input mt-1 w-full rounded-lg border px-3 py-2 outline-none focus:border-emerald-500";

export function AuthShell({ title, subtitle, children, maxWidthClass = "max-w-lg", showLogo = true, headerActions = null }) {
  return (
    <div className="auth-page-bg relative flex min-h-screen items-center justify-center overflow-y-auto px-4 py-8">
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
        <ThemeToggle />
        {headerActions}
      </div>
      <div className={`auth-card w-full ${maxWidthClass} rounded-2xl border p-8 shadow-xl`}>
        {showLogo ? (
          <div className="mb-6 flex justify-center">
            <CentrixLogoFull />
          </div>
        ) : null}
        {title ? (
          <h1 className="text-2xl font-semibold text-[var(--theme-text)]">{title}</h1>
        ) : null}
        {subtitle ? (
          <p className={`theme-muted text-sm ${title ? "mt-1" : "mt-0"}`}>{subtitle}</p>
        ) : null}
        {children}
      </div>
      <p className="pointer-events-none absolute bottom-4 left-0 right-0 text-center text-xs text-slate-500/80 dark:text-slate-400/70">
        © {COMPANY_NAME}
      </p>
    </div>
  );
}

export function AuthField({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs font-medium theme-muted">{label}</span>
      {children}
    </label>
  );
}

export function authInputClass(extra = "") {
  return `${inputClass} ${extra}`.trim();
}

export function AuthError({ children }) {
  if (!children) return null;
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
      {children}
    </p>
  );
}

export function AuthSuccess({ children }) {
  if (!children) return null;
  return (
    <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
      {children}
    </p>
  );
}

export function AuthNotice({ children }) {
  if (!children) return null;
  return (
    <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      {children}
    </p>
  );
}

export function AuthSubmitButton({ children, disabled }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
