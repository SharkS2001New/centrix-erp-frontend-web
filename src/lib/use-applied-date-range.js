"use client";

import { useCallback, useState } from "react";

/**
 * Draft From/To inputs + applied window for list/report fetches.
 * Changing dates alone does not refetch — call applyDates() (Filter button).
 *
 * @param {{ from: string, to: string }} initialRange
 */
export function useAppliedDateRange(initialRange) {
  const [fromDate, setFromDate] = useState(initialRange?.from ?? "");
  const [toDate, setToDate] = useState(initialRange?.to ?? "");
  const [appliedFrom, setAppliedFrom] = useState(initialRange?.from ?? "");
  const [appliedTo, setAppliedTo] = useState(initialRange?.to ?? "");

  const applyDates = useCallback(() => {
    setAppliedFrom(fromDate);
    setAppliedTo(toDate);
  }, [fromDate, toDate]);

  const resetDates = useCallback(
    (range = initialRange) => {
      const next = range ?? { from: "", to: "" };
      setFromDate(next.from ?? "");
      setToDate(next.to ?? "");
      setAppliedFrom(next.from ?? "");
      setAppliedTo(next.to ?? "");
    },
    [initialRange],
  );

  return {
    fromDate,
    toDate,
    setFromDate,
    setToDate,
    appliedFrom,
    appliedTo,
    applyDates,
    resetDates,
  };
}
