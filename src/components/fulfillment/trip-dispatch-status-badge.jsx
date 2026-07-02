"use client";

import { tripDispatchStatusCopy } from "@/lib/fulfillment-guidance";

const TONE_CLASS = {
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-sky-200 bg-sky-50 text-sky-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  danger: "border-red-200 bg-red-50 text-red-900",
};

export function TripDispatchStatusBadge({ status, className = "" }) {
  const { label, tone } = tripDispatchStatusCopy(status);

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASS[tone]} ${className}`}
    >
      {label}
    </span>
  );
}
