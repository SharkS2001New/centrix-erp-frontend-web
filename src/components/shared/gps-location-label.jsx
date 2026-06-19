"use client";

import { useEffect, useState } from "react";
import { formatCustomerCoordinates, hasValidCustomerLocation } from "@/lib/customer-location";
import { reverseGeocode } from "@/lib/reverse-geocode";

function isLikelyCoordinateString(value, latitude, longitude) {
  const text = String(value ?? "").trim();
  if (!text) return false;

  const coords = formatCustomerCoordinates(latitude, longitude);
  if (!coords) return false;

  const normalize = (s) => s.replace(/\s/g, "").toLowerCase();
  if (normalize(text) === normalize(coords)) return true;

  return /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(text);
}

function hasMeaningfulAddress(address, latitude, longitude) {
  const text = String(address ?? "").trim();
  if (!text) return false;
  return !isLikelyCoordinateString(text, latitude, longitude);
}

export function GpsLocationLabel({
  latitude,
  longitude,
  address,
  showCoordinates = true,
  showMapLink = false,
  className = "text-sm text-slate-700",
  loadingClassName = "text-xs text-slate-500",
}) {
  const [placeName, setPlaceName] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const hasCoords = hasValidCustomerLocation(latitude, longitude);
  const storedAddress = hasMeaningfulAddress(address, latitude, longitude) ? String(address).trim() : "";
  const coordsLabel = formatCustomerCoordinates(latitude, longitude);

  useEffect(() => {
    if (!hasCoords) {
      setPlaceName(null);
      setLoading(false);
      setFailed(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setFailed(false);

    reverseGeocode(latitude, longitude, { signal: controller.signal })
      .then((place) => {
        setPlaceName(place);
        setFailed(!place);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setFailed(true);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [latitude, longitude, hasCoords]);

  const displayName = placeName || storedAddress;

  if (!displayName && !coordsLabel) {
    return <p className={className}>—</p>;
  }

  if (loading && !displayName) {
    return <p className={loadingClassName}>Looking up location…</p>;
  }

  return (
    <div>
      {displayName ? <p className={className}>{displayName}</p> : null}
      {!displayName && failed && coordsLabel ? (
        <p className={loadingClassName}>Place name unavailable for these coordinates.</p>
      ) : null}
      {showCoordinates && coordsLabel ? (
        <p className="mt-0.5 font-mono text-xs text-slate-500">{coordsLabel}</p>
      ) : null}
      {showMapLink && hasCoords ? (
        <a
          href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block text-xs font-medium text-[#185FA5] hover:underline"
        >
          View on map
        </a>
      ) : null}
    </div>
  );
}
