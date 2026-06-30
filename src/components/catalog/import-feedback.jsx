"use client";

/** @param {{ progress?: { label?: string } | null }} props */
export function ImportProgressLine({ progress }) {
  if (!progress?.label) return null;

  return <p className="mt-3 text-sm text-slate-600">{progress.label}</p>;
}

/**
 * @param {{
 *   result: { created?: number, skipped?: number, failures?: Array<{ row?: number, code?: string, message?: string }> } | null,
 *   entityLabel?: string,
 * }} props
 */
export function ImportResultPanel({ result, entityLabel = "row" }) {
  if (!result) return null;

  const created = Number(result.created ?? 0);
  const skipped = Number(result.skipped ?? 0);
  const failures = Array.isArray(result.failures) ? result.failures : [];
  const hasSuccess = created > 0;
  const tone = hasSuccess
    ? "bg-emerald-50 text-emerald-900"
    : failures.length
      ? "bg-amber-50 text-amber-950"
      : "bg-slate-50 text-slate-700";

  return (
    <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${tone}`}>
      <p>
        Imported <strong>{created}</strong> {entityLabel}
        {created === 1 ? "" : "s"}.
        {skipped > 0 ? ` Skipped ${skipped} duplicate${skipped === 1 ? "" : "s"}.` : ""}
        {failures.length ? ` ${failures.length} row${failures.length === 1 ? "" : "s"} failed.` : ""}
      </p>
      {failures.length ? (
        <ul className="mt-2 max-h-40 list-disc overflow-y-auto pl-4 text-xs">
          {failures.slice(0, 12).map((failure, index) => (
            <li key={`${failure.row ?? index}-${failure.message ?? ""}`}>
              {failure.code ?? (failure.row != null ? `Row ${failure.row}` : "Row")}: {failure.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
