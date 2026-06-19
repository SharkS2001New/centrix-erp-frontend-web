"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useCanAccess } from "@/components/permission-gate";
import { formatOrgCurrency, formatOrgCurrencyCompact, formatOrgDate, formatOrgNumber } from "@/lib/format";
import { GENERAL_DEFAULTS } from "@/lib/general-settings";

export function formatShortDate(value, settings = GENERAL_DEFAULTS) {
  return formatOrgDate(value, settings);
}

export function formatKesMarkup(value, settings = GENERAL_DEFAULTS) {
  const currency = settings?.currency ?? GENERAL_DEFAULTS.currency ?? "KES";
  return `+ ${currency} ${formatOrgNumber(value, settings)}`;
}

/** Parse money/decimal fields from forms (handles "2500", "2,500.50", spaces). */
export function parseDecimalInput(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  const cleaned = String(value).replace(/[\s,]/g, "");
  const n = Number.parseFloat(cleaned);

  return Number.isFinite(n) ? n : 0;
}

export function formatKesCompact(value, settings = GENERAL_DEFAULTS) {
  return formatOrgCurrencyCompact(value, settings);
}

export function StatCard({ label, value, hint }) {
  return (
    <div className="theme-panel rounded-xl border px-5 py-4 shadow-sm">
      <p className="theme-subtext text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className="theme-heading mt-1 text-2xl font-semibold">{value}</p>
      {hint ? <p className="theme-subtext mt-0.5 text-xs">{hint}</p> : null}
    </div>
  );
}

export function isSameCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isSameCalendarMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function startOfCalendarWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isInCalendarWeek(date, reference = new Date()) {
  const d = new Date(date);
  const start = startOfCalendarWeek(reference);
  const end = new Date(reference);
  end.setHours(23, 59, 59, 999);
  return d >= start && d <= end;
}

export function getSaleTimestamp(sale) {
  const raw = sale.completed_at ?? sale.delivery_date ?? sale.created_at;
  return raw ? new Date(raw) : null;
}

export const SALES_PERIOD_OPTIONS = [
  { value: "day", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

export function buildPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [1];
  if (current > 3) pages.push("…");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    pages.push(p);
  }
  if (current < total - 2) pages.push("…");
  pages.push(total);
  return pages;
}

/** Flat workspace card — matches page canvas, not elevated surface. */
export const workspaceCardClassName = "theme-panel rounded-xl border shadow-sm";

export function CatalogPageShell({ title, subtitle, action, banner, toolbar, children }) {
  return (
    <div className="theme-workspace min-h-full">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="theme-heading text-xl font-medium">{title}</h1>
          {subtitle && <p className="theme-subtext mt-0.5 text-sm">{subtitle}</p>}
        </div>
        {action}
      </div>
      {banner}
      {toolbar}
      {children}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  type = "button",
  showIcon = true,
  disabled,
  permission,
  module,
  className = "",
}) {
  const allowed = useCanAccess({ permission, module });
  if ((permission || module) && !allowed) return null;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`theme-primary-btn inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${className}`}
    >
      {showIcon ? <PlusIcon /> : null}
      {children}
    </button>
  );
}

export function PrimaryLink({ href, children, showIcon = true, permission, module }) {
  const allowed = useCanAccess({ permission, module });
  if ((permission || module) && !allowed) return null;

  return (
    <Link
      href={href}
      className="theme-primary-btn inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium"
    >
      {showIcon ? <PlusIcon /> : null}
      {children}
    </Link>
  );
}

export function SearchInput({ value, onChange, placeholder, className = "" }) {
  return (
    <div className={`relative min-w-[200px] flex-1 max-w-xs ${className}`}>
      <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 theme-subtext" />
      <input
        type="search"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="theme-input theme-input-focus w-full rounded-lg border py-2 pl-9 pr-3 text-sm outline-none"
      />
    </div>
  );
}

export function FilterSelect({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={onChange}
      className={SELECT_CLASS}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function PaginationBar({ page, totalPages, total, pageSize, onChange }) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const pages = buildPageNumbers(page, totalPages);

  return (
    <div className="theme-pagination-bar flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs">
      <span>
        Showing {from}–{to} of {total}
      </span>
      <div className="flex gap-1">
        <PagBtn disabled={page <= 1} onClick={() => onChange(page - 1)}>
          ‹
        </PagBtn>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`e-${i}`} className="theme-subtext px-1">
              …
            </span>
          ) : (
            <PagBtn key={p} active={p === page} onClick={() => onChange(p)}>
              {p}
            </PagBtn>
          ),
        )}
        <PagBtn disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          ›
        </PagBtn>
      </div>
    </div>
  );
}

function PagBtn({ children, onClick, disabled, active }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`theme-pag-btn rounded-md px-2.5 py-1 text-xs disabled:opacity-40 ${
        active ? "theme-pag-btn-active" : ""
      }`}
    >
      {children}
    </button>
  );
}

