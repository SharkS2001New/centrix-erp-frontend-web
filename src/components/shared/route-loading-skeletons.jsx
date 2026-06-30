function Sk({ className = "" }) {
  return <div className={`route-loading-shimmer ${className}`.trim()} aria-hidden="true" />;
}

function SkCircle({ className = "h-8 w-8" }) {
  return <Sk className={`rounded-full ${className}`} />;
}

function SkBar({ className = "h-3.5 w-full" }) {
  return <Sk className={`rounded-md ${className}`} />;
}

function SkPill({ className = "h-8 w-28" }) {
  return <Sk className={`rounded-full ${className}`} />;
}

function SkButton({ className = "h-9 w-24" }) {
  return <Sk className={`rounded-lg ${className}`} />;
}

function PageHeader({ title, subtitle, actions = 2 }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <Sk className="mt-0.5 h-10 w-10 shrink-0 rounded-xl" />
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <SkBar className="h-6 w-44 max-w-[70vw]" />
            <SkPill className="h-5 w-16" />
          </div>
          <p className="theme-subtext text-sm">{subtitle || title}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {Array.from({ length: actions }).map((_, i) => (
          <SkButton key={i} className={i === actions - 1 ? "h-9 w-32" : "h-9 w-24"} />
        ))}
      </div>
    </div>
  );
}

function FilterToolbar({ filters = 3 }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Sk className="h-[38px] max-w-md flex-1 rounded-lg" />
      {Array.from({ length: filters }).map((_, i) => (
        <SkPill key={i} className="h-[38px] w-[132px]" />
      ))}
      <SkPill className="h-[38px] w-24" />
    </div>
  );
}

function StatCardsRow({ count = 4 }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="theme-panel rounded-xl border px-5 py-4 shadow-sm">
          <SkBar className="h-3 w-20" />
          <SkBar className="mt-3 h-7 w-24" />
        </div>
      ))}
    </div>
  );
}

