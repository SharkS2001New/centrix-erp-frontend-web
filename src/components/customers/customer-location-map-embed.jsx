"use client";

import { formatCustomerCoordinates } from "@/lib/customer-location";

/**
 * OpenStreetMap embed — reliable display; includes OSM attribution in the iframe.
 */
export function CustomerLocationMapEmbed({ latitude, longitude, heightClass = "h-48" }) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const pad = 0.008;
  const bbox = `${lng - pad},${lat - pad},${lng + pad},${lat + pad}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lng}`;

  return (
    <div className={`${heightClass} min-h-[12rem] w-full overflow-hidden rounded-lg border border-slate-200`}>
      <iframe
        title={`Map ${formatCustomerCoordinates(lat, lng)}`}
        src={src}
        className="h-full min-h-[12rem] w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}
