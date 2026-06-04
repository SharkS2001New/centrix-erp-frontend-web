"use client";

import { useEffect, useState } from "react";
import { reverseGeocode } from "@/lib/reverse-geocode";
import { hasValidCustomerLocation } from "@/lib/customer-location";

export function CustomerLocationPlaceName({
  latitude,
  longitude,
  className = "text-sm text-slate-800",
  loadingClassName = "text-xs text-slate-500",
}) {
  const [name, setName] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!hasValidCustomerLocation(latitude, longitude)) {
      setName(null);
      setLoading(false);
      setFailed(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setFailed(false);

    reverseGeocode(latitude, longitude, { signal: controller.signal })
      .then((place) => {
        setName(place);
        setFailed(!place);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setFailed(true);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [latitude, longitude]);

  if (!hasValidCustomerLocation(latitude, longitude)) return null;

  if (loading) {
    return <p className={loadingClassName}>Looking up place name…</p>;
  }

  if (name) {
    return <p className={className}>{name}</p>;
  }

  if (failed) {
    return <p className={loadingClassName}>Place name unavailable for these coordinates.</p>;
  }

  return null;
}
