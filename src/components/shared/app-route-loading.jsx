/** Lightweight skeleton shown while a route segment is loading. */
export function AppRouteLoading({ label = "Loading page…" }) {
  return (
    <div className="theme-workspace min-h-[40vh] animate-pulse space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <div className="h-4 w-40 rounded bg-[var(--theme-border)]" />
        <div className="h-8 w-72 max-w-full rounded bg-[var(--theme-border)]" />
        <div className="h-4 w-56 max-w-full rounded bg-[var(--theme-border)]" />
      </div>
      <div className="theme-panel rounded-xl border p-6 shadow-sm">
        <p className="theme-subtext mb-4 text-sm">{label}</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <div className="h-3 w-20 rounded bg-[var(--theme-border)]" />
              <div className="h-5 w-full rounded bg-[var(--theme-border)]" />
            </div>
          ))}
        </div>
      </div>
      <div className="theme-panel h-48 rounded-xl border shadow-sm" />
    </div>
  );
}
