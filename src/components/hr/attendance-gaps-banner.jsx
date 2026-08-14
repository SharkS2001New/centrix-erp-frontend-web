"use client";

import Link from "next/link";

export function AttendanceGapsBanner({ counts, compact = false }) {
  const unapplied = Number(counts?.unapplied_terminal_punches ?? 0);
  const duplicates = Number(counts?.duplicate_punches ?? 0);
  const missingOut = Number(counts?.missing_clock_out ?? 0);
  const noShift = Number(counts?.employees_without_shift ?? 0);
  if (!unapplied && !duplicates && !missingOut && !noShift) {
    return null;
  }

  const parts = [];
  if (unapplied) {
    parts.push(
      <Link key="missed" href="/hr/missed-punches" className="font-medium text-[#185FA5] hover:underline">
        {unapplied} unmapped scan{unapplied === 1 ? "" : "s"}
      </Link>,
    );
  }
  if (duplicates) {
    parts.push(
      <Link key="dup" href="/hr/duplicate-punches" className="font-medium text-[#185FA5] hover:underline">
        {duplicates} duplicate punch{duplicates === 1 ? "" : "es"}
      </Link>,
    );
  }
  if (missingOut) {
    parts.push(
      <Link key="out" href="/hr/missed-punches" className="font-medium text-[#185FA5] hover:underline">
        {missingOut} missing clock-out{missingOut === 1 ? "" : "s"}
      </Link>,
    );
  }
  if (noShift) {
    parts.push(
      <Link key="shift" href="/hr/shifts" className="font-medium text-[#185FA5] hover:underline">
        {noShift} employee{noShift === 1 ? "" : "s"} without a shift
      </Link>,
    );
  }

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
      {compact ? null : <strong className="mr-1">Needs attention:</strong>}
      {parts.map((part, index) => (
        <span key={part.key}>
          {index > 0 ? " · " : null}
          {part}
        </span>
      ))}
    </div>
  );
}
