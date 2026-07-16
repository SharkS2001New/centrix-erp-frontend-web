"use client";

export function PlatformFormSection({ title, description, children }) {
  return (
    <section className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 shadow-sm">
      <h2 className="theme-accent-label text-sm font-semibold uppercase tracking-wide">{title}</h2>
      {description ? <p className="theme-subtext mt-1 text-sm">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}