export function IconButton({ label, onClick, danger, disabled, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex rounded-md p-1 theme-subtext hover:bg-[var(--theme-hover)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${
        danger ? "hover:bg-red-50 hover:text-red-700" : "hover:text-[var(--theme-text)]"
      }`}
    >
      {children}
    </button>
  );
}

export function ActiveBadge({ active = true }) {
  return active ? (
    <span className="inline-flex rounded-full bg-[#EAF3DE] px-2.5 py-0.5 text-[11px] font-medium text-[#27500A]">
      Active
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-[var(--theme-primary-subtle)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--theme-accent-text)]">
      Inactive
    </span>
  );
}

export function ParentChip({ label }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-2 py-0.5 text-[11px] theme-subtext">
      <FolderIcon />
      {label}
    </span>
  );
}

export function UomBadge({ label, variant = "blue" }) {
  const styles =
    variant === "purple"
      ? "bg-[var(--theme-primary-subtle)] text-[var(--theme-accent-text)]"
      : "bg-[var(--theme-primary-muted)] text-[var(--theme-accent-text)]";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${styles}`}>
      {label || "—"}
    </span>
  );
}

export function FormModal({ title, open, onClose, onSubmit, saving, error, submitLabel, children }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) return null;

  function handleSubmit(e) {
    e.preventDefault();
    if (typeof onSubmit === "function") onSubmit(e);
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="form-modal-title"
        className="theme-modal w-full max-w-md rounded-xl border p-5 shadow-xl"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <h2 id="form-modal-title" className="theme-heading text-[15px] font-medium">
          {title}
        </h2>
        <div className="mt-4 space-y-3">{children}</div>
        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        <div className="mt-4 flex gap-2 border-t border-[var(--theme-border)] pt-3">
          <button type="button" onClick={onClose} className="theme-btn-secondary rounded-lg border px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSubmit}
            className="theme-primary-btn flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-50"
          >
            {saving ? "Saving…" : submitLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Right-side slide-over form panel (same pattern as Expenses). */
export function FormDrawer({
  title,
  open,
  onClose,
  onSubmit,
  saving,
  error,
  submitLabel,
  wide = false,
  children,
}) {
  if (!open) return null;
  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/30"
        aria-label="Close drawer"
        onClick={onClose}
      />
      <aside
        className={`theme-panel theme-modal fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l shadow-xl ${
          wide ? "max-w-lg" : "max-w-md"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[var(--theme-border)] px-5 py-4">
          <h2 className="theme-heading text-[15px] font-medium">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="theme-subtext rounded-lg p-1 hover:bg-[var(--theme-hover)] hover:text-[var(--theme-text)]"
            aria-label="Close"
          >
            <DrawerCloseIcon />
          </button>
        </div>
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-4 [overflow-anchor:none]">
            {children}
          </div>
          {error && (
            <p className="mx-5 mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          <div className="border-t border-[var(--theme-border)] px-5 py-4">
            <button
              type="submit"
              disabled={saving}
              className="theme-primary-btn w-full rounded-lg py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {saving ? "Saving…" : submitLabel}
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}

/** Right-side read-only panel (detail / breakdown), same shell as FormDrawer. */
export function DetailDrawer({
  title,
  subtitle,
  open,
  onClose,
  wide = false,
  children,
  footer,
}) {
  if (!open) return null;
  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/30"
        aria-label="Close panel"
        onClick={onClose}
      />
      <aside
        className={`theme-panel theme-modal fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l shadow-xl ${
          wide ? "max-w-lg" : "max-w-md"
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--theme-border)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="theme-heading text-[15px] font-medium">{title}</h2>
            {subtitle ? (
              <p className="theme-subtext mt-0.5 truncate text-sm">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="theme-subtext shrink-0 rounded-lg p-1 hover:bg-[var(--theme-hover)] hover:text-[var(--theme-text)]"
            aria-label="Close"
          >
            <DrawerCloseIcon />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-[var(--theme-border)] px-5 py-4">{footer}</div> : null}
        <div className="border-t border-[var(--theme-border)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="theme-btn-secondary w-full rounded-lg border py-2.5 text-sm"
          >
            Close
          </button>
        </div>
      </aside>
    </>
  );
}

function DrawerCloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="theme-subtext mb-1 block text-xs font-medium">{label}</span>
      {children}
    </label>
  );
}

export const INPUT_CLASS =
  "theme-input theme-input-focus w-full rounded-lg border px-2.5 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60";

export const SELECT_CLASS =
  "theme-input theme-input-focus rounded-lg border px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60";

export const INPUT_READONLY_CLASS =
  "theme-input theme-input-readonly w-full rounded-lg border px-2.5 py-2 text-sm shadow-sm outline-none cursor-not-allowed";

export const COMPACT_INPUT_CLASS =
  "theme-input theme-input-focus w-full rounded-lg border px-2 py-1.5 text-sm shadow-sm outline-none disabled:cursor-not-allowed disabled:opacity-60";

export const TABLE_HEAD_ROW_CLASS =
  "theme-table-head-row text-left text-xs font-medium uppercase tracking-wide";

export const SECONDARY_BTN_CLASS =
  "theme-secondary-btn inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed";

export function inputClassName() {
  return INPUT_CLASS;
}

export function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

export function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function SearchIcon({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}
