"use client";

import { useEffect } from "react";
import { CustomerLocationMapEmbed } from "@/components/customers/customer-location-map-embed";
import { CustomerLocationPlaceName } from "@/components/customers/customer-location-place-name";
import { formatCustomerCoordinates } from "@/lib/customer-location";

export function CustomerLocationMapModal({
  open,
  onClose,
  latitude,
  longitude,
  title = "Customer location",
  subtitle = null,
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const coords = formatCustomerCoordinates(latitude, longitude);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-location-map-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id="customer-location-map-title" className="text-lg font-medium text-slate-900">
              {title}
            </h2>
            {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
            <div className="mt-2">
              <CustomerLocationPlaceName
                latitude={latitude}
                longitude={longitude}
                className="text-[15px] font-medium leading-snug text-slate-900"
              />
            </div>
            {coords ? (
              <p className="mt-1 font-mono text-xs text-slate-500">{coords}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            aria-label="Close map"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 p-4 sm:p-5">
          {open ? (
            <CustomerLocationMapEmbed
              latitude={latitude}
              longitude={longitude}
              heightClass="h-[min(60vh,520px)] min-h-[280px]"
            />
          ) : null}
        </div>

        <div className="border-t border-slate-200 px-5 py-2.5 text-right">
          <a
            href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-slate-500 hover:text-[#185FA5]"
          >
            Open in maps ↗
          </a>
        </div>
      </div>
    </div>
  );
}