function TableSkeleton({
  columns = [
    { w: "w-[28%]", label: "w-16" },
    { w: "w-[22%]", label: "w-20" },
    { w: "w-[14%]", label: "w-12" },
    { w: "w-[14%]", label: "w-14" },
    { w: "w-[12%]", label: "w-12" },
    { w: "w-[10%]", label: "w-10" },
  ],
  rows = 10,
  showCheckbox = true,
  embedded = false,
}) {
  const table = (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="theme-table-head-row">
              {showCheckbox ? (
                <th className="w-10 px-4 py-2.5">
                  <Sk className="h-4 w-4 rounded" />
                </th>
              ) : null}
              {columns.map((col, i) => (
                <th key={i} className={`px-4 py-2.5 text-left ${col.w}`}>
                  <SkBar className={`h-3 ${col.label}`} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, row) => (
              <tr key={row} className="theme-table-body-row">
                {showCheckbox ? (
                  <td className="px-4 py-3">
                    <Sk className="h-4 w-4 rounded" />
                  </td>
                ) : null}
                {columns.map((col, colIndex) => (
                  <td key={colIndex} className="px-4 py-3">
                    {colIndex === 0 ? (
                      <div className="flex items-center gap-3">
                        <SkCircle className="h-8 w-8" />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <SkBar className={`h-3.5 ${row % 3 === 0 ? "w-[85%]" : row % 3 === 1 ? "w-[70%]" : "w-[92%]"}`} />
                          <SkBar className="h-2.5 w-16" />
                        </div>
                      </div>
                    ) : colIndex === columns.length - 1 ? (
                      <div className="flex justify-end gap-1">
                        <Sk className="h-8 w-8 rounded-md" />
                        <Sk className="h-8 w-8 rounded-md" />
                      </div>
                    ) : (
                      <SkBar
                        className={`h-3.5 ${
                          colIndex % 2 === 0 ? "w-[75%]" : "w-[55%]"
                        } ${colIndex >= columns.length - 2 ? "ml-auto max-w-[88px]" : ""}`}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
  );

  if (embedded) return table;

  return (
    <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
      {table}
      <div className="theme-pagination-bar flex items-center justify-between px-4 py-3">
        <SkBar className="h-3 w-36" />
        <div className="flex gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Sk key={i} className="h-8 w-8 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ListRouteSkeleton({ title, subtitle }) {
  return (
    <div className="route-loading-skeleton theme-workspace min-h-[50vh] space-y-5">
      <PageHeader title={title} subtitle={subtitle} actions={2} />
      <StatCardsRow count={4} />
      <FilterToolbar filters={2} />
      <TableSkeleton />
    </div>
  );
}

export function DetailRouteSkeleton({ title, subtitle }) {
  return (
    <div className="route-loading-skeleton theme-workspace min-h-[50vh] space-y-5">
      <SkBar className="h-3.5 w-40" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <SkBar className="h-7 w-56 max-w-[80vw]" />
          <SkBar className="h-4 w-40" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SkPill className="h-7 w-24" />
          <SkButton className="h-9 w-20" />
          <SkButton className="h-9 w-24" />
          <SkButton className="h-9 w-28" />
        </div>
      </div>

      <div className="rounded-xl border border-[var(--theme-primary)]/25 bg-[var(--theme-primary-muted)] p-5">
        <SkBar className="mb-3 h-4 w-28" />
        <div className="flex flex-wrap gap-2">
          <SkButton className="h-9 w-32" />
          <SkButton className="h-9 w-28" />
        </div>
      </div>

      <div className="theme-panel rounded-xl border p-6 shadow-sm">
        <SkBar className="mb-5 h-4 w-24" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <SkBar className="h-3 w-20" />
              <SkBar className={`h-4 ${i % 2 === 0 ? "w-[80%]" : "w-[60%]"}`} />
            </div>
          ))}
        </div>
      </div>

      <div className="theme-panel overflow-hidden rounded-xl border p-0 shadow-sm">
        <div className="border-b border-[var(--theme-border)] px-6 py-4">
          <SkBar className="h-4 w-28" />
        </div>
        <TableSkeleton
          embedded
          showCheckbox={false}
          rows={6}
          columns={[
            { w: "w-[8%]", label: "w-4" },
            { w: "w-[34%]", label: "w-16" },
            { w: "w-[14%]", label: "w-12" },
            { w: "w-[14%]", label: "w-12" },
            { w: "w-[14%]", label: "w-10" },
            { w: "w-[16%]", label: "w-12" },
          ]}
        />
      </div>
      <span className="sr-only">Loading {title} — {subtitle}</span>
    </div>
  );
}

export function DashboardRouteSkeleton() {
  return (
    <div className="route-loading-skeleton theme-workspace min-h-[50vh] space-y-5">
      <PageHeader title="Dashboard" subtitle="Overview and key metrics" actions={1} />
      <StatCardsRow count={4} />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="theme-panel rounded-xl border p-5 shadow-sm">
          <SkBar className="mb-4 h-4 w-32" />
          <Sk className="h-52 w-full rounded-lg" />
        </div>
        <div className="theme-panel rounded-xl border p-5 shadow-sm">
          <SkBar className="mb-4 h-4 w-36" />
          <Sk className="h-52 w-full rounded-lg" />
        </div>
      </div>
      <TableSkeleton rows={5} showCheckbox={false} />
    </div>
  );
}

export function FormRouteSkeleton({ title, subtitle }) {
  return (
    <div className="route-loading-skeleton theme-workspace min-h-[50vh] space-y-5">
      <SkBar className="h-3.5 w-36" />
      <PageHeader title={title} subtitle={subtitle} actions={1} />
      <div className="theme-panel max-w-3xl rounded-xl border p-6 shadow-sm">
        <div className="space-y-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <SkBar className="h-3 w-24" />
              <Sk className={`h-10 w-full rounded-lg ${i === 4 ? "h-24" : ""}`} />
            </div>
          ))}
        </div>
        <div className="mt-6 flex gap-2">
          <SkButton className="h-10 w-28" />
          <SkButton className="h-10 w-24" />
        </div>
      </div>
    </div>
  );
}

export function ReportRouteSkeleton({ title, subtitle }) {
  return (
    <div className="route-loading-skeleton theme-workspace min-h-[50vh] space-y-5">
      <PageHeader title={title} subtitle={subtitle} actions={2} />
      <FilterToolbar filters={4} />
      <div className="theme-panel rounded-xl border p-6 shadow-sm">
        <div className="mb-4 flex gap-2">
          <SkPill className="h-8 w-20" />
          <SkPill className="h-8 w-24" />
          <SkPill className="h-8 w-28" />
        </div>
        <Sk className="mb-6 h-64 w-full rounded-lg" />
        <TableSkeleton embedded rows={8} showCheckbox={false} />
      </div>
    </div>
  );
}

export function WorkspaceRouteSkeleton({ title, subtitle }) {
  return (
    <div className="route-loading-skeleton theme-workspace flex min-h-[60vh] flex-col gap-4 lg:flex-row">
      <div className="theme-panel min-h-[320px] flex-1 rounded-xl border p-4 shadow-sm">
        <SkBar className="mb-4 h-4 w-32" />
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Sk key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      </div>
      <div className="theme-panel w-full rounded-xl border p-4 shadow-sm lg:w-96">
        <SkBar className="mb-4 h-4 w-24" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex justify-between gap-2">
              <SkBar className="h-4 w-32" />
              <SkBar className="h-4 w-16" />
            </div>
          ))}
        </div>
        <Sk className="mt-6 h-12 w-full rounded-lg" />
      </div>
      <span className="sr-only">Loading {title} — {subtitle}</span>
    </div>
  );
}

/** Create order / backoffice POS — matches header + catalog + cart layout. */
export function PosRouteSkeleton() {
  return (
    <div className="route-loading-skeleton flex h-full min-h-[calc(100vh-4rem)] flex-col bg-[var(--theme-page-bg)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--theme-border)] px-4 py-3">
        <div className="flex items-center gap-3">
          <Sk className="h-9 w-28 rounded-lg" />
          <SkBar className="h-4 w-36" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SkButton className="h-9 w-24" />
          <SkButton className="h-9 w-28" />
          <Sk className="h-9 w-9 rounded-lg" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 flex-1 flex-col border-[var(--theme-border)] p-4 lg:border-r">
          <Sk className="mb-4 h-10 w-full max-w-xl rounded-lg" />
          <div className="mb-3 flex gap-2">
            <SkPill className="h-8 w-20" />
            <SkPill className="h-8 w-24" />
            <SkPill className="h-8 w-28" />
          </div>
          <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 16 }).map((_, i) => (
              <div key={i} className="theme-panel rounded-xl border p-3 shadow-sm">
                <Sk className="mb-2 aspect-[4/3] w-full rounded-lg" />
                <SkBar className="mb-1.5 h-3.5 w-[90%]" />
                <SkBar className="h-3 w-16" />
              </div>
            ))}
          </div>
        </div>

        <div className="theme-panel flex w-full shrink-0 flex-col border-t border-[var(--theme-border)] p-4 lg:w-[380px] lg:border-t-0">
          <SkBar className="mb-4 h-4 w-20" />
          <div className="min-h-[200px] flex-1 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-2 border-b border-[var(--theme-border)] pb-3">
                <div className="flex-1 space-y-1.5">
                  <SkBar className="h-3.5 w-[85%]" />
                  <SkBar className="h-3 w-12" />
                </div>
                <SkBar className="h-4 w-14" />
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2 border-t border-[var(--theme-border)] pt-4">
            <div className="flex justify-between">
              <SkBar className="h-4 w-16" />
              <SkBar className="h-5 w-24" />
            </div>
            <Sk className="h-11 w-full rounded-lg" />
            <Sk className="h-11 w-full rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Minimal centered loader for static hub pages (e.g. Admin home). */
export function LoadingRouteSkeleton({ title = "Loading…", subtitle }) {
  return (
    <div
      className="route-loading-skeleton theme-workspace flex min-h-[40vh] items-center justify-center"
      aria-busy="true"
      aria-live="polite"
      role="status"
    >
      <div className="text-center">
        <div
          className="mx-auto h-9 w-9 animate-spin rounded-full border-[3px] border-[var(--theme-border)] border-t-[var(--theme-primary)]"
          aria-hidden="true"
        />
        <p className="theme-heading mt-4 text-sm font-medium">{title}</p>
        {subtitle ? <p className="theme-subtext mt-1 text-sm">{subtitle}</p> : null}
      </div>
    </div>
  );
}
