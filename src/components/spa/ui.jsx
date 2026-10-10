"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { SearchInput } from "@/components/catalog/catalog-shared";
import { SearchableSelect } from "@/components/catalog/searchable-select";

export function Button({ children, variant = "primary", className = "", type = "button", ...props }) {
  const styles = {
    primary: "theme-primary-btn",
    teal: "bg-emerald-600 text-white hover:bg-emerald-700",
    ghost: "theme-secondary-btn",
    danger: "border border-red-200 bg-white text-red-600 hover:bg-red-50",
    navy: "theme-primary-btn",
  };
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({ label, children, error }) {
  return (
    <label className="theme-heading block text-sm">
      <span className="theme-subtext mb-1 block text-xs font-medium">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
  );
}

export const inputClass =
  "theme-input theme-input-focus h-[38px] w-full rounded-lg border px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60";

export const textAreaClass =
  "theme-input theme-input-focus w-full rounded-lg border px-3 py-2 text-sm outline-none";

export const toolbarControlClass =
  "theme-input theme-input-focus h-[38px] w-auto min-w-[10.5rem] shrink-0 rounded-lg border px-3 py-2 text-sm outline-none";

export function toOptions(items) {
  return items.map((item) => {
    if (item && typeof item === "object" && "value" in item) return item;
    return { value: item, label: item };
  });
}

export function SpaSearch(props) {
  return <SearchInput {...props} />;
}

export function SpaSelect({ options, toolbar = false, className = "", ...props }) {
  return (
    <SearchableSelect
      {...props}
      nativeEvent
      options={options}
      className={className || (toolbar ? toolbarControlClass : inputClass)}
    />
  );
}

export const accentLinkClass = "text-sm font-medium text-[var(--theme-accent-text)]";

export function pillClass(active) {
  return active
    ? "theme-primary-btn rounded-full px-3 py-1.5 text-sm"
    : "theme-secondary-btn rounded-full px-3 py-1.5 text-sm";
}

export function Card({ children, className = "" }) {
  return <section className={`theme-panel rounded-xl border p-4 shadow-sm ${className}`}>{children}</section>;
}

export function Badge({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-[var(--theme-surface-muted)] theme-subtext",
    blue: "bg-blue-50 text-[var(--theme-accent-text)]",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-600",
  };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Empty({ title, detail, action }) {
  return (
    <div className="theme-panel rounded-xl border border-dashed px-6 py-12 text-center">
      <p className="theme-heading text-sm font-semibold">{title}</p>
      {detail ? <p className="theme-subtext mx-auto mt-1 max-w-md text-sm">{detail}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Modal({ title, children, onClose, wide = false }) {
  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" role="presentation" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`theme-panel max-h-[92vh] w-full overflow-y-auto rounded-xl border p-5 shadow-xl ${wide ? "max-w-3xl" : "max-w-lg"}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="theme-heading text-lg font-semibold">{title}</h2>
          <button type="button" className="theme-subtext rounded-lg p-1 hover:bg-[var(--theme-surface-muted)]" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PageHeader({ title, detail, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="theme-heading text-xl font-medium">{title}</h1>
        {detail ? <p className="theme-subtext mt-1 text-sm">{detail}</p> : null}
      </div>
      <div className="flex flex-wrap items-end gap-3">{children}</div>
    </div>
  );
}

export function SpaContextMenu({ menu, onClose, items }) {
  useEffect(() => {
    if (!menu) return undefined;
    function close() {
      onClose();
    }
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  return (
    <div
      className="theme-panel fixed z-[80] min-w-44 rounded-lg border py-1 text-sm shadow-lg"
      style={{ left: menu.x, top: menu.y }}
      role="menu"
      onContextMenu={(event) => event.preventDefault()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className="theme-heading block w-full px-3 py-2 text-left hover:bg-[var(--theme-surface-muted)]"
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function Table({ columns, rows, render, onCreate, createLabel = "New" }) {
  const [menu, setMenu] = useState(null);

  return (
    <>
      <div
        className="theme-panel theme-table-shell overflow-x-auto rounded-xl shadow-sm"
        onDoubleClick={(event) => {
          if (!onCreate || event.target.closest("tbody tr, a, button, input, select, textarea")) return;
          onCreate();
        }}
        onContextMenu={(event) => {
          if (!onCreate || event.target.closest("a, button, input, select, textarea")) return;
          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY });
        }}
      >
        <table className="theme-table min-w-full text-sm">
          <thead>
            <tr className="theme-table-head-row text-left text-xs font-medium uppercase tracking-wide">
              {columns.map((column) => (
                <th key={column} className="px-4 py-3 font-medium">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>{rows.map(render)}</tbody>
        </table>
      </div>
      <SpaContextMenu
        menu={menu}
        onClose={() => setMenu(null)}
        items={[{ label: createLabel, onSelect: onCreate }]}
      />
    </>
  );
}
