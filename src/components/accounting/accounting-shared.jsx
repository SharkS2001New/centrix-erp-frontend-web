export function JournalStatusBadge({ status }) {
  const normalized = String(status ?? "").toLowerCase();
  const styles =
    normalized === "posted"
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : normalized === "void"
        ? "bg-red-100 text-red-800 border-red-200"
        : "bg-slate-100 text-slate-700 border-slate-200";
  const label =
    normalized === "posted" ? "Posted" : normalized === "void" ? "Reversed" : "Draft";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles}`}>
      {label}
    </span>
  );
}
