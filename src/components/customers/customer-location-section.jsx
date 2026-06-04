"use client";

import { useCallback, useState } from "react";
import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import { CustomerLocationMapEmbed } from "@/components/customers/customer-location-map-embed";
import { CustomerLocationMapModal } from "@/components/customers/customer-location-map-modal";
import { CustomerLocationPlaceName } from "@/components/customers/customer-location-place-name";
import {
  formatCustomerCoordinates,
  hasValidCustomerLocation,
} from "@/lib/customer-location";

export function CustomerLocationSection({
  latitude,
  longitude,
  onChange,
  readOnly = false,
  locationError = null,
  showSaveButton = false,
  onSaveLocation,
  savingLocation = false,
  mapModalTitle = "Customer location",
  mapModalSubtitle = null,
}) {
  const [geoHint, setGeoHint] = useState(null);
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const coordsLabel = formatCustomerCoordinates(latitude, longitude);
  const hasLocation = hasValidCustomerLocation(latitude, longitude);

  const setCoords = useCallback(
    (lat, lng) => {
      onChange("latitude", String(Number(lat).toFixed(7)));
      onChange("longitude", String(Number(lng).toFixed(7)));
    },
    [onChange],
  );

  function useDeviceLocation() {
    if (!navigator.geolocation) {
      setGeoHint("Geolocation is not available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords(pos.coords.latitude, pos.coords.longitude);
        setGeoHint(null);
      },
      () => {
        setGeoHint("Could not read device location. Enter coordinates manually.");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  function clearLocation() {
    onChange("latitude", "");
    onChange("longitude", "");
    setGeoHint(null);
  }

  const canSaveLocation = hasLocation;

  return (
    <div className="md:col-span-2 xl:col-span-3">
      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 md:p-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium text-slate-900">Customer location</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {readOnly
                ? "Saved GPS coordinates from the field or admin entry."
                : "Click the map or enter latitude and longitude. Both are required to save a location."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasLocation && (
              <button
                type="button"
                onClick={() => setMapModalOpen(true)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-[#185FA5] hover:text-[#185FA5]"
              >
                Expand map
              </button>
            )}
            {!readOnly && (
              <>
                <button
                  type="button"
                  onClick={useDeviceLocation}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  Use device GPS
                </button>
                <button
                  type="button"
                  onClick={clearLocation}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </div>

        {readOnly && !coordsLabel ? (
          <p className="text-sm text-slate-500">No location saved yet.</p>
        ) : (
          <>
            {hasLocation && (
              <div className="mb-3">
                <CustomerLocationPlaceName latitude={latitude} longitude={longitude} />
              </div>
            )}
            {hasLocation ? (
              readOnly ? (
                <button
                  type="button"
                  onClick={() => setMapModalOpen(true)}
                  className="block w-full text-left"
                  aria-label="Expand map"
                >
                  <CustomerLocationMapEmbed
                    latitude={latitude}
                    longitude={longitude}
                    heightClass="h-48"
                  />
                </button>
              ) : (
                <CustomerLocationMapEmbed
                  latitude={latitude}
                  longitude={longitude}
                  heightClass="h-64"
                />
              )
            ) : !readOnly ? (
              <p className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                Enter latitude and longitude, or use device GPS, to preview the map.
              </p>
            ) : null}
            {coordsLabel ? (
              <p className="mt-2 font-mono text-xs text-slate-600">{coordsLabel}</p>
            ) : null}
          </>
        )}

        {!readOnly && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Latitude">
              <input
                type="number"
                step="any"
                value={latitude ?? ""}
                onChange={(e) => onChange("latitude", e.target.value)}
                className={inputClassName()}
                placeholder="-1.286389"
              />
            </Field>
            <Field label="Longitude">
              <input
                type="number"
                step="any"
                value={longitude ?? ""}
                onChange={(e) => onChange("longitude", e.target.value)}
                className={inputClassName()}
                placeholder="36.817223"
              />
            </Field>
          </div>
        )}

        {geoHint && <p className="mt-2 text-xs text-amber-700">{geoHint}</p>}
        {locationError && (
          <p className="mt-2 text-sm text-red-600">{locationError}</p>
        )}

        {showSaveButton && !readOnly && (
          <div className="mt-3">
            <button
              type="button"
              disabled={!canSaveLocation || savingLocation}
              onClick={onSaveLocation}
              className="rounded-lg border border-[#185FA5] bg-white px-4 py-2 text-sm font-medium text-[#185FA5] hover:bg-[#E6F1FB] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingLocation ? "Saving location…" : "Save location"}
            </button>
            {!canSaveLocation && (
              <p className="mt-1 text-xs text-slate-500">
                Enter both latitude and longitude before saving location.
              </p>
            )}
          </div>
        )}
      </div>

      <CustomerLocationMapModal
        open={mapModalOpen}
        onClose={() => setMapModalOpen(false)}
        latitude={latitude}
        longitude={longitude}
        title={mapModalTitle}
        subtitle={mapModalSubtitle}
      />
    </div>
  );
}
