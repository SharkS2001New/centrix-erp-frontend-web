"use client";

import { useAuth } from "@/contexts/auth-context";
import { formatOrgCurrency, formatOrgDate, formatOrgDateTime, formatOrgNumber, formatOrgCurrencyCompact } from "@/lib/format";

/** Org-aware formatting from capabilities / general settings. */
export function useOrgFormat() {
  const { generalSettings } = useAuth();
  const settings = generalSettings();

  return {
    settings,
    currency: (value) => formatOrgCurrency(value, settings),
    currencyCompact: (value) => formatOrgCurrencyCompact(value, settings),
    number: (value, options) => formatOrgNumber(value, settings, options),
    date: (value) => formatOrgDate(value, settings),
    dateTime: (value) => formatOrgDateTime(value, settings),
    /** Alias for legacy formatSaleKes / formatShortDate call sites inside React. */
    saleKes: (value) => formatOrgCurrency(value, settings),
    shortDate: (value) => formatOrgDate(value, settings),
  };
}
